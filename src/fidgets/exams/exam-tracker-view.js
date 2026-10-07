// The exam tracker at the top of a subject folder's page: your school mark,
// a target, the WACE mark you'd need, your school results, and the WACE
// papers you've marked — by section, and which question types lose you the
// most marks. "Mark a paper" reads the paper's PDF for its questions.

import { h } from '../../ui.js';
import { showMenu } from '../../context-menu.js';
import {
  COURSES, parseTracker, formatTracker, schoolMark, neededInExam, paperSections, paperPercent,
  lossesByType, sectionAverages, readPaperLines, findPapers,
} from './exams.js';

const SVG = 'http://www.w3.org/2000/svg';

// A paper being marked survives the folder page redrawing (files changing).
const inProgress = new Map(); // note path → { marking, chosen }

export class ExamTracker {
  // io: { load() → text, save(text), files() → [{ path }], pdfLines(paths) → [lines], openFile(path), folderName }
  constructor(slot, io) {
    this.slot = slot;
    this.io = io;
    const kept = inProgress.get(io.path) || {};
    this.marking = kept.marking || null; // the paper being marked: { name, sections, questions }
    this.chosen = kept.chosen || null; // which marked paper is shown by section
    this.load();
  }

  async load() {
    this.text = (await this.io.load()) || '';
    this.t = parseTracker(this.text, this.io.folderName);
    this.render();
  }

  async save() {
    this.text = formatTracker(this.t, this.text, `${this.io.folderName} exam tracker`);
    try {
      await this.io.save(this.text);
    } catch (err) {
      alert(`Couldn't save the exam tracker.\n\n${err.message}`);
    }
  }

  render() {
    inProgress.set(this.io.path, { marking: this.marking, chosen: this.chosen });
    if (!this.slot.isConnected) return;
    this.slot.replaceChildren(this.marking ? this.markingView() : this.overview());
  }

  // ---------- the overview ----------

  overview() {
    const t = this.t;
    const course = COURSES[t.course];
    const school = schoolMark(t.results);
    const needed = neededInExam(t.target, school);
    const neededMod = t.moderated != null ? neededInExam(t.target, t.moderated) : null;
    const marked = t.papers.filter((p) => paperPercent(p, t.course) != null);
    const best = marked.reduce((m, p) => Math.max(m, paperPercent(p, t.course)), 0);

    let verdict;
    if (needed == null) verdict = 'Add your school results to see what the exam needs.';
    else if (needed > 100) verdict = `${needed}% isn’t possible — a target of ${Math.floor((100 + school) / 2)} or less is.`;
    else if (course.noPapers) verdict = needed > 80 ? 'A big ask — every school mark from here helps.' : 'Very doable — keep the school marks steady.';
    else if (!marked.length) verdict = needed > 80 ? 'A big ask — mark a past paper to see where you are.' : 'Very doable — mark a past paper to check.';
    else if (best >= needed) verdict = `Your best paper (${best}%) already clears it — repeat that.`;
    else verdict = `${needed - best} marks more than your best paper (${best}%) — see where they go.`;

    const step = (d) => () => {
      t.target = Math.max(40, Math.min(99, t.target + d));
      this.save();
      this.render();
    };
    const modInput = h('input', { class: 'ex-inline-num', type: 'number', min: '0', max: '100', value: t.moderated == null ? '' : String(t.moderated), placeholder: '—', 'aria-label': 'Predicted moderated school score' });
    modInput.addEventListener('change', () => {
      const v = parseFloat(modInput.value);
      t.moderated = Number.isFinite(v) ? v : null;
      this.save();
      this.render();
    });

    const stats = h('div', { class: 'ex-stats' },
      h('div', { class: 'ex-card' },
        h('span', { class: 'mono-label' }, 'School mark'),
        h('span', { class: 'ex-big' }, school == null ? '—' : String(school)),
        h('span', { class: 'ex-sub' }, `${t.results.length} result${t.results.length === 1 ? '' : 's'} · ${t.results.reduce((a, r) => a + r.weight, 0)}% of the year counted`)),
      h('div', { class: 'ex-card' },
        h('span', { class: 'mono-label' }, 'Target'),
        h('div', { class: 'ex-target' },
          h('span', { class: 'ex-big' }, String(t.target)),
          h('button', { class: 'ex-step', type: 'button', 'aria-label': 'Lower the target', onclick: step(-1) }, '−'),
          h('button', { class: 'ex-step', type: 'button', 'aria-label': 'Raise the target', onclick: step(1) }, '+')),
        h('span', { class: 'ex-sub' }, 'final course score')),
      h('div', { class: 'ex-card is-accent' },
        h('span', { class: 'mono-label' }, 'Needed in the WACE'),
        h('span', { class: 'ex-big' }, needed == null ? '—' : needed > 100 ? '100+' : `${needed}%`),
        h('span', { class: 'ex-sub' }, neededMod != null ? `${neededMod > 100 ? '100+' : `${neededMod}%`} if moderation lands near ` : 'Predicted moderated score: ', modInput)),
      h('div', { class: 'ex-card' },
        h('span', { class: 'mono-label' }, 'How it looks'),
        h('span', { class: 'ex-verdict' }, verdict),
        h('span', { class: 'ex-sub' }, 'exam needed = 2 × target − school mark')));

    const left = h('div', { class: 'ex-col ex-left' }, this.trendCard(school, needed, marked), this.resultsCard(school));
    const right = h('div', { class: 'ex-col ex-right' }, ...(course.noPapers ? [this.literatureCard()] : this.papersPart(needed, marked)));
    return h('section', { class: 'ex', 'aria-label': 'Exam tracker' },
      h('div', { class: 'ex-head' },
        h('div', { class: 'ex-head-title' }, h('span', { class: 'mono-label' }, 'Exam tracker'), h('span', { class: 'ex-course' }, course.name)),
        h('button', { class: 'ex-chip', type: 'button', onclick: (e) => this.courseMenu(e) }, 'Course ▾'),
        h('button', { class: 'ex-chip', type: 'button', onclick: () => this.io.openFile(this.io.path) }, 'Open the note')),
      stats,
      h('div', { class: 'ex-grid' }, left, right));
  }

  courseMenu(event) {
    showMenu(event, {
      title: 'Which WACE course?',
      items: Object.entries(COURSES).map(([id, c]) => ({
        label: c.name, hint: id === this.t.course ? '✓' : '',
        onSelect: () => {
          this.t.course = id;
          this.save();
          this.render();
        },
      })),
    });
  }

  trendCard(school, needed, marked) {
    const t = this.t;
    const W = 480;
    const H = 140;
    const y = (v) => 128 - (Math.max(0, Math.min(100, v)) / 100) * 116;
    const pts = t.results.map((r) => r.mark);
    const n = pts.length + marked.length;
    const x = (i) => 16 + ((W - 32) * i) / Math.max(1, n - 1);
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'ex-trend');
    let inner = `<path d="M16 ${y(t.target)} H${W - 16}" stroke="var(--ink-3)" stroke-width="1.2" stroke-dasharray="6 5" fill="none"></path>`;
    if (needed != null) inner += `<path d="M16 ${y(needed)} H${W - 16}" stroke="var(--accent)" stroke-width="1.4" stroke-dasharray="2 4" fill="none"></path>`;
    if (pts.length) inner += `<path d="${pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')}" stroke="var(--ink)" stroke-width="2" fill="none" stroke-linejoin="round" stroke-linecap="round"></path>`;
    inner += pts.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4" fill="var(--ink)"></circle>`).join('');
    inner += marked.map((p, i) => {
      const cx = x(pts.length + i);
      const cy = y(paperPercent(p, t.course));
      return `<path d="M${cx - 5} ${cy - 5} L${cx + 5} ${cy + 5} M${cx + 5} ${cy - 5} L${cx - 5} ${cy + 5}" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round"></path>`;
    }).join('');
    svg.innerHTML = inner;
    return h('div', { class: 'ex-card' },
      h('div', { class: 'ex-card-head' }, h('h3', null, 'Trend'), h('span', { class: 'ex-sub' }, '– – target · · needed × practice papers')),
      svg);
  }

  resultsCard() {
    const t = this.t;
    const rows = t.results.map((r, i) => {
      const name = h('input', { class: 'ex-cell', value: r.name, 'aria-label': 'Assessment' });
      const weight = h('input', { class: 'ex-cell is-num', type: 'number', min: '0', step: '0.5', value: String(r.weight), 'aria-label': 'Weight (%)' });
      const mark = h('input', { class: 'ex-cell is-num is-mark', type: 'number', min: '0', max: '100', step: '0.1', value: String(r.mark), 'aria-label': 'Mark (%)' });
      const commit = () => {
        const w = parseFloat(weight.value);
        const m = parseFloat(mark.value);
        if (!name.value.trim() || !Number.isFinite(w) || !Number.isFinite(m)) return;
        t.results[i] = { ...r, name: name.value.trim(), weight: w, mark: m };
        this.save();
        this.render();
      };
      [name, weight, mark].forEach((input) => {
        input.addEventListener('change', commit);
        input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
      });
      const bar = h('span', { class: 'ex-bar' }, h('span', { style: `width: ${Math.max(0, Math.min(100, r.mark))}%; background: ${r.mark >= t.target ? 'var(--ex-good)' : 'var(--ink)'}` }));
      const del = h('button', { class: 'ex-del', type: 'button', 'aria-label': `Remove ${r.name}`, title: 'Remove', onclick: () => {
        t.results.splice(i, 1);
        this.save();
        this.render();
      } }, '×');
      const row = h('div', { class: 'ex-row' }, name, weight, bar, mark, del);
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showMenu(e, { title: r.name, items: [
          { label: 'Edit the name', onSelect: () => name.focus() },
          { label: 'Edit the mark', onSelect: () => mark.focus() },
          'separator',
          { label: 'Open the note', onSelect: () => this.io.openFile(this.io.path) },
          'separator',
          { label: 'Remove this result', danger: true, onSelect: () => del.click() },
        ] });
      });
      return row;
    });
    // A new result: type it in, Enter adds it.
    const nName = h('input', { class: 'ex-cell', placeholder: 'Add a test or exam…', 'aria-label': 'New assessment' });
    const nWeight = h('input', { class: 'ex-cell is-num', type: 'number', min: '0', step: '0.5', placeholder: 'wt', 'aria-label': 'New weight (%)' });
    const nMark = h('input', { class: 'ex-cell is-num is-mark', type: 'number', min: '0', max: '100', step: '0.1', placeholder: '%', 'aria-label': 'New mark (%)' });
    const add = () => {
      const w = parseFloat(nWeight.value);
      const m = parseFloat(nMark.value);
      if (!nName.value.trim() || !Number.isFinite(w) || !Number.isFinite(m)) return;
      t.results.push({ name: nName.value.trim(), weight: w, mark: m });
      this.save();
      this.render();
      const again = this.slot.querySelector('.ex-row.is-new .ex-cell');
      if (again) again.focus();
    };
    [nName, nWeight, nMark].forEach((input) => input.addEventListener('keydown', (e) => e.key === 'Enter' && add()));
    return h('div', { class: 'ex-card' },
      h('div', { class: 'ex-card-head' }, h('h3', null, 'School results'), h('span', { class: 'ex-sub' }, 'weight % · mark %')),
      h('div', { class: 'ex-rows' }, ...rows,
        h('div', { class: 'ex-row is-new' }, nName, nWeight, h('span'), nMark, h('button', { class: 'ex-add', type: 'button', 'aria-label': 'Add the result', onclick: add }, '+'))));
  }

  literatureCard() {
    return h('div', { class: 'ex-card ex-lit' },
      h('span', { class: 'mono-label' }, 'WACE papers'),
      h('h3', null, 'Literature isn’t marked question by question.'),
      h('p', null, 'Close readings and essays don’t split into marks you can self-score, so this subject tracks your school results, your target and the exam mark you need.'));
  }

  papersPart(needed, marked) {
    const t = this.t;
    const available = findPapers(this.io.files());
    const years = new Set([...Object.keys(available), ...t.papers.map((p) => p.name)]);
    const list = [...years].sort();
    const byName = new Map(t.papers.map((p) => [p.name, p]));
    if (!this.chosen || !byName.has(this.chosen)) this.chosen = marked.length ? marked[marked.length - 1].name : null;

    const booklets = h('div', { class: 'ex-booklets' }, list.length ? list.map((name) => {
      const p = byName.get(name);
      const pct = p ? paperPercent(p, t.course) : null;
      const b = h('button', { class: `ex-booklet${p ? '' : ' is-blank'}${name === this.chosen ? ' is-on' : ''}`, type: 'button' },
        h('span', { class: 'mono-label' }, 'WACE'),
        h('span', { class: 'ex-booklet-year' }, name),
        h('span', { class: 'ex-booklet-gap' }),
        pct != null ? h('span', { class: 'ex-booklet-pct' }, `${pct}%`) : h('span', { class: 'ex-booklet-mark' }, p ? 'Carry on →' : 'Mark it →'));
      b.addEventListener('click', () => {
        if (p && pct != null) {
          this.chosen = name;
          this.render();
        } else this.startMarking(name, available[name]);
      });
      b.addEventListener('contextmenu', (e) => this.paperMenu(e, name, p, available[name]));
      b.addEventListener('dblclick', (e) => this.paperMenu(e, name, p, available[name]));
      return b;
    }) : h('span', { class: 'ex-sub' }, 'Put WACE paper PDFs in a “WACE” folder inside this subject, then mark them here.'));

    const chosen = byName.get(this.chosen);
    const parts = [h('div', { class: 'ex-card-head ex-papers-head' }, h('span', { class: 'mono-label' }, 'WACE papers'), h('span', { class: 'ex-sub' }, 'right-click a paper for more')), booklets];
    if (chosen) {
      const pct = paperPercent(chosen, t.course);
      const secs = paperSections(chosen, t.course);
      parts.push(h('div', { class: 'ex-pair' },
        h('div', { class: 'ex-card' },
          h('div', { class: 'ex-card-head' }, h('h3', null, `${chosen.name} paper by section`),
            h('span', { class: 'ex-sub' }, needed == null ? '' : pct >= needed ? `clears the ${needed}% you need` : `${needed - pct} short of the ${needed}% you need`)),
          ...secs.map((s) => h('div', { class: 'ex-sec' },
            h('span', { class: 'ex-sec-name' }, h('b', null, s.name), h('small', null, `${s.weight}% of the exam`)),
            h('span', { class: 'ex-bar is-thick' }, h('span', { style: `width: ${s.answered ? Math.min(100, (s.got / s.outOf) * 100) : 0}%; background: var(--ink)` })),
            h('span', { class: 'ex-sec-score' }, s.answered ? `${s.got} / ${s.outOf}` : 'not marked')))),
        h('div', { class: 'ex-card ex-exam-mark' },
          h('span', { class: 'mono-label' }, 'Exam mark'),
          h('span', { class: 'ex-big' }, `${pct}%`),
          h('span', { class: 'ex-sub' }, 'weighted by section'))));
    }

    const losses = lossesByType(t.papers);
    const most = losses.reduce((m, e) => Math.max(m, e.of), 1);
    const avgs = sectionAverages(t.papers, t.course);
    parts.push(h('div', { class: 'ex-card ex-losses' },
      h('div', { class: 'ex-card-head' }, h('h3', null, 'Where the marks go'), h('span', { class: 'ex-sub' }, 'all marked papers · biggest losses first')),
      losses.length ? h('div', { class: 'ex-loss-list' },
        h('div', { class: 'ex-loss is-head mono-label' }, h('span', null, 'Question type'), h('span', null, 'kept · lost'), h('span', null, 'Marks lost'), h('span', null, 'Headaches')),
        ...losses.map((e) => h('div', { class: 'ex-loss' },
          h('span', { class: 'ex-loss-name' }, e.name),
          h('span', { class: 'ex-bar' }, h('span', { style: `width: ${((e.of - e.lost) / most) * 100}%; background: var(--ink-4)` }), h('span', { style: `width: ${(e.lost / most) * 100}%; background: var(--danger)` })),
          h('span', { class: 'ex-loss-n' }, h('b', null, String(e.lost)), ` of ${e.of}`),
          h('span', { class: 'ex-aches' }, ...Array.from({ length: Math.min(5, e.ache) }, () => h('span', { class: 'ex-ache' })))))) :
        h('span', { class: 'ex-sub' }, 'Mark a paper and the question types that cost you most show up here.'),
      h('div', { class: 'ex-foot' },
        ...avgs.map((a) => h('span', { class: 'ex-pill' }, `${a.name} `, h('b', null, `${a.avg}%`))),
        h('span', { style: 'flex: 1' }),
        h('button', { class: 'ex-go', type: 'button', onclick: () => {
          const next = list.find((name) => !byName.has(name)) || list[list.length - 1];
          if (next) this.startMarking(next, available[next]);
        } }, 'Mark a paper'))));
    return parts;
  }

  paperMenu(event, name, paper, paths) {
    const items = [];
    if (paper) items.push({ label: 'Edit the marking', onSelect: () => this.startMarking(name, paths, paper) });
    else items.push({ label: 'Mark this paper', onSelect: () => this.startMarking(name, paths) });
    for (const p of paths || []) items.push({ label: `Open ${p.split('/').pop()}`, onSelect: () => this.io.openFile(p) });
    if (paper) {
      items.push('separator', { label: 'Remove the marking', danger: true, onSelect: () => {
        if (!confirm(`Remove your marking of the ${name} paper? (The PDF stays.)`)) return;
        this.t.papers = this.t.papers.filter((p) => p.name !== name);
        this.save();
        this.render();
      } });
    }
    showMenu(event, { title: `${name} paper`, items });
  }

  // ---------- marking a paper ----------

  async startMarking(name, paths, existing = null) {
    const t = this.t;
    const saved = existing || t.papers.find((p) => p.name === name);
    if (saved) {
      this.marking = { name, sections: saved.sections.slice(), questions: saved.questions.map((q) => ({ ...q })), paths: paths || [] };
      this.render();
      return;
    }
    this.marking = { name, sections: [], questions: [], loading: true, paths: paths || [] };
    this.render();
    let read = null;
    try {
      if (paths && paths.length) read = readPaperLines(await this.io.pdfLines(paths), t.course);
    } catch (err) {
      console.warn('Opal could not read the paper', err);
      window.__examReadError = String(err && err.stack || err);
      read = null;
    }
    if (!read || !read.questions.length) {
      // Couldn't read it: the course's usual sections, one line each.
      const secs = COURSES[t.course].sections.map(([n, weight, marks]) => ({ name: n, weight, marks }));
      read = { sections: secs, questions: secs.map((s, i) => ({ q: String(i + 1), section: s.name, of: s.marks, got: null, ache: 0, note: '', type: '' })) };
      this.marking.unread = true;
    }
    this.marking = { ...this.marking, ...read, loading: false };
    this.render();
  }

  markingView() {
    const m = this.marking;
    const t = this.t;
    const course = COURSES[t.course];
    const draft = { name: m.name, sections: m.sections, questions: m.questions };
    const secs = paperSections(draft, t.course);
    const pct = paperPercent(draft, t.course);
    const filter = m.filter || 'all';
    const types = course.types.map(([name]) => name);
    const extra = [...new Set(m.questions.map((q) => q.type).filter((x) => x && !types.includes(x)))];

    const rows = m.questions.map((q, i) => ({ q, i })).filter(({ q }) => filter === 'all' || q.section === filter).map(({ q, i }) => {
      const sel = h('select', { class: 'ex-type', 'aria-label': `Question ${q.q} type` },
        h('option', { value: '' }, '— type —'),
        ...[...types, ...extra, ...(q.q === 'MC' ? ['Multiple choice'] : [])].filter((v, k, arr) => arr.indexOf(v) === k).map((name) => h('option', { value: name }, name)));
      sel.value = q.type || '';
      sel.addEventListener('change', () => {
        m.questions[i].type = sel.value;
        this.render();
      });
      const setGot = (v) => {
        m.questions[i].got = v == null ? null : Math.max(0, Math.min(q.of, v));
        this.render();
      };
      const got = h('input', { class: 'ex-got', type: 'number', min: '0', max: String(q.of), value: q.got == null ? '' : String(q.got), placeholder: '–', 'aria-label': `Question ${q.q} marks` });
      got.addEventListener('change', () => {
        const v = parseFloat(got.value);
        setGot(Number.isFinite(v) ? v : null);
      });
      const note = h('input', { class: 'ex-note', value: q.note || '', placeholder: 'What tripped you up?', 'aria-label': `Question ${q.q} notes` });
      note.addEventListener('change', () => {
        m.questions[i].note = note.value;
      });
      return h('div', { class: `ex-q${q.got == null ? ' is-blank' : ''}` },
        h('span', { class: 'ex-q-n' }, q.q),
        sel,
        h('span', { class: 'ex-marks' },
          h('button', { class: 'ex-step is-small', type: 'button', 'aria-label': 'One mark less', onclick: () => setGot(q.got == null ? 0 : q.got - 1) }, '−'),
          got,
          h('span', { class: 'ex-of' }, `/ ${q.of}`),
          h('button', { class: 'ex-step is-small', type: 'button', 'aria-label': 'One mark more', onclick: () => setGot(q.got == null ? q.of : q.got + 1) }, '+')),
        h('span', { class: 'ex-q-aches' }, ...[1, 2, 3].map((level) => h('button', {
          class: `ex-ache-btn${level <= q.ache ? ' is-on' : ''}`, type: 'button', 'aria-label': `Headache ${level} of 3`,
          onclick: () => {
            m.questions[i].ache = q.ache === level ? level - 1 : level;
            this.render();
          },
        }, h('span')))),
        note);
    });

    const lostBy = lossesByType([draft]);
    const most = lostBy.reduce((a, e) => Math.max(a, e.lost), 1);
    const worst = m.questions.filter((q) => q.got != null).sort((a, b) => b.ache - a.ache || (b.of - b.got) - (a.of - a.got))[0];
    const school = schoolMark(t.results);
    const needed = neededInExam(t.target, school);

    const done = () => {
      const paper = { name: m.name, sections: m.sections, questions: m.questions };
      const at = t.papers.findIndex((p) => p.name === m.name);
      if (at === -1) t.papers.push(paper);
      else t.papers[at] = paper;
      t.papers.sort((a, b) => a.name.localeCompare(b.name));
      this.chosen = m.name;
      this.marking = null;
      this.save();
      this.render();
    };

    return h('section', { class: 'ex ex-marking', 'aria-label': `Marking the ${m.name} paper` },
      h('div', { class: 'ex-mark-side' },
        h('button', { class: 'ex-back', type: 'button', onclick: () => {
          this.marking = null;
          this.render();
        } }, '← Exam tracker'),
        h('span', { class: 'mono-label' }, `WACE ${m.name}`),
        h('h2', { class: 'ex-mark-title' }, course.name),
        h('div', { class: 'ex-card' }, ...(secs.length ? secs : m.sections.map((s) => ({ ...s, total: 0 }))).map((s) => h('div', { class: 'ex-mark-sec' },
          h('span', null, h('b', null, s.name), h('span', null, `${s.weight}%`)),
          h('small', null, `${m.questions.filter((q) => q.section === s.name).length} question${m.questions.filter((q) => q.section === s.name).length === 1 ? '' : 's'} · ${s.marks} marks`)))),
        h('div', { class: 'ex-card' },
          h('span', { class: 'mono-label' }, 'Your mark'),
          h('span', { class: 'ex-big is-accent' }, pct == null ? '—' : `${pct}%`),
          ...secs.map((s) => h('span', { class: 'ex-mark-line' }, h('span', null, s.name), h('b', null, s.answered ? `${s.got} / ${s.outOf}` : '—'))),
          needed != null && pct != null ? h('span', { class: 'ex-sub' }, pct >= needed ? `clears the ${needed}% you need` : `${needed - pct} short of the ${needed}% you need`) : null),
        m.unread ? h('span', { class: 'ex-sub' }, 'Opal couldn’t read this paper’s questions, so each section is one line — change the marks out of as you go.') : null,
        (m.paths || []).length ? h('div', { class: 'ex-open' }, ...m.paths.map((p) => h('button', { class: 'ex-chip', type: 'button', onclick: () => this.io.openFile(p) }, `Open ${p.split('/').pop()}`))) : null),
      h('div', { class: 'ex-card ex-mark-main' },
        h('div', { class: 'ex-card-head' }, h('h3', null, 'Mark it, question by question'),
          h('span', { class: 'ex-filters' }, ...['all', ...m.sections.map((s) => s.name)].map((f) => h('button', {
            class: `ex-chip${filter === f ? ' is-on' : ''}`, type: 'button', onclick: () => {
              m.filter = f;
              this.render();
            },
          }, f === 'all' ? 'All' : f)))),
        m.loading ? h('span', { class: 'ex-sub' }, 'Reading the paper…') : h('div', { class: 'ex-qs' },
          h('div', { class: 'ex-q is-head mono-label' }, h('span', null, 'Q'), h('span', null, 'Question type'), h('span', null, 'Marks'), h('span', null, 'Headache'), h('span', null, 'Notes')),
          ...rows),
        h('span', { class: 'ex-sub' }, 'Leave the marks blank for a question you didn’t answer (choice sections).')),
      h('div', { class: 'ex-mark-side is-right' },
        h('div', { class: 'ex-card' },
          h('h3', null, 'Lost on this paper'),
          lostBy.filter((e) => e.lost).length ? lostBy.filter((e) => e.lost).map((e) => h('div', { class: 'ex-lost' },
            h('span', null, h('span', null, e.name), h('b', null, `−${e.lost}`)),
            h('span', { class: 'ex-bar' }, h('span', { style: `width: ${(e.lost / most) * 100}%; background: var(--danger)` })))) : h('span', { class: 'ex-sub' }, 'Nothing lost yet.')),
        worst && (worst.ache || worst.of - worst.got) ? h('div', { class: 'ex-card is-accent' },
          h('span', { class: 'mono-label' }, 'Biggest headache'),
          h('span', { class: 'ex-verdict' }, `Q${worst.q}${worst.type ? ` — ${worst.type.toLowerCase()}` : ''}. ${worst.of - worst.got} mark${worst.of - worst.got === 1 ? '' : 's'} gone.`)) : null,
        h('button', { class: 'ex-save', type: 'button', onclick: done }, 'Save this paper')));
  }
}
