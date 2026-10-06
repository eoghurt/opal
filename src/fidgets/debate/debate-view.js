// Debate: a page of its own for the debate folder — motions, competitions,
// logging rounds (the two feedback forms), the feedback board, training and
// notes, down a slim rail on the left. Everything is read from and written to
// the notes in the folder (see motions.js, records.js, board.js); nothing is
// kept anywhere else.
//
//   new DebateView(container, { page, io })
//   io: folder, files() → [{ path, name }], read(path), write(path, text),
//       create(folder, name, text) → path, move(path, folder) → path,
//       open(path), startPrep(minutes), onChange({ page })

import { h, icon, askChoice } from '../../ui.js';
import { parseMotionNote, prepMotion, likeness, wordingDiff, setLineTag, changeMotionLine, versionName } from './motions.js';
import { readCompetition, readRound, readRecord, broke, speakerRank, isBP, placing, median, DIMENSIONS } from './records.js';
import { COLUMNS, readCard, readTrainingPlan, readDrillLog, readDashboard } from './board.js';
import { formsPages } from './debate-forms.js';
import { morePages } from './debate-more.js';

const RAIL = [
  ['overview', 'Overview', 'fidget'],
  ['motions', 'Motions', 'motions'],
  ['comps', 'Comps', 'trophy'],
  ['log', 'Log', 'logRound'],
  ['board', 'Board', 'kanban'],
  ['training', 'Training', 'training'],
  ['notes', 'Notes', 'notebook'],
];

// The gating chain (Workflow): fix the most upstream one first.
export const CHAIN = [
  ['Flowing and tracking', 'gates round vision'],
  ['Round vision', 'gates win path selection'],
  ['Win path selection', 'gates weighing'],
  ['Weighing and comparison', ''],
];

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export class DebateView {
  constructor(container, { page, io }) {
    this.container = container;
    this.io = io;
    this.state = { page: RAIL.some(([id]) => id === (page && page.id)) ? page.id : 'overview', ...(page || {}) };
    this.ui = { source: 'All', topic: null, show: {}, search: '', prep: 30, draw: 0, compsTab: 'speaking' };
    this.root = h('div', { class: 'deb' });
    container.replaceChildren(this.root);
    this.root.append(h('p', { class: 'deb-muted' }, 'Opening your debate folder…'));
    this.load();
  }

  destroy() {
    this.closePop();
  }

  rel(path) {
    return path.slice(this.io.folder.length + 1);
  }

  async load() {
    const files = this.io.files();
    const read = async (path) => {
      try {
        return await this.io.read(path);
      } catch {
        return '';
      }
    };
    const group = (test) => files.filter((f) => /\.md$/i.test(f.name) && test(this.rel(f.path)));
    const motionFiles = group((r) => /^Motions\/[^/]+$/.test(r));
    const prepFiles = group((r) => /^Motions\/Practice preps\//.test(r));
    const compFiles = group((r) => /^Competitions\//.test(r));
    const roundFiles = group((r) => /^Rounds\//.test(r));
    const cardFiles = group((r) => COLUMNS.some((c) => r.startsWith(`Feedback/${c.folder}/`)));
    const at = (r) => files.find((f) => this.rel(f.path) === r);
    const [motionTexts, prepTexts, compTexts, roundTexts, cardTexts, plan, log, dash, template] = await Promise.all([
      Promise.all(motionFiles.map((f) => read(f.path))),
      Promise.all(prepFiles.map((f) => read(f.path))),
      Promise.all(compFiles.map((f) => read(f.path))),
      Promise.all(roundFiles.map((f) => read(f.path))),
      Promise.all(cardFiles.map((f) => read(f.path))),
      at('Training/Training Plan.md') ? read(at('Training/Training Plan.md').path) : '',
      at('Training/Drill log.md') ? read(at('Training/Drill log.md').path) : '',
      at('Dashboard.md') ? read(at('Dashboard.md').path) : '',
      at('Feedback/_Card Template.md') ? read(at('Feedback/_Card Template.md').path) : '',
    ]);
    const motions = motionFiles.flatMap((f, i) => parseMotionNote(motionTexts[i], { path: f.path, source: f.name.replace(/\.md$/i, '') }));
    const preps = prepFiles.map((f, i) => ({ path: f.path, name: f.name.replace(/\.md$/i, ''), text: prepTexts[i], ...(prepMotion(prepTexts[i]) || { text: '' }) }));
    // A prep note with no matching motion in the bank is a motion too.
    for (const p of preps) {
      if (!p.text) continue;
      const match = motions.find((m) => m.text === p.text || likeness(m.text, p.text) > 0.8);
      if (match) match.prep = p;
      else motions.push({ id: p.path, text: p.text, info: p.info || '', topic: '', round: '', source: 'Practice preps', path: p.path, line: 0, raw: p.text, starred: false, version: null, prep: p, fromPrep: true });
    }
    this.data = {
      files,
      motions,
      preps,
      comps: compFiles.map((f, i) => readCompetition(compTexts[i], f.path)).filter(Boolean),
      rounds: roundFiles.map((f, i) => readRound(roundTexts[i], f.path)).filter(Boolean).sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.path.localeCompare(a.path)),
      cards: cardFiles.map((f, i) => readCard(cardTexts[i], f.path, COLUMNS.find((c) => this.rel(f.path).startsWith(`Feedback/${c.folder}/`)).folder)),
      plan: plan ? readTrainingPlan(plan) : null,
      planPath: at('Training/Training Plan.md')?.path || null,
      drillLog: readDrillLog(log),
      logPath: at('Training/Drill log.md')?.path || null,
      dashboard: readDashboard(dash),
      dashboardPath: at('Dashboard.md')?.path || null,
      template,
      schoolsPath: at('Schools Record.md')?.path || null,
      judgingPath: at('Adjudication Record.md')?.path || null,
    };
    for (const m of this.data.motions) m.run = this.data.rounds.some((r) => r.motion && (r.motion === m.text || likeness(r.motion, m.text) > 0.8));
    this.render();
  }

  reload() {
    if (this.pop || this.typing) return null;
    return this.load();
  }

  go(page, extra = {}) {
    this.closePop();
    this.state = { page, ...extra };
    this.io.onChange({ page: this.state });
    this.render();
    this.root.scrollIntoView?.({ block: 'start' });
  }

  // Writes, then reads everything again.
  async save(fn) {
    this.closePop();
    try {
      await fn();
    } catch (err) {
      alert(`Couldn't save that.\n\n${err.message}`);
    }
    await this.load();
  }

  flash(text) {
    this.root.querySelectorAll('.deb-flash').forEach((n) => n.remove());
    const note = h('div', { class: 'deb-flash', role: 'status' }, text);
    this.root.append(note);
    setTimeout(() => note.remove(), 2200);
  }

  // ---------- Shared pieces ----------

  chip(label, on, onclick, extra = '') {
    return h('button', { type: 'button', class: `deb-chip${on ? ' is-on' : ''}${extra ? ` ${extra}` : ''}`, 'aria-pressed': String(Boolean(on)), onclick }, label);
  }

  card(title, extra, ...children) {
    return h('section', { class: 'deb-card', 'aria-label': title },
      title ? h('div', { class: 'deb-card-head' }, h('h2', null, title), extra || null) : null,
      ...children);
  }

  empty(text) {
    return h('p', { class: 'deb-empty' }, text);
  }

  head(kicker, title, ...actions) {
    return h('header', { class: 'deb-head' },
      h('div', { class: 'deb-title' },
        h('span', { class: 'deb-kicker' }, kicker),
        h('h1', { class: 'deb-h1' }, title)),
      actions.length ? h('div', { class: 'deb-actions' }, ...actions) : null);
  }

  button(label, onclick, kind = '') {
    return h('button', { type: 'button', class: `deb-btn${kind ? ` is-${kind}` : ''}`, onclick }, label);
  }

  prepBox(motion, { tint = true } = {}) {
    const times = h('div', { class: 'deb-seg', role: 'radiogroup', 'aria-label': 'Prep time' },
      [15, 30, 60].map((m) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(this.ui.prep === m), class: `deb-seg-btn${this.ui.prep === m ? ' is-on' : ''}`,
        onclick: () => { this.ui.prep = m; this.render(); },
      }, `${m} min`)));
    return h('div', { class: `deb-prep${tint ? ' is-tint' : ''}` },
      times,
      this.button('Start prep', () => this.startPrep(motion), 'primary'));
  }

  // A prep note in Motions/Practice preps (the motion, its info slide, then
  // Aff / Neg), opened with the timer running.
  async startPrep(motion) {
    let path = motion.prep && motion.prep.path;
    if (!path) {
      const name = motion.text.replace(/^(?:TH[A-Z]{0,3}|TH,|That|This House)\s*/i, '').replace(/[\\/:*?"<>|#^[\]]/g, ' ').split(/\s+/).slice(0, 6).join(' ');
      const text = `${motion.text}\n${motion.info ? `IS: ${motion.info}\n` : ''}### Aff\n\n\n### Neg\n\n`;
      path = await this.io.create(`${this.io.folder}/Motions/Practice preps`, name.replace(/^./, (c) => c.toUpperCase()), text);
    }
    await this.io.open(path);
    this.io.startPrep(this.ui.prep);
  }

  // ---------- Drawing ----------

  render() {
    if (!this.data) return;
    this.closePop();
    const page = this.state.page;
    const rail = h('nav', { class: 'deb-rail', 'aria-label': 'Debate' },
      RAIL.map(([id, label, ic]) => h('button', {
        type: 'button',
        class: `deb-rail-btn${page === id || (page === 'comp' && id === 'comps') ? ' is-on' : ''}`,
        'aria-current': page === id ? 'page' : null,
        onclick: () => this.go(id),
      }, icon(ic, 20), h('span', null, label))));
    const pages = {
      overview: () => this.overview(),
      motions: () => this.motionsPage(),
      comps: () => this.compsPage(),
      comp: () => this.compPage(),
      log: () => this.logPage(),
      board: () => this.boardPage(),
      training: () => this.trainingPage(),
      notes: () => this.notesPage(),
    };
    let main;
    try {
      main = (pages[page] || pages.overview)();
    } catch (err) {
      main = this.empty(`Something went wrong drawing this page: ${err.message}`);
    }
    this.root.replaceChildren(rail, h('main', { class: 'deb-main' }, main));
  }

  // ---------- Overview ----------

  speakingComps() {
    return this.data.comps.filter((c) => c.role === 'speaker');
  }

  // A competition's rounds logged in Opal.
  roundsOf(comp) {
    const base = comp.path.split('/').pop().replace(/\.md$/i, '');
    return this.data.rounds.filter((r) => r.competitionName === base || (comp.short && String(r.round_id || '').startsWith(`${comp.short}-`)));
  }

  // Won / of for two-team formats; average placing for BP.
  // The recorded result stands until at least that many rounds are logged.
  recordOf(comp) {
    const rounds = this.roundsOf(comp).filter((r) => !/^(Practice|Internal)$/.test(r.round));
    const recorded = readRecord(comp.record);
    if (recorded && rounds.length < recorded.of) return recorded;
    const bp = rounds.filter((r) => isBP(r.format) && placing(r.result));
    if (bp.length) {
      const places = bp.map((r) => placing(r.result));
      return { bp: true, avg: places.reduce((a, b) => a + b, 0) / places.length, places };
    }
    const decided = rounds.filter((r) => /^(win|loss)$/i.test(r.result));
    if (decided.length) return { won: decided.filter((r) => /^win$/i.test(r.result)).length, of: decided.length };
    return readRecord(comp.record);
  }

  overview() {
    const comps = this.speakingComps();
    const years = comps.map((c) => Number(c.year)).filter(Boolean);
    const now = new Date();
    let won = 0;
    let of = 0;
    for (const c of comps) {
      const r = this.recordOf(c);
      if (r && !r.bp) {
        won += r.won;
        of += r.of;
      }
    }
    const breaks = comps.filter((c) => broke(c.placing)).length;
    const roomsThisYear = this.data.comps.filter((c) => c.role === 'adjudicator' && Number(c.year) === now.getFullYear()).reduce((s, c) => s + c.rooms, 0);

    // Timeline: competitions by year (their order within a year as recorded).
    let timeline = null;
    if (years.length) {
      const first = Math.min(...years);
      const last = Math.max(now.getFullYear(), ...years);
      const span = last - first + 1;
      const track = h('div', { class: 'deb-timeline' }, h('span', { class: 'deb-timeline-line' }));
      for (let y = first; y <= last; y++) track.append(h('span', { class: 'deb-timeline-year', style: `left: ${((y - first) / span) * 100}%` }, String(y)));
      for (let y = first; y <= last; y++) {
        const inYear = comps.filter((c) => Number(c.year) === y).reverse();
        inYear.forEach((c, i) => {
          const rec = this.recordOf(c);
          const size = 10 + Math.min(8, rec ? (rec.of || rec.places.length) : 1) * 2;
          const left = ((y - first + (i + 1) / (inYear.length + 1)) / span) * 100;
          track.append(h('button', {
            type: 'button',
            class: `deb-dot${broke(c.placing) ? ' is-broke' : ''}`,
            style: `left: calc(${left}% - ${size / 2}px); width: ${size}px; height: ${size}px; top: ${23 - size / 2}px`,
            title: `${c.name} ${c.year}${c.placing ? ` · ${c.placing}` : ''}`,
            'aria-label': `${c.name} ${c.year}`,
            onclick: () => this.go('comp', { path: c.path }),
          }));
        });
      }
      timeline = this.card(`Since ${first}`,
        h('span', { class: 'deb-muted' }, [of ? `${won} of ${of} rounds won` : null, `${breaks} break${breaks === 1 ? '' : 's'}`, roomsThisYear ? `${roomsThisYear} rooms judged this year` : null].filter(Boolean).join(' · ')),
        track,
        h('div', { class: 'deb-legend' },
          h('span', null, h('span', { class: 'deb-dot is-broke is-key' }), 'broke'),
          h('span', null, h('span', { class: 'deb-dot is-key' }), 'didn’t break'),
          h('span', null, 'bigger = more rounds')));
    }

    // A motion to prep: one not prepped yet, the same one all day.
    const fresh = this.data.motions.filter((m) => !m.prep);
    const day = Math.floor(Date.now() / 86400000);
    const motion = fresh.length ? fresh[(day + this.ui.draw) % fresh.length] : null;
    const motionCard = motion ? h('section', { class: 'deb-release', 'aria-label': 'Motion for prep' },
      h('div', { class: 'deb-release-top' }, h('span', { class: 'deb-kicker is-light' }, 'Motion for prep'), h('span', null, [motion.source, motion.round, motion.topic].filter(Boolean).join(' · '))),
      h('p', { class: 'deb-release-motion' }, motion.text),
      motion.info ? h('p', { class: 'deb-release-info' }, motion.info) : null,
      h('div', { class: 'deb-release-actions' },
        this.prepBox(motion, { tint: false }),
        this.button('Another motion', () => { this.ui.draw++; this.render(); }, 'ghost'))) : null;

    // The gating chain, from Form 2 scores of the last 10 rounds.
    const scored = this.data.rounds.filter((r) => Object.keys(r.scores).length).slice(0, 10);
    const chain = this.card('Fix from the top', h('span', { class: 'deb-muted' }, scored.length ? `median, last ${scored.length} round${scored.length === 1 ? '' : 's'}` : ''),
      scored.length ? (() => {
        let flagged = false;
        return CHAIN.map(([dim, note], i) => {
          const m = median(scored.map((r) => r.scores[dim]));
          const weak = m != null && m <= 2 && !flagged;
          if (weak) flagged = true;
          return h('div', { class: 'deb-chain-step' },
            h('div', { class: `deb-chain-box${weak ? ' is-weak' : ''}` },
              h('span', null, h('b', null, dim), h('small', null, weak ? 'fix this first' : note)),
              h('span', { class: `deb-score${m != null && m <= 2 ? ' is-low' : ''}` }, m == null ? '' : String(m))),
            i < CHAIN.length - 1 ? h('span', { class: 'deb-chain-link' }) : null);
        });
      })() : this.empty('Scores appear here once you fill in Form 2 for a round.'));

    // Waiting on you.
    const waiting = [];
    for (const r of this.data.rounds.filter((x) => !x.form2).slice(0, 4)) waiting.push({ what: `Form 2 for ${r.round_id}`, why: r.date ? `Form 1 done ${r.date}` : 'Form 1 done', warn: true, go: () => this.go('log', { tab: 2, path: r.path }) });
    for (const c of comps.filter((x) => Number(x.year) === now.getFullYear() && this.roundsOf(x).length && !Object.values(x.overview).some(Boolean))) waiting.push({ what: `Tournament overview · ${c.name}`, why: 'not written yet', go: () => this.go('comp', { path: c.path }) });
    for (const card of this.data.cards.filter((c) => c.column === '2 In Progress')) {
      const next = card.trial.find((t) => !t.result);
      if (next) waiting.push({ what: `Fix trial ${next.round} · ${card.title}`, why: card.fix.Mini ? `Mini: ${card.fix.Mini}` : '', go: () => this.go('board', { path: card.path }) });
    }
    const todo = this.data.dashboard.todo;
    const waitingCard = this.card('Waiting on you', null,
      waiting.length || todo.length ? [
        ...waiting.map((w) => h('button', { type: 'button', class: 'deb-wait', onclick: w.go },
          h('span', null, w.what), w.why ? h('small', { class: w.warn ? 'is-warn' : '' }, w.why) : null)),
        ...todo.map((t) => h('div', { class: 'deb-wait is-todo' }, h('span', null, t), h('small', null, 'from your Dashboard'))),
      ] : this.empty('Nothing waiting.'));

    // Speaker ranks.
    const ranks = comps.map((c) => ({ c, rank: speakerRank(c.speaks) })).filter((x) => x.rank && x.rank <= 20);
    const goal = Number((/top\s+(\d+)/i.exec(this.data.dashboard.quantitative.join(' ')) || [])[1]) || null;
    const ladderCard = this.card('Speaker ranks', goal ? h('span', { class: 'deb-muted' }, `goal: top ${goal}`) : null,
      ranks.length ? [
        h('div', { class: 'deb-ladder' },
          Array.from({ length: 20 }, (_, i) => {
            const here = ranks.filter((x) => x.rank === i + 1);
            return h('span', { class: `deb-rung${here.length ? ' is-hit' : ''}${goal && i < goal ? ' is-goal' : ''}`, style: here.length ? `height: ${50 + here.length * 30}px` : '', title: here.map((x) => `${x.c.name} ${x.c.year}: ${x.c.speaks}`).join('\n') || null });
          }),
          goal ? h('span', { class: 'deb-ladder-goal', style: `left: ${(goal / 20) * 100}%` }) : null),
        h('div', { class: 'deb-ladder-axis' }, h('span', null, '1st'), goal ? h('span', { class: 'is-goal' }, `${goal}th`) : h('span'), h('span', null, '20th')),
        h('p', { class: 'deb-small' }, ranks.sort((a, b) => b.c.year - a.c.year).map((x) => `${x.c.speaks} at ${x.c.name} ${x.c.year}`).join(' · ')),
      ] : this.empty('No speaker ranks recorded yet.'));

    // Last rounds.
    const last = this.data.rounds.slice(0, 4);
    const lastCard = this.card('Last rounds', null,
      last.length ? last.map((r) => this.ticket(r)) : this.empty('Rounds you log show up here.'));

    const date = now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    return h('div', { class: 'deb-page' },
      this.head(`Debate · ${date}`, 'The floor is yours.', this.button('+ Log a round', () => this.go('log', { tab: 1 }), 'primary')),
      timeline,
      h('div', { class: 'deb-row' }, motionCard, chain),
      h('div', { class: 'deb-grid3' }, waitingCard, ladderCard, lastCard));
  }

  ticket(r) {
    const p = placing(r.result);
    const good = /^win$/i.test(r.result) || (p && p <= 2);
    return h('button', { type: 'button', class: 'deb-ticket', onclick: () => this.go('log', { tab: r.form2 ? 1 : 2, path: r.path }) },
      h('span', { class: `deb-ticket-stripe${good ? ' is-good' : ''}` }),
      h('span', { class: 'deb-ticket-text' },
        h('span', { class: 'deb-mono' }, `${r.round_id}${r.position ? ` · ${r.position}` : ''}`),
        h('small', null, r.motion || '')),
      h('span', { class: `deb-ticket-result${good ? ' is-good' : ''}` }, p ? `${p}${['st', 'nd', 'rd', 'th'][p - 1]}` : (r.result || '').slice(0, 1).toUpperCase()));
  }

  // ---------- Motions ----------

  motionsPage() {
    const all = this.data.motions;
    const sources = ['All', ...new Set(all.map((m) => m.source))];
    const topics = [...new Set(all.map((m) => m.topic).filter(Boolean))];
    const ui = this.ui;
    const q = ui.search.trim().toLowerCase();
    const list = all.filter((m) => (ui.source === 'All' || m.source === ui.source)
      && (!ui.topic || m.topic === ui.topic)
      && (!ui.show.starred || m.starred)
      && (!ui.show.unprepped || !m.prep)
      && (!ui.show.run || m.run)
      && (!ui.show.versions || this.versionsOf(m).length)
      && (!q || `${m.text} ${m.info} ${m.topic}`.toLowerCase().includes(q)));
    const selected = all.find((m) => m.id === this.state.id) || list[0] || null;

    const search = h('input', { class: 'deb-search-input', placeholder: 'Search motions and info slides', 'aria-label': 'Search motions', value: ui.search });
    search.addEventListener('input', () => {
      ui.search = search.value;
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => {
        this.render();
        const again = this.root.querySelector('.deb-search-input');
        if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
      }, 160);
    });
    const count = (s) => (s === 'All' ? all.length : all.filter((m) => m.source === s).length);
    const toggle = (key, label) => h('label', { class: 'deb-check' },
      h('input', { type: 'checkbox', checked: ui.show[key] ? true : null, onchange: (e) => { ui.show[key] = e.target.checked; this.render(); } }), label);
    const filters = h('section', { class: 'deb-filters', 'aria-label': 'Filters' },
      h('div', { class: 'deb-filter-row' }, h('span', { class: 'deb-filter-label' }, 'From'),
        sources.map((s) => this.chip(h('span', null, s, h('small', null, ` ${count(s)}`)), ui.source === s, () => { ui.source = s; this.render(); }))),
      topics.length ? h('div', { class: 'deb-filter-row' }, h('span', { class: 'deb-filter-label' }, 'Topic'),
        topics.map((t) => this.chip(t, ui.topic === t, () => { ui.topic = ui.topic === t ? null : t; this.render(); }, 'is-small'))) : null,
      h('div', { class: 'deb-filter-row' }, h('span', { class: 'deb-filter-label' }, 'Show'),
        toggle('starred', 'Starred'), toggle('unprepped', 'Not prepped yet'), toggle('run', 'Run in a round'), toggle('versions', 'Has other versions')));

    const rows = list.map((m) => {
      const versions = this.versionsOf(m).length;
      return h('div', { class: `deb-motion-row${selected && m.id === selected.id ? ' is-on' : ''}` },
        h('button', { type: 'button', class: 'deb-motion-main', onclick: () => { this.state.id = m.id; this.render(); } },
          h('span', { class: 'deb-motion-meta' },
            [m.source, m.round, m.topic].filter(Boolean).join(' · '),
            m.prep ? h('span', { class: 'deb-badge is-good' }, 'Prepped') : null,
            m.run ? h('span', { class: 'deb-badge is-blue' }, 'Run in a round') : null,
            versions ? h('span', { class: 'deb-badge' }, `${versions + 1} versions`) : null),
          h('span', { class: 'deb-motion-text' }, m.text)),
        m.fromPrep ? null : this.starButton(m));
    });

    return h('div', { class: 'deb-page' },
      this.head(`${all.length} motions · ${all.filter((m) => m.starred).length} starred · ${all.filter((m) => m.prep).length} prepped`, 'Motions.',
        h('label', { class: 'deb-search' }, icon('search', 15), search),
        this.button('+ Motion', (e) => this.addMotion(e.currentTarget), 'primary')),
      filters,
      h('div', { class: 'deb-split' },
        h('section', { class: 'deb-list', 'aria-label': 'Motions' },
          h('div', { class: 'deb-list-head' }, h('span', null, `${ui.source === 'All' ? 'All motions' : ui.source} · ${list.length}`)),
          rows.length ? rows : this.empty('No motions match.')),
        selected ? this.motionDetail(selected) : null));
  }

  starButton(m) {
    return h('button', {
      type: 'button',
      class: `deb-star${m.starred ? ' is-on' : ''}`,
      'aria-pressed': String(m.starred),
      'aria-label': m.starred ? 'Unstar' : 'Star',
      title: m.starred ? 'Unstar' : 'Star',
      onclick: () => this.save(() => this.editLine(m, (line) => setLineTag(line, 'starred', !m.starred))),
    }, icon('star', 18));
  }

  async editLine(motion, change) {
    const text = await this.io.read(motion.path);
    await this.io.write(motion.path, changeMotionLine(text, motion, change));
  }

  versionsOf(m) {
    return m.version ? this.data.motions.filter((o) => o !== m && o.version === m.version) : [];
  }

  motionDetail(m) {
    const versions = this.versionsOf(m);
    const looksLike = this.data.motions
      .filter((o) => o !== m && !o.fromPrep && !(m.version && o.version === m.version) && o.source !== m.source)
      .map((o) => ({ o, score: likeness(m.text, o.text) }))
      .filter((x) => x.score >= 0.45).sort((a, b) => b.score - a.score);
    const prep = m.prep ? m.prep.text || '' : '';
    const side = (name) => {
      const re = new RegExp(`###\\s*(${name})\\s*\\n([\\s\\S]*?)(?=\\n###|$)`, 'i');
      return ((re.exec(prep) || [])[2] || '').trim();
    };
    const aff = m.prep ? side('Aff|Prop|Gov') : '';
    const neg = m.prep ? side('Neg|Opp') : '';
    return h('aside', { class: 'deb-detail', 'aria-label': 'Selected motion' },
      h('div', { class: 'deb-detail-top' },
        h('span', { class: 'deb-muted' }, [m.source, m.round, m.topic].filter(Boolean).join(' · ')),
        m.fromPrep ? null : this.starButton(m)),
      h('h2', { class: 'deb-detail-motion' }, m.text),
      m.info ? h('div', { class: 'deb-info' }, h('b', null, 'Info slide. '), m.info) : null,
      m.prep ? h('div', { class: 'deb-sides' },
        h('div', { class: 'deb-side' }, h('b', null, 'Aff'), h('span', null, aff ? aff.slice(0, 220) : 'nothing yet')),
        h('div', { class: 'deb-side' }, h('b', null, 'Neg'), h('span', null, neg ? neg.slice(0, 220) : 'nothing yet'))) : null,
      h('div', { class: 'deb-prep-wrap' },
        h('span', { class: 'deb-small is-tint' }, m.prep ? `Prepped in “${m.prep.name}” · prep again with the timer` : 'Prep it · a note in Practice preps with Aff / Neg headings'),
        this.prepBox(m),
        m.prep ? this.button('Open the prep note', () => this.io.open(m.prep.path), 'ghost') : null),
      m.fromPrep ? null : h('section', { class: 'deb-versions', 'aria-label': 'Other versions' },
        h('div', { class: 'deb-card-head' }, h('h3', null, `Other versions${versions.length ? ` · ${versions.length}` : ''}`), versions.length ? h('span', { class: 'deb-muted' }, 'changed wording highlighted') : null),
        versions.map((v) => h('div', { class: 'deb-version' },
          h('span', { class: 'deb-version-text' }, wordingDiff(v.text, m.text).map((p) => (p.changed === 'added' ? h('mark', null, p.text) : p.changed === 'removed' ? h('del', { title: 'not in this version' }, p.text) : p.text))),
          h('span', { class: 'deb-version-meta' },
            h('button', { type: 'button', class: 'deb-link', onclick: () => { this.state.id = v.id; this.render(); } }, [v.source, v.round].filter(Boolean).join(' · ')),
            h('button', { type: 'button', class: 'deb-link is-muted', onclick: () => this.save(() => this.editLine(v, (line) => setLineTag(line, 'version/x', false))) }, 'Unlink')))),
        h('div', { class: 'deb-inline' },
          this.button('+ Link a version', (e) => this.linkPicker(m, e.currentTarget), 'dashed'),
          looksLike.length ? h('button', { type: 'button', class: 'deb-link', onclick: (e) => this.linkPicker(m, e.currentTarget, looksLike.map((x) => x.o)) }, `${looksLike.length} more look${looksLike.length === 1 ? 's' : ''} like this · check`) : null)));
  }

  // Link `m` with another motion as versions of each other.
  linkPicker(m, anchor, suggested) {
    const others = this.data.motions.filter((o) => o !== m && !o.fromPrep && !(m.version && o.version === m.version));
    const ranked = (suggested || others.map((o) => ({ o, s: likeness(m.text, o.text) })).sort((a, b) => b.s - a.s).map((x) => x.o));
    const input = h('input', { class: 'deb-input', placeholder: 'Search motions', 'aria-label': 'Search motions to link' });
    const listEl = h('div', { class: 'deb-pick-list' });
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      const pool = q ? others.filter((o) => o.text.toLowerCase().includes(q)) : ranked;
      listEl.replaceChildren(...pool.slice(0, 12).map((o) => h('button', {
        type: 'button', class: 'deb-pick',
        onclick: () => {
          const name = m.version || o.version || versionName(m);
          this.save(async () => {
            if (!m.version) await this.editLine(m, (line) => setLineTag(line, `version/${name}`, true));
            // Re-read in case both are in the same note.
            const fresh = parseMotionNote(await this.io.read(o.path), { path: o.path, source: o.source }).find((x) => x.text === o.text) || o;
            await this.editLine(fresh, (line) => setLineTag(line, `version/${name}`, true));
          });
        },
      }, h('span', null, o.text), h('small', null, [o.source, o.round].filter(Boolean).join(' · ')))));
      if (!pool.length) listEl.append(this.empty('No motions match.'));
    };
    input.addEventListener('input', draw);
    draw();
    this.openPop(anchor, h('div', { class: 'deb-pop-body' }, h('b', null, 'Link a version of this motion'), input, listEl));
    input.focus();
  }

  // + Motion: adds a line to one of the motion notes.
  addMotion(anchor) {
    const notes = [...new Set(this.data.motions.filter((m) => !m.fromPrep).map((m) => m.path))];
    for (const f of this.data.files) if (/^Motions\/[^/]+\.md$/i.test(this.rel(f.path)) && !notes.includes(f.path)) notes.push(f.path);
    let target = notes.find((p) => /motion ideas/i.test(p)) || notes[0];
    const text = h('textarea', { class: 'deb-textarea', placeholder: 'THW …', 'aria-label': 'Motion' });
    const info = h('textarea', { class: 'deb-textarea is-short', placeholder: 'Info slide (optional)', 'aria-label': 'Info slide' });
    const where = h('div', { class: 'deb-chips' });
    const drawWhere = () => where.replaceChildren(...notes.map((p) => this.chip(p.split('/').pop().replace(/\.md$/i, ''), p === target, () => { target = p; drawWhere(); }, 'is-small')));
    drawWhere();
    const add = () => {
      const motion = text.value.trim().replace(/\s+/g, ' ');
      if (!motion || !target) return;
      this.save(async () => {
        const current = await this.io.read(target);
        const lines = current.replace(/\s*$/, '').split('\n');
        const footer = lines.indexOf('---', lines[0] === '---' ? lines.indexOf('---', 1) + 1 : 0);
        const listy = /motion ideas/i.test(target);
        const add = [listy ? `- ${motion}` : motion, ...(info.value.trim() ? [listy ? `\t- IS: ${info.value.trim()}` : `- ${info.value.trim()}`] : [])];
        if (footer > 0) lines.splice(footer, 0, ...add, '');
        else lines.push('', ...add);
        await this.io.write(target, `${lines.join('\n')}\n`);
      });
    };
    this.openPop(anchor, h('div', { class: 'deb-pop-body' },
      h('b', null, 'New motion'), text, info, h('span', { class: 'deb-small' }, 'Goes into'), where,
      h('div', { class: 'deb-inline' }, this.button('Add', add, 'primary'), this.button('Cancel', () => this.closePop(), 'ghost'))));
    text.focus();
  }

  // ---------- Pop-ups ----------

  openPop(anchor, body) {
    this.closePop();
    const pop = h('div', { class: 'deb-pop', role: 'dialog' }, body);
    this.root.append(pop);
    const box = anchor.getBoundingClientRect();
    const host = this.root.getBoundingClientRect();
    const left = Math.max(8, Math.min(box.left - host.left, host.width - pop.offsetWidth - 8));
    let top = box.bottom - host.top + 8;
    if (window.innerHeight - box.bottom < pop.offsetHeight + 16) top = Math.max(8, box.top - host.top - pop.offsetHeight - 8);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    this.pop = pop;
    const outside = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) this.closePop(); };
    const escape = (e) => { if (e.key === 'Escape') this.closePop(); };
    setTimeout(() => document.addEventListener('pointerdown', outside), 0);
    document.addEventListener('keydown', escape);
    this.popCleanup = () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }

  closePop() {
    const { pop, popCleanup } = this;
    this.pop = null;
    this.popCleanup = null;
    if (pop) pop.remove();
    if (popCleanup) popCleanup();
  }
}

// The other pages live in their own files.
Object.assign(DebateView.prototype, formsPages, morePages);

export { DIMENSIONS, askChoice };
