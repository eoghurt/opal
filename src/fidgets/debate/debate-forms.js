// Debate pages: Competitions, one competition (with its tournament overview),
// and Log a round (Form 1 and Form 2). Mixed into DebateView.

import { h, askChoice } from '../../ui.js';
import {
  readProps, writeProps, setSection, competitionsFromRecords, competitionNote, OVERVIEW_PROMPTS,
  broke, speakerRank, isBP, placing, median, ROUND_NAMES, FORMATS, POSITIONS, roundId, DIMENSIONS,
  CLUSTER_OF, CAUSES, writeRound, readRound, shortCode,
} from './records.js';
import { COLUMNS, newCard, addEvidence } from './board.js';
import { likeness } from './motions.js';

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const ordinal = (n) => `${n}${['st', 'nd', 'rd'][((n + 90) % 100 - 10) % 10 - 1] || 'th'}`;
const safeName = (s) => String(s).replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim();

export const formsPages = {
  // ---------- Competitions ----------

  compsPage() {
    const comps = this.speakingComps();
    const judging = this.data.comps.filter((c) => c.role === 'adjudicator');
    const tab = this.ui.compsTab;
    let won = 0;
    let of = 0;
    const places = [];
    for (const c of comps) {
      const r = this.recordOf(c);
      if (!r) continue;
      if (r.bp) places.push(...r.places);
      else { won += r.won; of += r.of; }
    }
    const ranks = comps.map((c) => ({ c, rank: speakerRank(c.speaks) })).filter((x) => x.rank);
    const best = ranks.filter((x) => !/novice|internal/i.test(`${x.c.speaks} ${x.c.notes}`)).sort((a, b) => a.rank - b.rank)[0];
    const goal = Number((/top\s+(\d+)/i.exec(this.data.dashboard.quantitative.join(' ')) || [])[1]) || null;
    const tiles = h('div', { class: 'deb-tiles' },
      of ? this.tile('Rounds won · two-team formats', `${Math.round((won / of) * 100)}%`, `${won} of ${of}`) : null,
      places.length ? this.tile('BP · average placing', (places.reduce((a, b) => a + b, 0) / places.length).toFixed(1), `${[1, 2, 3, 4].map((p) => `${places.filter((x) => x === p).length} ${ordinal(p)}`).join(' · ')}`) : null,
      comps.length ? this.tile('Breaks', String(comps.filter((c) => broke(c.placing)).length), `of ${comps.length} competitions`) : null,
      best ? this.tile('Best speaker rank', ordinal(best.rank), `${best.c.name} ${best.c.year}`) : null,
      goal && ranks.length ? this.tile(`Goal · top ${goal} speaks`, `${ranks.filter((x) => x.rank <= goal).length}×`, ranks.filter((x) => x.rank <= goal).map((x) => `${x.c.speaks} ${x.c.year}`).join(' · ')) : null);

    const importBar = this.data.schoolsPath && !this.data.comps.length ? h('section', { class: 'deb-notice' },
      h('span', null, h('b', null, 'Make a note for each competition. '), 'Opal reads your Schools Record and Adjudication Record tables and makes one note per competition in Competitions (the tables stay as they are).'),
      this.button('Make the notes', () => this.importCompetitions(), 'primary')) : null;

    const rows = tab === 'speaking'
      ? comps.slice().sort((a, b) => Number(b.year) - Number(a.year)).map((c) => {
        const r = this.recordOf(c);
        const bar = !r ? h('span', { class: 'deb-bar' })
          : r.bp ? h('span', { class: 'deb-bar is-split' }, [1, 2, 3, 4].map((p) => h('span', { class: `deb-bar-part is-p${p}`, style: `flex: ${r.places.filter((x) => x === p).length}` })))
            : h('span', { class: 'deb-bar' }, h('span', { class: `deb-bar-fill${r.won / r.of >= 0.6 ? ' is-good' : ' is-mid'}`, style: `width: ${Math.round((r.won / r.of) * 100)}%` }));
        return h('button', { type: 'button', class: 'deb-comp-row', onclick: () => this.go('comp', { path: c.path }) },
          h('span', { class: 'deb-comp-name' }, h('b', null, c.name), h('small', null, [c.format, c.notes].filter(Boolean).join(' · '))),
          h('span', null, c.year),
          h('span', { class: 'deb-ellipsis' }, c.team),
          h('span', { class: 'deb-comp-record' }, bar, h('span', { class: 'deb-mono' }, !r ? '' : r.bp ? `avg ${r.avg.toFixed(1)}` : `${r.won}/${r.of}`)),
          h('span', { class: broke(c.placing) ? 'deb-strong' : 'deb-muted' }, c.placing),
          h('span', { class: 'deb-mono deb-right' }, c.speaks));
      })
      : judging.slice().sort((a, b) => Number(b.year) - Number(a.year)).map((c) => h('button', { type: 'button', class: 'deb-comp-row is-judge', onclick: () => this.go('comp', { path: c.path }) },
        h('span', { class: 'deb-comp-name' }, h('b', null, c.name), h('small', null, c.notes)),
        h('span', null, c.year),
        h('span', { class: 'deb-mono' }, c.rooms ? `${c.rooms} rooms` : ''),
        h('span', { class: 'deb-muted' }, c.teams ? `${c.teams} teams` : '')));

    return h('div', { class: 'deb-page' },
      this.head(tab === 'speaking' ? `${comps.length} competitions` : `${judging.reduce((s, c) => s + c.rooms, 0)} rooms judged`, 'Competitions.',
        h('div', { class: 'deb-seg' },
          h('button', { type: 'button', class: `deb-seg-btn${tab === 'speaking' ? ' is-on' : ''}`, onclick: () => { this.ui.compsTab = 'speaking'; this.render(); } }, 'Speaking'),
          h('button', { type: 'button', class: `deb-seg-btn${tab === 'judging' ? ' is-on' : ''}`, onclick: () => { this.ui.compsTab = 'judging'; this.render(); } }, `Judging${judging.length ? ` · ${judging.length}` : ''}`)),
        this.button('+ Competition', (e) => this.newCompetition(e.currentTarget, tab === 'judging' ? 'adjudicator' : 'speaker'), 'primary')),
      importBar,
      tab === 'speaking' ? tiles : null,
      h('section', { class: 'deb-list' },
        tab === 'speaking' ? h('div', { class: 'deb-comp-row is-head' }, ['Competition', 'Year', 'Team', 'Record', 'Result', 'Speaks'].map((t) => h('span', null, t)))
          : h('div', { class: 'deb-comp-row is-head is-judge' }, ['Competition', 'Year', 'Rooms', 'Teams'].map((t) => h('span', null, t))),
        rows.length ? rows : this.empty(tab === 'speaking' ? 'No competitions yet.' : 'No judging yet.')));
  },

  tile(label, big, sub) {
    return h('div', { class: 'deb-tile' }, h('span', { class: 'deb-tile-label' }, label), h('span', { class: 'deb-tile-big' }, big), sub ? h('span', { class: 'deb-tile-sub' }, sub) : null);
  },

  async importCompetitions() {
    const ok = await askChoice('Make a note for each competition in your Schools Record and Adjudication Record?', [{ label: 'Make the notes', value: 'yes' }]);
    if (!ok) return;
    await this.save(async () => {
      const schools = this.data.schoolsPath ? await this.io.read(this.data.schoolsPath) : '';
      const judging = this.data.judgingPath ? await this.io.read(this.data.judgingPath) : '';
      const notes = competitionsFromRecords(schools, judging);
      const taken = new Set(this.data.files.map((f) => f.path.toLowerCase()));
      for (const n of notes) {
        let name = n.name;
        if (n.props.role === 'adjudicator' && taken.has(`${this.io.folder}/Competitions/${name}.md`.toLowerCase())) name = `${name} (judging)`;
        if (taken.has(`${this.io.folder}/Competitions/${name}.md`.toLowerCase())) continue;
        taken.add(`${this.io.folder}/Competitions/${name}.md`.toLowerCase());
        await this.io.create(`${this.io.folder}/Competitions`, name, writeProps(n.props, n.body));
      }
    });
    this.flash('Made a note for each competition');
  },

  newCompetition(anchor, role = 'speaker', onMade) {
    const name = h('input', { class: 'deb-input', placeholder: 'Competition name', 'aria-label': 'Competition name' });
    const year = h('input', { class: 'deb-input is-short', value: String(new Date().getFullYear()), 'aria-label': 'Year', inputmode: 'numeric' });
    const team = h('input', { class: 'deb-input', placeholder: role === 'speaker' ? 'Team (optional)' : 'Rooms judged (optional)', 'aria-label': role === 'speaker' ? 'Team' : 'Rooms judged' });
    let format = '';
    const formats = h('div', { class: 'deb-chips' });
    const draw = () => formats.replaceChildren(...FORMATS.map((f) => this.chip(f, format === f, () => { format = format === f ? '' : f; draw(); }, 'is-small')));
    draw();
    const make = () => {
      const n = name.value.trim();
      if (!n) return;
      const note = competitionNote({ role, competition: n, year: year.value.trim(), team: role === 'speaker' ? team.value.trim() : '', rooms: role === 'speaker' ? '' : team.value.trim(), format });
      this.save(async () => {
        const path = await this.io.create(`${this.io.folder}/Competitions`, note.name, writeProps(note.props, note.body));
        if (onMade) onMade(path);
        else this.state = { page: 'comp', path };
      });
    };
    this.openPop(anchor, h('div', { class: 'deb-pop-body' },
      h('b', null, role === 'speaker' ? 'New competition' : 'New judging'), name, h('div', { class: 'deb-inline' }, year, team), formats,
      h('div', { class: 'deb-inline' }, this.button('Make it', make, 'primary'), this.button('Cancel', () => this.closePop(), 'ghost'))));
    name.focus();
  },

  // ---------- One competition ----------

  compPage() {
    const c = this.data.comps.find((x) => x.path === this.state.path);
    if (!c) return this.empty('That competition note isn’t there any more.');
    const rounds = this.roundsOf(c).sort((a, b) => String(a.date).localeCompare(String(b.date)) || ROUND_NAMES.indexOf(a.round) - ROUND_NAMES.indexOf(b.round));
    const r = this.recordOf(c);
    const head = h('header', { class: 'deb-head' },
      h('div', { class: 'deb-title' },
        h('span', { class: 'deb-kicker' }, h('button', { type: 'button', class: 'deb-link', onclick: () => this.go('comps') }, 'Competitions'), ` · ${[c.year, c.format, c.team, c.notes].filter(Boolean).join(' · ')}`),
        h('h1', { class: 'deb-h1 is-long' }, c.name)),
      h('div', { class: 'deb-actions' },
        c.tab ? h('a', { class: 'deb-btn', href: c.tab, target: '_blank', rel: 'noopener' }, 'Open the tab ↗') : null,
        this.button('Open the note', () => this.io.open(c.path), 'ghost'),
        c.role === 'speaker' ? this.button('+ Round', () => this.go('log', { tab: 1, comp: c.path }), 'primary') : null));
    if (c.role === 'adjudicator') {
      return h('div', { class: 'deb-page' }, head,
        h('div', { class: 'deb-tiles' }, c.rooms ? this.tile('Rooms judged', String(c.rooms)) : null, c.teams ? this.tile('Teams', String(c.teams)) : null, c.notes ? this.tile('Role', c.notes) : null));
    }
    const needForm2 = rounds.filter((x) => !x.form2).length;
    const stats = h('div', { class: 'deb-tiles' },
      r ? this.tile(r.bp ? 'Average placing' : 'In-rounds', r.bp ? r.avg.toFixed(1) : `${r.won} / ${r.of}`) : null,
      c.placing ? this.tile('Result', c.placing) : null,
      c.speaks ? this.tile('Speaks', c.speaks) : null,
      rounds.length ? this.tile('Rounds logged', String(rounds.length), needForm2 ? `${needForm2} still need Form 2` : 'both forms done') : null);

    // Where the feedback kept landing (from Form 1 clusters), for the summary.
    const clusterCount = {};
    for (const x of rounds) for (const cl of [].concat(x.clusters || [])) if (cl) clusterCount[cl] = (clusterCount[cl] || 0) + 1;
    const topCluster = Object.entries(clusterCount).sort((a, b) => b[1] - a[1])[0];
    const summary = [
      r && !r.bp ? `${r.won} win${r.won === 1 ? '' : 's'} from ${r.of} in-rounds` : null,
      r && r.bp ? `average placing ${r.avg.toFixed(1)} over ${r.places.length} rounds` : null,
      c.placing ? (broke(c.placing) ? `broke, ${c.placing.toLowerCase()}` : c.placing) : null,
      c.speaks ? `${c.speaks} speaker` : null,
    ].filter(Boolean).join(', ');
    const feelings = ['Rough', 'Mixed', 'Good', 'Great'];
    const overview = this.card('Tournament overview', h('span', { class: 'deb-muted' }, 'saved in the competition’s note'),
      h('div', { class: 'deb-overview' },
        h('div', { class: 'deb-overview-side' },
          summary ? h('p', null, `${summary[0].toUpperCase()}${summary.slice(1)}.`) : null,
          topCluster ? h('p', { class: 'deb-small' }, 'Feedback kept landing on ', h('b', { class: 'is-warn' }, topCluster[0]), ` (${topCluster[1]} round${topCluster[1] === 1 ? '' : 's'}).`) : null,
          h('span', { class: 'deb-small' }, 'How did it feel overall?'),
          h('div', { class: 'deb-chips' }, feelings.map((f) => this.chip(f, c.feeling === f.toLowerCase(), () => this.save(() => this.setCompProp(c, 'feeling', c.feeling === f.toLowerCase() ? '' : f.toLowerCase())), 'is-small')))),
        h('div', { class: 'deb-overview-boxes' }, OVERVIEW_PROMPTS.map((prompt) => {
          const box = h('textarea', { class: 'deb-textarea', 'aria-label': prompt, placeholder: { 'What went well': 'Rounds, calls, partnerships that worked', 'What didn’t': 'What cost you rounds', 'The one thing to change before the next comp': 'One change, specific enough to test', 'Best moment': 'A speech, a rebuttal, a call you got right' }[prompt] });
          box.value = c.overview[prompt] || '';
          box.addEventListener('focus', () => { this.typing = true; });
          box.addEventListener('blur', () => {
            this.typing = false;
            if (box.value.trim() !== (c.overview[prompt] || '').trim()) this.save(() => this.setCompSection(c, prompt, box.value));
          });
          return h('label', { class: 'deb-field' }, h('span', null, prompt), box);
        }))));

    const roundRows = rounds.map((x) => h('div', { class: 'deb-round-row' },
      h('span', { class: 'deb-mono' }, x.round_id),
      h('span', { class: 'deb-round-motion' }, h('span', null, x.motion || ''), h('small', null, x.position || '')),
      h('span', { class: `deb-result${/^win$/i.test(x.result) || (placing(x.result) && placing(x.result) <= 2) ? ' is-good' : ''}` }, x.result),
      h('span', { class: 'deb-mono deb-muted deb-right' }, x.speaks),
      h('span', { class: 'deb-forms' },
        h('button', { type: 'button', class: 'deb-form-mark is-done', title: 'Form 1', onclick: () => this.go('log', { tab: 1, path: x.path }) }, '1'),
        h('button', { type: 'button', class: `deb-form-mark${x.form2 ? ' is-done' : ' is-due'}`, title: x.form2 ? 'Form 2' : 'Form 2 still to do', onclick: () => this.go('log', { tab: 2, path: x.path }) }, '2'))));

    const scored = rounds.filter((x) => Object.keys(x.scores).length);
    const dims = DIMENSIONS.flatMap(([, ds]) => ds).map((d) => ({ d, m: median(scored.map((x) => x.scores[d])) })).filter((x) => x.m != null);
    const scores = dims.length ? this.card(`Feedback · median of ${scored.length} round${scored.length === 1 ? '' : 's'}`, h('span', { class: 'deb-muted' }, '1 lost it · 5 decisive'),
      dims.map(({ d, m }) => h('div', { class: 'deb-score-row' },
        h('span', { class: m <= 2 ? 'is-warn' : '' }, d),
        h('span', { class: 'deb-bar' }, h('span', { class: `deb-bar-fill${m <= 2 ? ' is-mid' : ' is-blue'}`, style: `width: ${(m / 5) * 100}%` })),
        h('span', { class: 'deb-mono' }, String(m))))) : null;
    const ids = new Set(rounds.map((x) => x.round_id));
    const cards = this.data.cards.filter((k) => k.rounds.some((id) => ids.has(id)) || (c.short && String(k.roundId).startsWith(`${c.short}-`)));
    const cardsCard = cards.length ? this.card('Cards from this competition', null, cards.map((k) => h('button', { type: 'button', class: 'deb-mini-card', onclick: () => this.go('board', { path: k.path }) },
      h('small', null, COLUMNS.find((col) => col.folder === k.column).name), h('b', null, k.title), h('small', null, k.rounds.join(', '))))) : null;

    return h('div', { class: 'deb-page' }, head, stats, overview,
      h('div', { class: 'deb-split' },
        h('section', { class: 'deb-list' },
          h('div', { class: 'deb-round-row is-head' }, ['Round ID', 'Motion · position', 'Result', 'Speaks', 'Forms'].map((t) => h('span', null, t))),
          roundRows.length ? roundRows : this.empty('No rounds logged for this competition. + Round logs one.')),
        scores || cardsCard ? h('div', { class: 'deb-stack' }, scores, cardsCard) : null));
  },

  async setCompProp(c, key, value) {
    const text = await this.io.read(c.path);
    const { props, body } = readProps(text);
    props[key] = value;
    await this.io.write(c.path, writeProps(props, body));
  },

  async setCompSection(c, heading, value) {
    const text = await this.io.read(c.path);
    const { props, body } = readProps(text);
    let next = body;
    if (!/^##\s+Tournament overview\s*$/m.test(next)) next = `${next.replace(/\s*$/, '')}\n\n## Tournament overview\n`;
    next = setSection(next, heading, value, 3);
    await this.io.write(c.path, writeProps(props, next));
  },

  // ---------- Log a round ----------

  logPage() {
    const tab = this.state.tab === 2 ? 2 : 1;
    const existing = this.state.path ? this.data.rounds.find((r) => r.path === this.state.path) : null;
    if (!this.form || this.form.key !== `${tab}|${this.state.path || ''}|${this.state.comp || ''}`) {
      this.form = this.newForm(tab, existing);
    }
    const f = this.form.f;
    const comp = this.data.comps.find((c) => c.path === f.comp);
    const id = this.roundIdFor(f, comp);
    const tabs = h('div', { class: 'deb-seg' },
      h('button', { type: 'button', class: `deb-seg-btn${tab === 1 ? ' is-on' : ''}`, onclick: () => this.go('log', { tab: 1, path: existing ? existing.path : this.state.path, comp: this.state.comp }) }, existing ? 'Form 1 · done ✓' : 'Form 1 · Immediate · 5 min'),
      h('button', { type: 'button', class: `deb-seg-btn${tab === 2 ? ' is-on' : ''}`, onclick: () => this.go('log', { tab: 2, path: existing ? existing.path : undefined }) }, existing && existing.form2 ? 'Form 2 · done ✓' : 'Form 2 · Full · 15 min'));
    return h('div', { class: 'deb-page' },
      this.head(existing ? 'Log a round · editing' : 'Log a round', tab === 1 ? (id || 'New round') : (existing ? existing.round_id : 'Form 2'), tabs),
      tab === 1 ? this.form1(f, comp, id, existing) : this.form2(existing));
  },

  newForm(tab, existing) {
    const key = `${tab}|${this.state.path || ''}|${this.state.comp || ''}`;
    if (existing) {
      const comp = this.data.comps.find((c) => c.path.split('/').pop().replace(/\.md$/i, '') === existing.competitionName);
      return { key, f: { ...existing, comp: comp ? comp.path : '', clusters: [].concat(existing.clusters || []).filter(Boolean), unusual: [].concat(existing.unusual || []).filter(Boolean), candidates: [].concat(existing.candidates || []).filter(Boolean), scores: { ...existing.scores } } };
    }
    const recent = this.speakingComps().filter((c) => Number(c.year) >= new Date().getFullYear() - 1);
    const comp = this.data.comps.find((c) => c.path === this.state.comp) || null;
    return { key, f: { comp: comp ? comp.path : (recent[0] ? '' : ''), date: todayKey(), round: '', format: comp ? comp.format : '', position: '', motion: '', result: '', speaks: '', judges: '', clusters: [], deserved: '', round_of_day: '', hours_slept: '', eaten: '', unusual: [], scores: {}, candidates: [] } };
  },

  roundIdFor(f, comp) {
    if (!f.round) return '';
    const short = comp ? comp.short : f.round === 'Practice' ? `PRAC-${f.date || todayKey()}` : 'ROUND';
    return roundId(short, f.round);
  },

  // Buttons for one answer; `multi` for several.
  pick(f, key, options, { multi = false, small = false, after } = {}) {
    return h('div', { class: 'deb-chips' }, options.map((o) => {
      const value = typeof o === 'string' ? o : o.value;
      const label = typeof o === 'string' ? o : o.label;
      const on = multi ? f[key].includes(value) : f[key] === value;
      return this.chip(label, on, () => {
        if (multi) f[key] = on ? f[key].filter((x) => x !== value) : [...f[key], value];
        else f[key] = on ? '' : value;
        if (after) after(f[key]);
        this.render();
      }, small ? 'is-small' : '');
    }));
  },

  q(label, control, hint) {
    return h('div', { class: 'deb-q' }, h('span', { class: 'deb-q-label' }, label, hint ? h('small', null, hint) : null), control);
  },

  text(f, key, { long = false, placeholder = '', type = 'text' } = {}) {
    const el = long ? h('textarea', { class: 'deb-textarea', placeholder, 'aria-label': placeholder || key })
      : h('input', { class: 'deb-input', type, placeholder, 'aria-label': placeholder || key });
    el.value = f[key] || '';
    el.addEventListener('input', () => { f[key] = el.value; });
    el.addEventListener('focus', () => { this.typing = true; });
    el.addEventListener('blur', () => { this.typing = false; });
    return el;
  },

  form1(f, comp, id, existing) {
    const recent = this.speakingComps().slice().sort((a, b) => Number(b.year) - Number(a.year)).slice(0, 6);
    if (comp && !recent.includes(comp)) recent.unshift(comp);
    const bp = isBP(f.format);
    const positions = POSITIONS[f.format] || POSITIONS['World Schools'];
    const motionBtn = h('button', { type: 'button', class: 'deb-motion-pick', onclick: (e) => this.pickMotion(f, e.currentTarget) },
      h('span', null, f.motion || 'Pick from the motion bank, or type it'), h('span', { class: 'deb-muted' }, '⌄'));
    const date = h('input', { class: 'deb-input is-short', type: 'date', value: f.date || todayKey(), 'aria-label': 'Date' });
    date.addEventListener('change', () => { f.date = date.value; this.render(); });
    const save = async () => {
      if (!f.round) {
        alert('Pick which round it was.');
        return;
      }
      const theComp = this.data.comps.find((c) => c.path === f.comp);
      const rid = this.roundIdFor(f, theComp);
      const round = { ...f, round_id: rid, competitionName: theComp ? theComp.path.split('/').pop().replace(/\.md$/i, '') : '', form2: existing ? existing.form2 : false };
      await this.save(async () => {
        if (existing) await this.io.write(existing.path, writeRound(round));
        else {
          const path = await this.io.create(`${this.io.folder}/Rounds`, safeName(rid), writeRound(round));
          this.state = { page: 'log', tab: 2, path };
        }
        this.form = null;
      });
      this.flash(existing ? 'Round saved' : 'Round saved · Form 2 is ready when you are');
    };
    return h('div', { class: 'deb-form' },
      h('p', { class: 'deb-rule' }, h('b', null, 'Record, do not analyse. '), 'If an answer has the word “because” in it, save it for Form 2.'),
      this.card(null, null,
        this.q('Competition', h('div', { class: 'deb-chips' },
          recent.map((c) => this.chip(`${c.name.length > 34 ? c.short : c.name} ${c.year}`, f.comp === c.path, () => { f.comp = f.comp === c.path ? '' : c.path; if (f.comp && c.format) f.format = c.format; this.render(); })),
          this.chip('Practice', !f.comp && f.round === 'Practice', () => { f.comp = ''; f.round = 'Practice'; this.render(); }),
          this.chip('+ New', false, (e) => this.newCompetition(e.currentTarget, 'speaker', (path) => { f.comp = path; })))),
        this.q('Date', date),
        this.q('Round', this.pick(f, 'round', ROUND_NAMES, { small: true })),
        this.q('Format', this.pick(f, 'format', FORMATS, { after: () => { f.position = ''; f.result = ''; } })),
        this.q('Position', this.pick(f, 'position', positions, { small: true })),
        this.q('Motion', motionBtn),
        this.q('Result', this.pick(f, 'result', bp ? ['1st', '2nd', '3rd', '4th'] : ['Win', 'Loss'])),
        h('div', { class: 'deb-two' }, this.q('Your speaks', this.text(f, 'speaks', { placeholder: 'blank if not released', type: 'number' })), this.q('Judges', this.text(f, 'judges', { placeholder: 'Names, comma separated' })))),
      this.card(null, null,
        h('label', { class: 'deb-field' }, h('span', null, 'Judge feedback, verbatim ', h('small', null, '· their words, one line per point, attributed')), this.text(f, 'feedback', { long: true })),
        h('label', { class: 'deb-field' }, h('span', null, 'At what point did you decide, and what would a better speaker have done at that moment?'), this.text(f, 'decided', { long: true })),
        h('div', { class: 'deb-two' },
          h('label', { class: 'deb-field' }, h('span', null, 'What were you trying to do? ', h('small', null, '· one sentence')), this.text(f, 'trying', { long: true })),
          h('label', { class: 'deb-field' }, h('span', null, 'What surprised you?'), this.text(f, 'surprised', { long: true })))),
      this.card(null, null,
        this.q('Which clusters did the feedback land in?', this.pick(f, 'clusters', ['Analysis', 'Strategy', 'Execution', 'Meta'], { multi: true })),
        this.q('Did you deserve the result?', this.pick(f, 'deserved', ['Yes', 'No', 'Unsure'])),
        this.q('Round number of the day', this.pick(f, 'round_of_day', ['1', '2', '3', '4', '5'], { small: true })),
        this.q('Hours slept', this.pick(f, 'hours_slept', ['4', '5', '6', '7', '8', '9+'], { small: true })),
        this.q('Eaten in the last 4 hours?', this.pick(f, 'eaten', ['Yes', 'No'])),
        this.q('Anything unusual', this.pick(f, 'unusual', ['Illness', 'Venue', 'Tech', 'Late start'], { multi: true }))),
      h('div', { class: 'deb-inline' },
        this.button(existing ? 'Save changes' : 'Save round', save, 'primary'),
        h('span', { class: 'deb-small' }, id ? `Saved as ${this.io.folder.split('/').pop()}/Rounds/${id}.md` : 'Pick a competition and round for its Round ID')));
  },

  pickMotion(f, anchor) {
    const input = h('input', { class: 'deb-input', placeholder: 'Search the bank, or type the motion', 'aria-label': 'Motion' });
    input.value = f.motion || '';
    const listEl = h('div', { class: 'deb-pick-list' });
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      const pool = this.data.motions.filter((m) => !q || m.text.toLowerCase().includes(q)).slice(0, 10);
      listEl.replaceChildren(
        ...(q ? [h('button', { type: 'button', class: 'deb-pick', onclick: () => { f.motion = input.value.trim(); this.closePop(); this.render(); } }, h('span', null, `Use “${input.value.trim()}”`), h('small', null, 'as typed'))] : []),
        ...pool.map((m) => h('button', { type: 'button', class: 'deb-pick', onclick: () => { f.motion = m.text; this.closePop(); this.render(); } }, h('span', null, m.text), h('small', null, [m.source, m.round].filter(Boolean).join(' · ')))));
    };
    input.addEventListener('input', draw);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value.trim()) { f.motion = input.value.trim(); this.closePop(); this.render(); } });
    draw();
    this.openPop(anchor, h('div', { class: 'deb-pop-body is-wide' }, input, listEl));
    input.focus();
  },

  form2(existing) {
    if (!existing) {
      const due = this.data.rounds.filter((r) => !r.form2);
      return this.card('Which round?', null,
        due.length ? due.map((r) => this.ticket(r)) : this.empty('Every logged round has its Form 2. Log a round with Form 1 first.'));
    }
    const f = this.form.f;
    const allDims = DIMENSIONS.flatMap(([, ds]) => ds);
    if (!f.dimension) {
      const low = Object.entries(f.scores).sort((a, b) => a[1] - b[1])[0];
      f.dimension = low && low[1] <= 2 ? low[0] : '';
    }
    const scoreRow = (d) => h('div', { class: 'deb-score-pick' },
      h('span', null, d),
      h('span', { class: 'deb-scores', role: 'radiogroup', 'aria-label': d }, [1, 2, 3, 4, 5].map((n) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(f.scores[d] === n), class: `deb-score-btn${f.scores[d] === n ? ` is-on is-s${n}` : ''}`,
        onclick: () => {
          if (f.scores[d] === n) delete f.scores[d];
          else f.scores[d] = n;
          this.render();
        },
      }, String(n)))));
    const match = f.dimension ? this.data.cards.find((k) => k.dimension === f.dimension && k.column !== '4 Done') : null;
    const save = async () => {
      const round = { ...existing, ...f, form2: true };
      await this.save(async () => {
        await this.io.write(existing.path, writeRound(round));
        if (f.dimension && f.priority && f.priority !== '') {
          if (match) {
            await this.io.write(match.path, addEvidence(await this.io.read(match.path), existing.round_id, f.feedback ? f.feedback.split('\n')[0] : ''));
          } else if (this.data.template) {
            const column = f.priority === 'Park' ? '3 Parked' : '1 Do Now';
            const label = (f.symptom || '').split(/[.\n]/)[0].slice(0, 60);
            const text = newCard(this.data.template, { roundId: existing.round_id, competition: existing.competitionName ? `[[${existing.competitionName}]]` : '', date: existing.date, dimension: f.dimension, label, symptom: label, feedback: f.feedback, partner: f.partner, coach: f.coach, cause: f.cause, mini: f.mini, level: f.level, today: todayKey() });
            await this.io.create(`${this.io.folder}/Feedback/${column}`, safeName(`${f.dimension} — ${label || existing.round_id}`), text.replace(/^status: do-now$/m, `status: ${column === '3 Parked' ? 'parked' : 'do-now'}`));
          }
        }
        this.form = null;
      });
      this.flash(match ? `Added to the card “${match.title}”` : f.dimension && f.priority ? 'Saved, and a card made for the board' : 'Form 2 saved');
    };
    return h('div', { class: 'deb-split' },
      h('div', { class: 'deb-form' },
        this.card(null, null, h('div', { class: 'deb-two' },
          h('label', { class: 'deb-field' }, h('span', null, 'What did your partner say?'), this.text(f, 'partner', { long: true })),
          h('label', { class: 'deb-field' }, h('span', null, 'What did your coach say?'), this.text(f, 'coach', { long: true })))),
        this.card('Score what the round showed', h('span', { class: 'deb-muted' }, '1 a judge named it as why you lost · 3 not mentioned · 5 credited as decisive · blank if no evidence'),
          DIMENSIONS.map(([cluster, ds]) => h('div', { class: 'deb-cluster' }, h('span', { class: 'deb-cluster-name' }, cluster), ds.map(scoreRow)))),
        this.card(null, null,
          h('label', { class: 'deb-field' }, h('span', null, 'Name the symptom ', h('small', null, '· as observed, not as diagnosed. One sentence.')), this.text(f, 'symptom')),
          this.q('Which causes are candidates?', this.pick(f, 'candidates', CAUSES, { multi: true, small: true })),
          h('label', { class: 'deb-field' }, h('span', null, 'Cause ', h('small', null, '· one, named. Not a list.')), this.text(f, 'cause')),
          h('label', { class: 'deb-field' }, h('span', null, 'What would you have to believe for the judge to be right?'), this.text(f, 'believe', { long: true })),
          h('label', { class: 'deb-field' }, h('span', null, 'The mini fix ', h('small', null, '· one rule you can hold in your head while speaking')), this.text(f, 'mini')),
          this.q('Level you think this needs', this.pick(f, 'level', ['Mini', 'Micro', 'Macro', 'Route around it'])),
          this.q('Have you seen this before?', this.pick(f, 'seen_before', ['First time', 'Earlier this competition', 'At previous competitions'])),
          this.q('Priority', this.pick(f, 'priority', ['Do now', 'Next block', 'Park'])),
          this.q('Card for which skill?', h('div', { class: 'deb-chips' }, allDims.map((d) => this.chip(d, f.dimension === d, () => { f.dimension = f.dimension === d ? '' : d; this.render(); }, 'is-small'))), 'the card’s title starts with it'),
          h('label', { class: 'deb-field' }, h('span', null, 'Anything else'), this.text(f, 'other', { long: true }))),
        h('div', { class: 'deb-inline' }, this.button(f.dimension && f.priority ? (match ? 'Save and add to the card' : 'Save and make a card') : 'Save Form 2', save, 'primary'),
          h('span', { class: 'deb-small' }, f.dimension && f.priority ? (match ? `Adds this round as evidence to “${match.title}”.` : `Makes a card in ${f.priority === 'Park' ? '3 Parked' : '1 Do Now'}.`) : 'Pick a skill and a priority to make a card.'))),
      h('aside', { class: 'deb-detail', 'aria-label': 'From Form 1' },
        h('h2', { class: 'deb-detail-h' }, 'From Form 1'),
        h('div', { class: 'deb-chips' }, [existing.format, existing.position, existing.result, existing.deserved ? `Deserved: ${existing.deserved}` : ''].filter(Boolean).map((t) => h('span', { class: 'deb-tag' }, t))),
        existing.motion ? h('p', { class: 'deb-small' }, existing.motion) : null,
        existing.feedback ? [h('span', { class: 'deb-small' }, 'Judge feedback, verbatim'), h('blockquote', { class: 'deb-quote' }, existing.feedback)] : null,
        existing.trying ? [h('span', { class: 'deb-small' }, 'You were trying to'), h('p', { class: 'deb-small is-strong' }, existing.trying)] : null,
        match ? h('div', { class: 'deb-match' }, h('small', null, 'Looks like a card you already have'), h('b', null, match.title), h('small', null, `${COLUMNS.find((c) => c.folder === match.column).name} · seen in ${match.rounds.join(', ')}`)) : null));
  },
};

export { CLUSTER_OF, readRound, likeness, shortCode };
