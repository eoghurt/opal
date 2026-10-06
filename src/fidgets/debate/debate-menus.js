// Right-click (or double-click) menus on the Debate page: edit, delete, open
// the note behind it, show it in Finder… Mixed into DebateView.

import { askChoice } from '../../ui.js';
import { showMenu } from '../../context-menu.js';
import { setLineTag, changeMotionLine } from './motions.js';
import { COLUMNS } from './board.js';

const short = (text, n = 40) => (String(text).length > n ? `${String(text).slice(0, n - 1)}…` : String(text));

export const menuPages = {
  // Opens `build(el)`'s menu on right-click or double-click; → el.
  withMenu(el, build) {
    const open = (e) => {
      if (e.target.closest('input, textarea, select')) return;
      this.closePop();
      showMenu(e, build(el));
    };
    el.addEventListener('contextmenu', open);
    el.addEventListener('dblclick', open);
    return el;
  },

  // Items every note-backed thing shares.
  fileItems(path, { openLabel = 'Open the note' } = {}) {
    return [
      { label: openLabel, onSelect: () => this.io.open(path) },
      { label: 'Show in Finder', onSelect: () => this.io.reveal(path) },
      { label: 'Copy vault path', hint: short(path, 26), onSelect: () => this.io.copy(path) },
    ];
  },

  async confirmDelete(what, detail) {
    const ok = await askChoice(`Delete ${what}?${detail ? ` ${detail}` : ''}`, [{ label: 'Delete', value: 'yes' }]);
    return Boolean(ok);
  },

  // ---------- Motions ----------

  motionMenu(m, el) {
    const select = () => { this.state.id = m.id; };
    return {
      title: short(m.text),
      items: [
        { label: 'Edit…', onSelect: () => { select(); this.render(); this.editMotionPop(m, this.root.querySelector('.deb-detail .deb-btn') || el); } },
        { label: 'Topics…', hint: `${m.topics.length} of 3`, onSelect: () => { select(); this.render(); this.topicPicker(m, this.root.querySelector('.deb-detail .deb-pill-add') || el); } },
        m.fromPrep ? null : { label: m.starred ? 'Unstar' : 'Star', onSelect: () => this.save(() => this.editLine(m, (line) => setLineTag(line, 'starred', !m.starred))) },
        'separator',
        ...[15, 30, 60].map((min) => ({ label: `Prep · ${min} min`, hint: m.prep ? 'again' : '', onSelect: () => { this.ui.prep = min; this.startPrep(m); } })),
        m.prep ? { label: 'Open the prep note', onSelect: () => this.io.open(m.prep.path) } : null,
        'separator',
        { label: 'Copy the motion', onSelect: () => this.io.copy(m.info ? `${m.text}\nInfo slide: ${m.info}` : m.text) },
        ...this.fileItems(m.path, { openLabel: m.fromPrep ? 'Open the prep note' : `Open “${short(m.source, 22)}”` }),
        'separator',
        { label: m.fromPrep ? 'Delete the prep note' : 'Delete the motion', danger: true, onSelect: () => this.deleteMotion(m) },
      ],
    };
  },

  async deleteMotion(m) {
    if (m.fromPrep) {
      if (!(await this.confirmDelete('this prep note', 'It goes to the Trash.'))) return;
      await this.save(() => this.io.trash(m.path));
      return;
    }
    if (!(await this.confirmDelete('this motion', `It's taken out of “${m.source}”.`))) return;
    await this.save(async () => {
      const text = await this.io.read(m.path);
      // Find the line again, mark it, then drop it (and its info line).
      const marked = changeMotionLine(text, m, () => '\u0000DELETE\u0000');
      const lines = marked.split('\n');
      const at = lines.indexOf('\u0000DELETE\u0000');
      const drop = new Set([at]);
      if (!m.inlineInfo && m.infoLine != null) drop.add(at + (m.infoLine - m.line));
      const out = lines.filter((_, i) => !drop.has(i));
      // No doubled blank line where it was.
      if (out[at - 1] !== undefined && !out[at - 1].trim() && out[at] !== undefined && !out[at].trim()) out.splice(at, 1);
      await this.io.write(m.path, out.join('\n'));
    });
    if (this.state.id === m.id) this.state.id = null;
  },

  // ---------- Competitions and rounds ----------

  compMenu(c) {
    return {
      title: short(`${c.name} ${c.year}`),
      items: [
        { label: 'Open', onSelect: () => this.go('comp', { path: c.path }) },
        c.role === 'speaker' ? { label: 'Log a round here', onSelect: () => this.go('log', { tab: 1, comp: c.path }) } : null,
        c.tab ? { label: 'Open the tab', hint: '↗', onSelect: () => window.open(c.tab, '_blank', 'noopener') } : null,
        'separator',
        ...this.fileItems(c.path),
        'separator',
        { label: 'Delete the competition', danger: true, onSelect: async () => {
          const rounds = this.roundsOf(c).length;
          if (!(await this.confirmDelete(`“${c.name} ${c.year}”`, `Its note goes to the Trash${rounds ? ` (its ${rounds} round note${rounds === 1 ? '' : 's'} stay)` : ''}.`))) return;
          await this.save(() => this.io.trash(c.path));
          if (this.state.page === 'comp') this.go('comps');
        } },
      ],
    };
  },

  roundMenu(r) {
    return {
      title: r.round_id,
      items: [
        { label: 'Form 1', hint: 'edit', onSelect: () => this.go('log', { tab: 1, path: r.path }) },
        { label: r.form2 ? 'Form 2' : 'Fill in Form 2', hint: r.form2 ? 'edit' : 'still to do', onSelect: () => this.go('log', { tab: 2, path: r.path }) },
        'separator',
        ...this.fileItems(r.path),
        'separator',
        { label: 'Delete the round', danger: true, onSelect: async () => {
          if (!(await this.confirmDelete(r.round_id, 'Its note goes to the Trash; cards that mention it keep their evidence.'))) return;
          await this.save(() => this.io.trash(r.path));
        } },
      ],
    };
  },

  // ---------- Board ----------

  cardMenu(k) {
    return {
      title: short(k.title),
      items: [
        { label: 'Open', onSelect: () => { this.state.path = k.path; this.render(); } },
        ...COLUMNS.filter((c) => c.folder !== k.column).map((c) => ({ label: `Move to ${c.name}`, onSelect: () => this.moveCard(k, c) })),
        'separator',
        ...this.fileItems(k.path),
        'separator',
        { label: 'Delete the card', danger: true, onSelect: async () => {
          if (!(await this.confirmDelete(`the card “${short(k.title, 30)}”`, 'It goes to the Trash.'))) return;
          await this.save(() => this.io.trash(k.path));
        } },
      ],
    };
  },

  // ---------- Notes and training ----------

  noteMenu(f) {
    return { title: f.name, items: this.fileItems(f.path, { openLabel: 'Open' }) };
  },

  drillMenu(d, log) {
    return {
      title: d.name,
      items: [
        { label: 'Log it', hint: 'today', onSelect: log },
        { label: 'Open the drill log', onSelect: () => this.data.logPath && this.io.open(this.data.logPath) },
        { label: 'Open Training Plan', onSelect: () => this.io.open(this.data.planPath) },
      ],
    };
  },
};
