// Debate pages: the feedback board, training and notes. Mixed into DebateView.

import { h, icon } from '../../ui.js';
import { readProps, writeProps, isBP } from './records.js';
import { COLUMNS, setTrial, setVerdict, setStatus, planMonth, addDrillLog } from './board.js';

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DIM_COLORS = { Analysis: 'is-purple', Strategy: 'is-amber', Execution: 'is-blue', Meta: 'is-grey' };
const CLUSTERS = {
  Analysis: ['Mechanism depth', 'Characterisation', 'Principled reasoning', 'Matter'],
  Strategy: ['Round vision', 'Win path selection', 'Weighing and comparison', 'Charity', 'Position play'],
  Execution: ['Structure and signposting', 'Efficiency', 'Manner and rhetoric', 'Flowing and tracking', 'Flowing', 'Structure'],
  Meta: ['Prep process', 'Partner work'],
};
const clusterOf = (dimension) => Object.keys(CLUSTERS).find((c) => CLUSTERS[c].some((d) => String(dimension).toLowerCase().startsWith(d.toLowerCase()))) || 'Meta';

export const morePages = {
  // ---------- Board ----------

  boardPage() {
    const cards = this.data.cards;
    const open = cards.find((k) => k.path === this.state.path) || cards.find((k) => k.column === '2 In Progress') || null;
    const columns = COLUMNS.map((col) => {
      const inCol = cards.filter((k) => k.column === col.folder);
      return h('section', { class: 'deb-column', 'aria-label': col.name },
        h('div', { class: 'deb-column-head' }, h('h2', null, `${col.folder.slice(0, 1)} ${col.name}`), h('span', { class: `deb-mono${col.cap && inCol.length >= col.cap ? ' is-warn' : ''}` }, col.cap ? `${inCol.length} / ${col.cap}` : String(inCol.length))),
        inCol.length ? inCol.map((k) => h('button', { type: 'button', class: `deb-board-card${open && k.path === open.path ? ' is-on' : ''}`, onclick: () => { this.state.path = k.path; this.render(); } },
          h('span', { class: `deb-tag ${DIM_COLORS[clusterOf(k.dimension)]}` }, clusterOf(k.dimension)),
          h('b', null, k.title),
          h('small', null, k.column === '2 In Progress' ? `trial ${k.trial.filter((t) => t.result).length} of ${k.trial.length || 3}` : k.rounds.join(', ')))) : h('p', { class: 'deb-empty is-small' }, '—'));
    });
    const reviewDue = (() => {
      const parked = cards.filter((k) => k.column === '3 Parked' && k.opened);
      if (!parked.length) return null;
      const oldest = parked.map((k) => k.opened).sort()[0];
      const due = new Date(`${oldest}T12:00`);
      due.setDate(due.getDate() + 56);
      return `Reread Parked by ${due.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
    })();
    return h('div', { class: 'deb-page' },
      this.head('One card per weakness · 2 in progress at most · review every 8 weeks', 'Board.', reviewDue ? h('span', { class: 'deb-tag' }, reviewDue) : null),
      cards.length ? h('div', { class: 'deb-split is-board' },
        h('div', { class: 'deb-columns' }, columns),
        open ? this.cardDetail(open) : null)
        : h('div', { class: 'deb-stack' }, h('div', { class: 'deb-columns is-wide' }, columns), this.empty(this.data.template ? 'No cards yet. Fill in Form 2 for a round, pick a skill and a priority, and a card appears here.' : 'No cards yet, and no Feedback/_Card Template.md to make them from.')));
  },

  cardDetail(k) {
    const write = (change) => this.save(async () => this.io.write(k.path, change(await this.io.read(k.path))));
    const moveTo = async (col) => {
      if (col.cap && this.data.cards.filter((c) => c.column === col.folder).length >= col.cap) {
        alert(`${col.folder} already has ${col.cap} cards. Running 3 fixes at once means you can't tell which one moved the result — finish or park one first.`);
        return;
      }
      await this.save(async () => {
        const text = setStatus(await this.io.read(k.path), col.status, todayKey());
        await this.io.write(k.path, text);
        const path = await this.io.move(k.path, `${this.io.folder}/Feedback/${col.folder}`);
        this.state.path = path;
      });
    };
    const levels = ['Mini', 'Micro', 'Macro'];
    return h('article', { class: 'deb-detail is-card', 'aria-label': k.title },
      h('div', { class: 'deb-detail-top' },
        h('span', { class: 'deb-chips' },
          h('span', { class: `deb-tag ${DIM_COLORS[clusterOf(k.dimension)]}` }, clusterOf(k.dimension)),
          h('span', { class: 'deb-tag' }, `${COLUMNS.find((c) => c.folder === k.column).name}${k.level ? ` · ${k.level.toLowerCase()}` : ''}`)),
        h('span', { class: 'deb-muted' }, [k.opened ? `opened ${k.opened}` : '', k.closed ? `closed ${k.closed}` : ''].filter(Boolean).join(' · '))),
      h('h2', { class: 'deb-detail-motion' }, k.title),
      h('section', { class: 'deb-sub' }, h('h3', null, 'Evidence'),
        k.evidence.length ? k.evidence.map((e) => h('blockquote', { class: 'deb-quote' }, e)) : this.empty('No evidence written yet.'),
        k.rounds.length ? h('p', { class: 'deb-small' }, `Seen in ${k.rounds.join(', ')}`) : null),
      k.cause ? h('section', { class: 'deb-sub is-row' }, h('h3', null, 'Cause'), h('span', null, k.cause)) : null,
      h('section', { class: 'deb-sub' }, h('h3', null, 'The fix'),
        levels.map((l) => h('div', { class: `deb-fix${(k.level || 'Mini').toLowerCase() === l.toLowerCase() ? ' is-on' : ''}` }, h('small', null, l), h('span', null, k.fix[l] || '—')))),
      k.trial.length ? h('section', { class: 'deb-sub' }, h('h3', null, 'Trial · the next 3 rounds'),
        k.trial.map((t) => h('div', { class: 'deb-trial' },
          h('span', { class: 'deb-mono' }, t.round),
          h('span', { class: 'deb-chips' }, ['Held', 'Decayed', 'Failed'].map((v) => this.chip(v, t.result === v.toLowerCase(), () => write((text) => setTrial(text, t.round, t.result === v.toLowerCase() ? '' : v)), `is-small is-${v.toLowerCase()}`)))))) : null,
      k.verdicts.length ? h('section', { class: 'deb-sub' }, h('h3', null, 'Verdict'),
        k.verdicts.map((v, i) => h('label', { class: 'deb-check' },
          h('input', { type: 'radio', name: `verdict-${k.path}`, checked: v.done ? true : null, onchange: () => write((text) => setVerdict(text, i)) }),
          v.text.replace(/`/g, '')))) : null,
      h('div', { class: 'deb-inline' },
        h('span', { class: 'deb-small' }, 'Move to'),
        COLUMNS.filter((c) => c.folder !== k.column).map((c) => this.button(c.name, () => moveTo(c), 'ghost')),
        this.button('Open the note', () => this.io.open(k.path), 'ghost')));
  },

  // ---------- Training ----------

  trainingPage() {
    const plan = this.data.plan;
    if (!plan) return h('div', { class: 'deb-page' }, this.head('Training', 'Training.'), this.empty('No Training/Training Plan.md in your debate folder.'));
    const month = planMonth(plan.start);
    const phase = month ? plan.phases.find((p) => month >= p.from && month <= p.to) : null;
    const total = plan.phases.length ? Math.max(...plan.phases.map((p) => p.to)) : 0;
    const today = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];
    const week = h('section', { class: 'deb-week', 'aria-label': 'This week' }, plan.week.map((d) => {
      const isToday = d.day.slice(0, 3) === today;
      const off = /^off$/i.test(d.block);
      return h('div', { class: `deb-day${isToday ? ' is-today' : ''}${off ? ' is-off' : ''}` },
        h('span', { class: 'deb-day-top' }, h('span', null, isToday ? 'Today' : d.day), h('span', { class: 'deb-mono' }, d.hours && d.hours !== '0' ? `${d.hours} h` : '')),
        h('b', null, d.block),
        h('small', null, d.content));
    }));
    const setStart = (anchor) => {
      const input = h('input', { class: 'deb-input', type: 'month', value: plan.start || '', 'aria-label': 'Month the plan started' });
      this.openPop(anchor, h('div', { class: 'deb-pop-body' }, h('b', null, 'When did the plan start?'), input,
        h('div', { class: 'deb-inline' }, this.button('Save', () => {
          if (!input.value) return;
          this.save(async () => {
            const { props, body } = readProps(await this.io.read(this.data.planPath));
            props['plan-start'] = input.value;
            await this.io.write(this.data.planPath, writeProps(props, body));
          });
        }, 'primary'), this.button('Cancel', () => this.closePop(), 'ghost'))));
      input.focus();
    };
    const phaseCard = plan.phases.length ? h('section', { class: 'deb-phase', 'aria-label': 'Phase' },
      h('div', { class: 'deb-card-head' },
        h('h2', null, phase ? `Phase ${phase.n} · ${phase.name}` : `${plan.phases.length} phases`, phase ? h('small', null, ` · months ${phase.from} to ${phase.to}`) : null),
        month ? h('span', null, `month ${month} of ${total}`) : this.button('Set when the plan started', (e) => setStart(e.currentTarget), 'ghost')),
      h('div', { class: 'deb-phase-bar' }, plan.phases.map((p) => h('span', { class: `deb-phase-part${phase && p.n === phase.n ? ' is-on' : month && p.to < month ? ' is-done' : ''}`, style: `flex: ${p.to - p.from + 1}` },
        h('small', null, p.name)))),
      (phase || plan.phases[0]).milestone ? h('p', { class: 'deb-small is-strong' }, h('b', null, 'Milestone. '), (phase || plan.phases[0]).milestone) : null) : null;

    const lean = phase ? plan.leans[phase.n] || [] : [];
    const fixCard = this.data.cards.find((k) => k.column === '2 In Progress');
    const fixWords = fixCard ? String(fixCard.dimension).toLowerCase().split(/\s+/)[0] : '';
    const counts = {};
    for (const l of this.data.drillLog) counts[l.n] = (counts[l.n] || 0) + 1;
    const drills = this.card('Drill bank', lean.length ? h('span', { class: 'deb-muted' }, `Phase ${phase.n} leans on ${lean.join(', ')}`) : null,
      plan.drills.map((d) => {
        const matches = fixWords && `${d.fixes} ${d.name}`.toLowerCase().includes(fixWords === 'flowing' ? 'round vision' : fixWords);
        return h('div', { class: `deb-drill${matches ? ' is-match' : ''}` },
          h('span', { class: 'deb-mono deb-muted' }, String(d.n).padStart(2, '0')),
          h('span', { class: 'deb-drill-name' },
            h('b', null, d.name, lean.includes(d.n) ? h('span', { class: 'deb-badge is-purple' }, `phase ${phase.n}`) : null, matches ? h('span', { class: 'deb-badge is-amber' }, 'matches your fix') : null),
            h('small', null, d.method)),
          h('span', { class: 'deb-small deb-right' }, d.fixes),
          h('span', { class: 'deb-mono deb-muted deb-right' }, d.time),
          h('span', { class: 'deb-mono deb-muted deb-right' }, counts[d.n] ? `${counts[d.n]}×` : ''),
          this.button('Log', () => this.save(async () => {
            const path = this.data.logPath;
            if (path) await this.io.write(path, addDrillLog(await this.io.read(path), todayKey(), d));
            else await this.io.create(`${this.io.folder}/Training`, 'Drill log', addDrillLog('', todayKey(), d));
          }).then(() => this.flash(`Logged · ${d.name}`)), 'ghost'));
      }));

    let areaNow = -1;
    if (plan.start && plan.areas.length) {
      const [y, m] = plan.start.split('-').map(Number);
      const weeks = Math.floor((Date.now() - new Date(y, m - 1, 1).getTime()) / (7 * 86400000));
      if (weeks >= 0) areaNow = Math.floor(weeks / plan.areaWeeks) % plan.areas.length;
    }
    const matter = plan.areas.length ? this.card('Matter cycle', h('span', { class: 'deb-muted' }, `${plan.areaWeeks} weeks an area`),
      plan.areas.map((a, i) => h('div', { class: `deb-area${i === areaNow ? ' is-now' : ''}` }, h('span', { class: `deb-area-dot${i === areaNow ? ' is-now' : i < areaNow ? ' is-done' : ''}` }), h('span', null, a), i === areaNow ? h('small', null, 'now') : null))) : null;

    // Targets, with progress where it can be counted from the notes.
    const since = plan.start || '';
    const bpRounds = since ? this.data.rounds.filter((r) => isBP(r.format) && String(r.date) >= since).length : null;
    const comps = since ? this.speakingComps().filter((c) => Number(c.year) >= Number(since.slice(0, 4))).length : null;
    const rooms = since ? this.data.comps.filter((c) => c.role === 'adjudicator' && Number(c.year) >= Number(since.slice(0, 4))).reduce((s, c) => s + c.rooms, 0) : null;
    const now = { 'BP rounds': bpRounds, 'Comps entered': comps, 'Rooms judged': rooms };
    const targets = plan.tracking.length ? this.card(`${total ? `${total}-month ` : ''}targets`, null,
      plan.tracking.map((t) => {
        const goal = Number((/\d+/.exec(t.target) || [])[0]);
        const have = now[t.metric];
        return h('div', { class: 'deb-target' },
          h('span', { class: 'deb-target-top' }, h('span', null, t.metric), h('span', { class: 'deb-mono' }, have != null && goal ? `${have} / ${goal}` : t.target)),
          have != null && goal ? h('span', { class: 'deb-bar' }, h('span', { class: 'deb-bar-fill is-blue', style: `width: ${Math.min(100, (have / goal) * 100)}%` })) : null);
      })) : null;

    return h('div', { class: 'deb-page' },
      this.head(plan.intro.split('.')[0] || 'Training', 'Training.', this.button('Open Training Plan', () => this.io.open(this.data.planPath), 'ghost')),
      plan.week.length ? week : null,
      phaseCard,
      h('div', { class: 'deb-split' }, drills, h('div', { class: 'deb-stack' }, matter, targets)));
  },

  // ---------- Notes ----------

  notesPage() {
    const skip = /^(Motions|Competitions|Rounds|Feedback|Training)(\/|$)/;
    const files = this.data.files.filter((f) => !skip.test(this.rel(f.path)));
    const shelves = new Map();
    for (const f of files) {
      const parts = this.rel(f.path).split('/');
      const shelf = parts.length > 1 ? parts[0] : 'In Debate';
      if (!shelves.has(shelf)) shelves.set(shelf, []);
      shelves.get(shelf).push(f);
    }
    const kind = (name) => (/\.pdf$/i.test(name) ? ['PDF', 'is-red'] : /\.md$/i.test(name) ? ['Note', ''] : [name.split('.').pop().toUpperCase(), 'is-blue']);
    const fix = this.data.cards.find((k) => k.column === '2 In Progress');
    const words = fix ? String(fix.dimension).toLowerCase().split(/\s+/).filter((w) => w.length > 3 && !['and', 'with'].includes(w)) : [];
    const forFix = words.length ? files.filter((f) => words.some((w) => f.name.toLowerCase().includes(w))) : [];
    const q = (this.ui.noteSearch || '').toLowerCase();
    const search = h('input', { class: 'deb-search-input', placeholder: 'Search your debate notes', 'aria-label': 'Search notes', value: this.ui.noteSearch || '' });
    search.addEventListener('input', () => {
      this.ui.noteSearch = search.value;
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => {
        this.render();
        const again = this.root.querySelector('.deb-search-input');
        if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
      }, 160);
    });
    const tile = (f) => {
      const [label, cls] = kind(f.name);
      const sub = this.rel(f.path).split('/').slice(1, -1).join(' / ');
      return h('button', { type: 'button', class: 'deb-note', onclick: () => this.io.open(f.path) },
        h('span', { class: `deb-tag ${cls}` }, label),
        h('b', null, f.name.replace(/\.[^.]+$/, '')),
        sub ? h('small', null, sub) : null);
    };
    const order = ['In Debate', 'Notes', 'Matter Files', 'Speeches'];
    const names = [...shelves.keys()].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b));
    return h('div', { class: 'deb-page' },
      this.head('Notes · matter · speeches', 'Notes.', h('label', { class: 'deb-search' }, icon('search', 15), search)),
      forFix.length ? h('section', { class: 'deb-notice is-amber' }, h('b', null, `For the fix you’re running (${fix.title})`), h('div', { class: 'deb-chips' }, forFix.map((f) => h('button', { type: 'button', class: 'deb-chip', onclick: () => this.io.open(f.path) }, f.name.replace(/\.[^.]+$/, ''))))) : null,
      names.map((name) => {
        const list = shelves.get(name).filter((f) => !q || f.name.toLowerCase().includes(q));
        if (!list.length) return null;
        return h('section', { class: 'deb-shelf' },
          h('div', { class: 'deb-card-head' }, h('h2', null, name), h('span', { class: 'deb-muted' }, `${list.length} item${list.length === 1 ? '' : 's'}`)),
          h('div', { class: 'deb-notes' }, list.sort((a, b) => a.name.localeCompare(b.name)).map(tile)));
      }));
  },
};
