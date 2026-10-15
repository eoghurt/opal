// School: the page for a folder of subjects that each have an exam tracker
// (School/Methods/Exam tracker.md, School/Economics/Exam tracker.md…). One
// overview of every subject — marks, what's needed in the WACE, the exam
// dates from the calendar, moderation from a "Predicted ATAR" PDF — down a
// rail down the left, with the folder's files on the Files page.
// It only reads the notes; results are added to the subject's tracker note.
//
//   new SchoolView(container, { tab, io })
//   io: name, load() → { subjects, exams, predicted, files }, openFolder(path),
//       openFile(path), openPaper(trackerPath, year), addResult(trackerPath, result),
//       openDay(key), mountFiles(slot), onTab(tab)

import { h, icon } from '../../ui.js';
import { COURSES, schoolMark, neededInExam, paperPercent } from './exams.js';

const RAIL = [
  ['overview', 'Overview', 'fidget'],
  ['marks', 'Marks', 'chart'],
  ['papers', 'Papers', 'pen'],
  ['dates', 'Dates', 'calendar'],
  ['files', 'Files', 'folder'],
];

const DAY = 86400000;
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function keyDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function today() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
const daysUntil = (key) => Math.round((keyDate(key) - today()) / DAY);
const shortDay = (key) => {
  const d = keyDate(key);
  return `${WEEKDAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`;
};
const clock = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
const fmt = (n) => (n == null ? '—' : String(Math.round(n * 10) / 10));

// How hard the needed exam mark looks next to the school mark.
function outlook(needed, school, moderated) {
  if (needed == null) return null;
  if (needed > 100) return { label: `Best final ${Math.round(((moderated ?? school) + 100) / 2)}`, tone: 'red', mark: '✕' };
  if (needed <= school) return { label: 'On track', tone: 'good', mark: '✓' };
  if (needed <= school + 8) return { label: 'Within reach', tone: 'good', mark: '●' };
  return { label: 'Stretch', tone: 'amber', mark: '▲' };
}

// A small line of a subject's results, oldest to newest.
function sparkline(marks) {
  const span = h('span', { class: 'sch-spark', 'aria-hidden': 'true' });
  if (marks.length < 2) return span;
  const x = (i) => Math.round((i * 88) / (marks.length - 1) * 10) / 10;
  const y = (m) => Math.round((26 - (Math.max(40, Math.min(100, m)) - 40) / 60 * 24) * 10) / 10;
  const pts = marks.map((m, i) => `${x(i)},${y(m)}`).join(' ');
  span.innerHTML = `<svg width="88" height="28" viewBox="0 0 88 28"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><circle cx="88" cy="${y(marks[marks.length - 1])}" r="2.6" fill="currentColor"/></svg>`;
  return span;
}

export class SchoolView {
  constructor(container, { tab, io }) {
    this.container = container;
    this.io = io;
    this.tab = RAIL.some(([id]) => id === tab) ? tab : 'overview';
    this.basis = 'moderated';
    this.adding = false;
    this.root = h('div', { class: 'deb sch' });
    container.replaceChildren(this.root);
    this.root.append(h('p', { class: 'deb-muted' }, 'Reading your subjects…'));
    this.load();
  }

  destroy() {}

  async load() {
    try {
      this.data = await this.io.load();
    } catch (err) {
      this.root.replaceChildren(h('p', { class: 'deb-muted' }, `Couldn't read the subjects: ${err.message}`));
      return;
    }
    const { subjects, exams } = this.data;
    for (const s of subjects) {
      s.school = schoolMark(s.tracker.results);
      s.exam = exams.find((e) => e.subject === s.name) || null;
      s.marked = s.tracker.papers
        .filter((p) => p.questions.some((q) => q.got != null))
        .map((p) => ({ name: p.name, percent: paperPercent(p, s.tracker.course) }));
      s.noPapers = !!(COURSES[s.tracker.course] || {}).noPapers;
    }
    // In exam order; subjects with no exam found go last.
    subjects.sort((a, b) => (a.exam ? a.exam.day : '9999').localeCompare(b.exam ? b.exam.day : '9999') || a.name.localeCompare(b.name));
    this.render();
  }

  go(tab, extra = {}) {
    this.tab = tab;
    Object.assign(this, extra);
    if (this.io.onTab) this.io.onTab(tab);
    this.render();
  }

  render() {
    if (!this.data) return;
    const rail = h('nav', { class: 'deb-rail', 'aria-label': this.io.name },
      RAIL.map(([id, label, ic]) => h('button', {
        type: 'button',
        class: `deb-rail-btn${this.tab === id ? ' is-on' : ''}`,
        'aria-current': this.tab === id ? 'page' : null,
        onclick: () => this.go(id),
      }, icon(ic, 20), h('span', null, label))));
    const pages = {
      overview: () => this.overview(),
      marks: () => this.marksPage(),
      papers: () => this.papersPage(),
      dates: () => this.datesPage(),
      files: () => this.filesPage(),
    };
    let main;
    try {
      main = pages[this.tab]();
    } catch (err) {
      main = h('p', { class: 'deb-empty' }, `Something went wrong drawing this page: ${err.message}`);
    }
    this.root.replaceChildren(rail, h('main', { class: 'deb-main' }, main));
  }

  head(title, actions = []) {
    const d = new Date();
    return h('div', { class: 'deb-head' },
      h('div', { class: 'deb-title' },
        h('span', { class: 'deb-kicker' }, `${this.io.name} · ${WEEKDAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`),
        h('h1', { class: 'deb-h1 sch-h1' }, title)),
      actions.length ? h('div', { class: 'deb-actions' }, actions) : null);
  }

  upcoming() {
    return this.data.subjects.filter((s) => s.exam && daysUntil(s.exam.day) >= 0);
  }

  needed(s) {
    const base = this.basis === 'moderated' && s.tracker.moderated != null ? s.tracker.moderated : s.school;
    return neededInExam(s.tracker.target, base);
  }

  folderLink(s, child) {
    return h('button', {
      type: 'button',
      class: 'sch-subject',
      'data-open-path': s.path,
      'data-open-kind': 'folder',
      onclick: () => this.io.openFolder(s.path),
    }, h('span', { class: 'sch-dot', style: `background: ${s.color}` }), child || s.name);
  }

  // ---------- Overview ----------

  overview() {
    const { subjects, predicted } = this.data;
    const next = this.upcoming()[0];
    const n = next ? daysUntil(next.exam.day) : null;
    const title = n == null ? `${this.io.name}.` : n === 0 ? 'Exam day.' : n === 1 ? '1 day to go.' : `${n} days to go.`;
    const head = this.head(title, [
      h('button', { type: 'button', class: 'deb-btn', onclick: () => this.go('papers') }, 'Mark a paper'),
      h('button', { type: 'button', class: 'deb-btn is-primary', onclick: () => this.go('marks', { adding: true }) }, '+ Add a result'),
    ]);

    // Headline numbers.
    const withPapers = subjects.filter((s) => !s.noPapers);
    const available = withPapers.reduce((a, s) => a + Object.keys(s.papers).length, 0);
    const marked = subjects.reduce((a, s) => a + s.marked.length, 0);
    const stat = (label, big, sub) => h('div', { class: 'deb-card sch-stat' },
      h('span', { class: 'sch-stat-label' }, label), h('span', { class: 'sch-stat-big' }, big), h('span', { class: 'sch-stat-sub' }, sub));
    const stats = h('div', { class: 'sch-stats' },
      predicted && predicted.atar != null ? stat('Predicted ATAR', predicted.atar.toFixed(2), predicted.label || 'from the Predicted ATAR PDF') : null,
      predicted && predicted.average != null
        ? stat('Average adjusted', fmt(predicted.average), predicted.tea != null ? `TEA predictor ${predicted.tea}` : '')
        : stat('Average school mark', fmt(avg(subjects.map((s) => s.school))), `across ${subjects.length} subjects`),
      next ? stat('First exam', next.name, `${shortDay(next.exam.day)}${next.exam.allDay ? '' : ` · ${clock(next.exam.start)}`}`) : stat('First exam', '—', 'none in your calendar'),
      stat('WACE papers marked', h('span', null, String(marked), h('small', null, ` of ${available}`)),
        subjects.filter((s) => s.marked.length).map((s) => `${s.name.split(' ')[0]} ${s.marked.length}`).join(' · ') || 'none yet'));

    return h('div', { class: 'deb-page' }, head, stats, this.subjectsCard(), this.examsAndModeration(), this.latestAndFiles());
  }

  subjectsCard() {
    const { subjects } = this.data;
    const anyModerated = subjects.some((s) => s.tracker.moderated != null);
    const toggle = anyModerated ? h('div', { class: 'sch-seg', role: 'group', 'aria-label': 'Work out from' },
      [['moderated', 'Moderated'], ['school', 'School mark']].map(([id, label]) => h('button', {
        type: 'button',
        class: this.basis === id ? 'is-on' : '',
        'aria-pressed': String(this.basis === id),
        onclick: () => { this.basis = id; this.render(); },
      }, label))) : null;
    const rows = subjects.map((s) => {
      const needed = this.needed(s);
      const look = outlook(needed, s.school ?? 0, s.tracker.moderated);
      const bar = h('span', { class: `sch-bar${needed > 100 ? ' is-over' : ''}` },
        needed > 100 ? null : h('span', { class: 'sch-bar-fill', style: `width: ${Math.max(0, Math.min(100, needed || 0))}%` }));
      return h('tr', null,
        h('td', null, this.folderLink(s)),
        h('td', null, sparkline(s.tracker.results.map((r) => r.mark))),
        h('td', { class: 'sch-num' }, fmt(s.school)),
        h('td', { class: 'sch-num' }, fmt(s.tracker.moderated)),
        h('td', { class: 'sch-num' }, fmt(s.tracker.target)),
        h('td', null, needed == null ? h('span', { class: 'deb-muted' }, 'add a result') : h('div', { class: 'sch-need' },
          bar,
          h('span', { class: 'sch-need-num' }, String(needed)),
          look ? h('span', { class: `sch-tag is-${look.tone}` }, `${look.mark} ${look.label}`) : null)),
        h('td', { class: 'sch-when' }, s.exam ? h('button', { type: 'button', class: 'sch-day', 'data-open-day': s.exam.day, onclick: () => this.io.openDay(s.exam.day) },
          shortDay(s.exam.day), h('span', null, daysUntil(s.exam.day) >= 0 ? ` · ${daysUntil(s.exam.day)}d` : ' · done')) : h('span', { class: 'deb-muted' }, s.noPapers ? '—' : 'not in calendar')));
    });
    return h('section', { class: 'deb-card' },
      h('div', { class: 'deb-card-head' }, h('h2', null, 'Subjects'), toggle),
      h('div', { class: 'sch-table-wrap' },
        h('table', { class: 'sch-table' },
          h('thead', null, h('tr', null, ['Subject', 'Results', 'School', 'Moderated', 'Target', 'Needed in the WACE', 'Exam'].map((t) => h('th', null, t)))),
          h('tbody', null, rows))));
  }

  examsAndModeration() {
    const cards = [];
    const exams = this.upcoming();
    if (exams.length >= 2) {
      const first = keyDate(exams[0].exam.day);
      const span = Math.max(1, Math.round((keyDate(exams[exams.length - 1].exam.day) - first) / DAY));
      const line = h('div', { class: 'sch-line' }, h('span', { class: 'sch-line-rule' }));
      exams.forEach((s, i) => {
        const at = Math.round((keyDate(s.exam.day) - first) / DAY) / span * 100;
        const end = at > 85 ? ' is-end' : '';
        line.append(
          h('span', { class: 'sch-line-dot', style: `left: ${at}%; background: ${s.color}` }),
          h('button', {
            type: 'button',
            class: `sch-line-label${i % 2 ? ' is-low' : ''}${end}`,
            style: `left: ${at}%`,
            'data-open-day': s.exam.day,
            onclick: () => this.io.openDay(s.exam.day),
          }, h('b', null, s.name.split(' ')[0]), h('span', null, `${WEEKDAY[keyDate(s.exam.day).getDay()]}${!s.exam.allDay && s.exam.start >= 720 ? ' pm' : ''}`)));
      });
      line.append(
        h('span', { class: 'sch-line-end' }, `${keyDate(exams[0].exam.day).getDate()} ${MONTH[first.getMonth()]}`),
        h('span', { class: 'sch-line-end is-right' }, shortDay(exams[exams.length - 1].exam.day).split(' ').slice(1).join(' ')));
      cards.push(h('section', { class: 'deb-card' }, h('div', { class: 'deb-card-head' }, h('h2', null, span <= 16 ? 'Exam fortnight' : 'Exams')), line));
    }
    const p = this.data.predicted;
    const rows = p ? this.data.subjects.filter((s) => p.courses[s.tracker.course]) : [];
    if (rows.length) {
      const vals = rows.flatMap((s) => [p.courses[s.tracker.course].school, p.courses[s.tracker.course].adjusted]);
      const lo = Math.max(0, Math.floor((Math.min(...vals) - 5) / 10) * 10);
      const hi = Math.min(100, Math.ceil((Math.max(...vals) + 5) / 10) * 10);
      const x = (v) => ((v - lo) / (hi - lo)) * 100;
      cards.push(h('section', { class: 'deb-card' },
        h('div', { class: 'deb-card-head' }, h('h2', null, 'Moderation')),
        h('p', { class: 'deb-small' }, `${p.term || 'Last predictor'}: your school score `, h('span', { class: 'sch-key is-hollow' }), ' and where it was moved to ', h('span', { class: 'sch-key' })),
        h('div', { class: 'sch-mod' },
          rows.map((s) => {
            const c = p.courses[s.tracker.course];
            const d = Math.round(c.adjusted - c.school);
            return h('div', { class: 'sch-mod-row' },
              h('span', { class: 'deb-ellipsis' }, s.name),
              h('span', { class: 'sch-mod-track' },
                h('span', { class: 'sch-mod-span', style: `left: ${Math.min(x(c.school), x(c.adjusted))}%; width: ${Math.abs(x(c.adjusted) - x(c.school))}%` }),
                h('span', { class: 'sch-mod-from', style: `left: ${x(c.school)}%`, title: `School ${c.school}` }),
                h('span', { class: 'sch-mod-to', style: `left: ${x(c.adjusted)}%`, title: `Moved to ${c.adjusted}` })),
              h('span', { class: `sch-mod-diff${d > 0 ? ' is-good' : d < -1 ? ' is-red' : ''}` }, d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '0'));
          }),
          h('div', { class: 'sch-mod-row is-axis' }, h('span'), h('span', { class: 'sch-mod-axis' }, h('span', null, String(lo)), h('span', null, String((lo + hi) / 2)), h('span', null, String(hi))), h('span')))));
    }
    return cards.length ? h('div', { class: 'deb-row' }, cards) : null;
  }

  latestAndFiles() {
    const { subjects, files } = this.data;
    const latest = subjects.filter((s) => s.tracker.results.length).map((s) => {
      const r = s.tracker.results[s.tracker.results.length - 1];
      return h('button', { type: 'button', class: 'sch-li', 'data-open-path': s.trackerPath, onclick: () => this.io.openFile(s.trackerPath) },
        h('span', { class: 'sch-dot', style: `background: ${s.color}` }),
        h('span', { class: 'sch-li-name' }, r.name, h('small', null, ` ${s.name}`)),
        h('span', { class: 'sch-li-num' }, fmt(r.mark)));
    });
    return h('div', { class: 'deb-row' },
      h('section', { class: 'deb-card' }, h('div', { class: 'deb-card-head' }, h('h2', null, 'Latest results')),
        latest.length ? h('div', { class: 'sch-list' }, latest) : h('p', { class: 'deb-empty' }, 'Results you add show up here.')),
      h('section', { class: 'deb-card' }, h('div', { class: 'deb-card-head' }, h('h2', null, `In ${this.io.name}`)),
        h('div', { class: 'sch-folders' }, subjects.map((s) => h('button', {
          type: 'button', class: 'sch-folder', 'data-open-path': s.path, 'data-open-kind': 'folder', onclick: () => this.io.openFolder(s.path),
        }, h('b', null, h('span', { class: 'sch-dot', style: `background: ${s.color}` }), s.name), h('span', null, `${s.items} item${s.items === 1 ? '' : 's'}`)))),
        files.length ? h('div', { class: 'sch-list' },
          files.slice(0, 3).map((f) => h('button', { type: 'button', class: 'sch-li', 'data-open-path': f.path, onclick: () => this.io.openFile(f.path) },
            h('span', { class: 'sch-li-name' }, f.name), h('small', null, f.meta))),
          files.length > 3 ? h('button', { type: 'button', class: 'sch-li is-link', onclick: () => this.go('files') }, `${files.length - 3} more file${files.length - 3 === 1 ? '' : 's'}`) : null) : null));
  }

  // ---------- Marks ----------

  marksPage() {
    const { subjects } = this.data;
    const form = this.adding ? this.addForm() : null;
    return h('div', { class: 'deb-page' },
      this.head('Marks.', [h('button', { type: 'button', class: 'deb-btn is-primary', onclick: () => { this.adding = !this.adding; this.render(); } }, this.adding ? 'Close' : '+ Add a result')]),
      form,
      h('div', { class: 'deb-grid3' }, subjects.map((s) => h('section', { class: 'deb-card' },
        h('div', { class: 'deb-card-head' }, h('h2', null, this.folderLink(s)), h('span', { class: 'sch-stat-sub' }, s.school == null ? 'no results yet' : `school ${fmt(s.school)}`)),
        s.tracker.results.length ? h('div', { class: 'sch-list' }, s.tracker.results.map((r) => h('div', { class: 'sch-li is-static' },
          h('span', { class: 'sch-li-name' }, r.name, h('small', null, ` ${fmt(r.weight)}%`)),
          h('span', { class: 'sch-li-num' }, fmt(r.mark))))) : h('p', { class: 'deb-empty' }, 'No results yet.'),
        h('button', { type: 'button', class: 'deb-link', 'data-open-path': s.trackerPath, onclick: () => this.io.openFile(s.trackerPath) }, 'Open the tracker note')))));
  }

  addForm() {
    const { subjects } = this.data;
    const pick = h('select', { class: 'sch-input', 'aria-label': 'Subject' }, subjects.map((s) => h('option', { value: s.trackerPath }, s.name)));
    const name = h('input', { class: 'sch-input is-wide', placeholder: 'Assessment (or leave blank for Untitled)', 'aria-label': 'Assessment' });
    const weight = h('input', { class: 'sch-input', type: 'number', min: '0', step: 'any', placeholder: 'Weight %', 'aria-label': 'Weight' });
    const mark = h('input', { class: 'sch-input', type: 'number', min: '0', max: '100', step: 'any', placeholder: 'Mark %', 'aria-label': 'Mark' });
    const add = async (event) => {
      event.preventDefault();
      const w = parseFloat(weight.value);
      const m = parseFloat(mark.value);
      if (!Number.isFinite(w) || !Number.isFinite(m)) {
        (Number.isFinite(w) ? mark : weight).focus();
        return;
      }
      try {
        await this.io.addResult(pick.value, { name: name.value.trim() || 'Untitled', weight: w, mark: m });
        this.adding = false;
        await this.load();
      } catch (err) {
        alert(`Couldn't add the result.\n\n${err.message}`);
      }
    };
    setTimeout(() => name.focus(), 0);
    return h('form', { class: 'deb-card sch-form', onsubmit: add }, pick, name, weight, mark, h('button', { type: 'submit', class: 'deb-btn is-primary' }, 'Add'));
  }

  // ---------- Papers ----------

  papersPage() {
    const subjects = this.data.subjects.filter((s) => !s.noPapers);
    return h('div', { class: 'deb-page' },
      this.head('Papers.'),
      h('div', { class: 'deb-grid3' }, subjects.map((s) => {
        const years = Object.keys(s.papers).sort().reverse();
        return h('section', { class: 'deb-card' },
          h('div', { class: 'deb-card-head' }, h('h2', null, this.folderLink(s)), h('span', { class: 'sch-stat-sub' }, `${s.marked.length} of ${years.length} marked`)),
          years.length ? h('div', { class: 'sch-list' }, years.map((y) => {
            const done = s.marked.find((p) => p.name === y);
            return h('div', { class: 'sch-li is-static' },
              h('span', { class: 'sch-li-name' }, h('b', null, y), h('small', null, done ? ` ${done.percent == null ? 'started' : `${done.percent}%`}` : ' not marked')),
              h('button', { type: 'button', class: `deb-btn${done ? '' : ' is-primary'} sch-small`, onclick: () => this.io.openPaper(s.trackerPath, y) }, done ? 'Open' : 'Mark'));
          })) : h('p', { class: 'deb-empty' }, 'No WACE papers found in this folder.'));
      })));
  }

  // ---------- Dates ----------

  datesPage() {
    const { subjects } = this.data;
    const withExam = subjects.filter((s) => s.exam);
    const missing = subjects.filter((s) => !s.exam && !s.noPapers);
    return h('div', { class: 'deb-page' },
      this.head('Dates.'),
      h('section', { class: 'deb-card' },
        h('div', { class: 'deb-card-head' }, h('h2', null, 'WACE exams')),
        withExam.length ? h('div', { class: 'sch-list' }, withExam.map((s) => {
          const n = daysUntil(s.exam.day);
          return h('button', { type: 'button', class: 'sch-li', 'data-open-day': s.exam.day, onclick: () => this.io.openDay(s.exam.day) },
            h('span', { class: 'sch-dot', style: `background: ${s.color}` }),
            h('span', { class: 'sch-li-name' }, s.name, h('small', null, ` ${shortDay(s.exam.day)}${s.exam.allDay ? '' : ` · ${clock(s.exam.start)}–${clock(s.exam.end)}`}`)),
            h('span', { class: 'sch-li-num' }, n < 0 ? 'done' : n === 0 ? 'today' : `${n} days`));
        })) : h('p', { class: 'deb-empty' }, 'No WACE exams in your calendar yet.'),
        missing.length ? h('p', { class: 'deb-small' }, `Not in the calendar: ${missing.map((s) => s.name).join(', ')}. Add an event like "${missing[0].name.split(' ')[0]} WACE" on the day.`) : null));
  }

  // ---------- Files ----------

  filesPage() {
    const slot = h('div', { class: 'sch-files' });
    setTimeout(() => slot.isConnected && this.io.mountFiles(slot), 0);
    return slot;
  }
}

function avg(list) {
  const nums = list.filter((n) => n != null);
  return nums.length ? nums.reduce((a, n) => a + n, 0) / nums.length : null;
}

// A school "Predicted ATAR" report (text from the PDF) → the predictor and
// each course's school and adjusted score. Course codes: ATPAL, ATLIT…
const CODES = { PAL: 'pal', LIT: 'literature', ECO: 'economics', ACF: 'accounting', MAM: 'methods' };
export function readPredicted(text) {
  const flat = String(text || '').replace(/\s+/g, ' ');
  const out = { courses: {} };
  const m = /Average Adjusted Score\s+TEA Predictor\s+ATAR Predictor\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i.exec(flat);
  if (m) Object.assign(out, { average: Number(m[1]), tea: Number(m[2]), atar: Number(m[3]) });
  for (const c of flat.matchAll(/\bAT([A-Z]{3})\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\b/g)) {
    if (CODES[c[1]]) out.courses[CODES[c[1]]] = { school: Number(c[2]), adjusted: Number(c[3]) };
  }
  const term = /Year \d+\s+(Semester \d)/i.exec(flat);
  if (term) {
    out.term = term[1];
    out.label = `${term[1]} predictor`;
  }
  return out.atar != null || Object.keys(out.courses).length ? out : null;
}
