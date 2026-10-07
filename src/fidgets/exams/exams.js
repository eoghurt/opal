// The exam tracker in a subject folder: everything lives in one note,
// "Exam tracker.md", readable in Obsidian:
//
//   ---
//   opal-type: exam-tracker
//   course: methods          (which WACE course: its sections and question types)
//   target: 70               (the final course score you're aiming for)
//   moderated: 58            (optional: your predicted moderated school score)
//   ---
//   ## School results
//   | Assessment | Weight | Mark |
//   ...
//   ## WACE papers
//   ### 2025
//   Sections: Calculator-free 35% of 47 marks; Calculator-assumed 65% of 97 marks
//   | Q | Section | Type | Marks | Out of | Headache | Notes |
//   ...
//
// A question you didn't answer (a choice section) has "–" for its marks.

export const TRACKER_NAME = 'Exam tracker';

// The WACE courses: question types to sort marks into, words that hint at a
// type in a question's opening lines, and the paper's sections (2025 layout)
// for papers Opal can't read.
export const COURSES = {
  methods: {
    name: 'Mathematics Methods',
    sections: [['Calculator-free', 35, 47], ['Calculator-assumed', 65, 97]],
    types: [
      ['Sampling & confidence intervals', /confidence|sample proportion|margin of error|survey|random sample|proportion of/i],
      ['Continuous RVs & normal', /density function|continuous random|normally distributed|normal distribution|life expectancy/i],
      ['Discrete RVs & binomial', /binomial|bernoulli|discrete random|probability distribution|balls|dice|coin|game/i],
      ['Exponentials & logarithms', /\bln\b|\blog|exponential|e\s*\^|decibel|half-life|sound intensity/i],
      ['Rectilinear motion', /velocity|acceleration|displacement|particle|moves along|travels along|runs backward/i],
      ['Rates of change & optimisation', /\brates?\b|maximi[sz]|minimi[sz]|optimi|greatest|least|flows into|path travelled/i],
      ['Integration & area', /integra|\barea\b|antideriv|accumulat|shaded/i],
      ['Trig functions', /\bsin\b|\bcos\b|\btan\b|angle of|rotat|period|amplitude/i],
      ['Differentiation & curve sketching', /deriv|tangent|stationary|gradient|graph|sketch|function/i],
    ],
  },
  accounting: {
    name: 'Accounting and Finance',
    sections: [['Multiple-choice', 15, 15], ['Short answer', 70, 156], ['Extended answer', 15, 30]],
    types: [
      ['Cash budgets', /cash budget/i],
      ['Standard costing & variances', /standard cost|variance|job costing|overhead/i],
      ['Cash flow statement', /cash flow|AASB 107|cash equivalent/i],
      ['Capital budgeting', /net present value|NPV|payback|capital budget|investment proposal|updating the/i],
      ['Ratio analysis', /ratio|earnings per share|return on|gearing|liquidity/i],
      ['Equity & dividends', /dividend|share capital|equity|shares|retained/i],
      ['Financial statements', /income statement|financial position|statement of/i],
      ['Ethics & sustainability', /ethic|sustainab|social responsib/i],
    ],
  },
  economics: {
    name: 'Economics',
    sections: [['Multiple-choice', 20, 20], ['Data interpretation', 50, 50], ['Extended · Unit 3', 15, 15], ['Extended · Unit 4', 15, 15]],
    types: [
      ['Exchange rates', /exchange rate|appreciat|depreciat|\bTWI\b/i],
      ['Monetary policy', /monetary|cash rate|Reserve Bank|RBA|interest rate/i],
      ['Fiscal policy', /fiscal|budget|government spending|taxation/i],
      ['Balance of payments', /balance of payments|current account|capital account|net foreign/i],
      ['Terms of trade', /terms of trade/i],
      ['Free trade & protection', /tariff|protection|free trade|quota|subsid|trade agreement/i],
      ['Foreign investment', /foreign investment|FDI|foreign direct/i],
      ['AE model & business cycle', /aggregate expenditure|\bAE\b|business cycle|multiplier|inventor/i],
      ['AD/AS & macro goals', /aggregate demand|aggregate supply|\bAD\b|\bAS\b|inflation|unemployment|economic growth/i],
      ['Labour productivity', /productivity/i],
    ],
  },
  pal: {
    name: 'Politics and Law',
    sections: [['Short answer', 30, 30], ['Source analysis', 20, 20], ['Essay · Unit 3', 25, 25], ['Essay · Unit 4', 25, 25]],
    types: [
      ['Source analysis', null],
      ['Essay · Unit 3', null],
      ['Essay · Unit 4', null],
      ['Parliament & law-making', /parliament|senate|house of representatives|legislat|bill/i],
      ['Judiciary & the Constitution', /high court|judicia|constitution|court/i],
      ['Executive & accountability', /executive|minister|cabinet|accountab|government/i],
      ['Rights protection', /right|freedom|liberty/i],
      ['Democratic principles', /democra|principle|represent|election/i],
    ],
  },
  literature: { name: 'Literature', sections: [], types: [], noPapers: true },
};

// Which course a folder is, from its name (for a new tracker).
export function guessCourse(folderName) {
  const n = folderName.toLowerCase();
  if (/method|math/.test(n)) return 'methods';
  if (/account/.test(n)) return 'accounting';
  if (/econ/.test(n)) return 'economics';
  if (/polit|law/.test(n)) return 'pal';
  if (/lit/.test(n)) return 'literature';
  return 'methods';
}

const round1 = (n) => Math.round(n * 10) / 10;

// ---------- reading and writing the note ----------

function splitFront(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { props: {}, body: text };
  const props = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    if (kv) props[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return { props, body: text.slice(m[0].length) };
}

function cells(line) {
  return line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}
const isRule = (line) => /^\s*\|?\s*:?-{2,}/.test(line);
const num = (v) => {
  const n = parseFloat(String(v).replace(/[%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// The note's text → { course, target, moderated, results, papers }
export function parseTracker(text, folderName = '') {
  const { props, body } = splitFront(text || '');
  const course = COURSES[props.course] ? props.course : guessCourse(folderName);
  const out = {
    course,
    target: num(props.target) || 70,
    moderated: num(props.moderated),
    results: [],
    papers: [],
  };
  let part = null;
  let paper = null;
  for (const line of body.split(/\r?\n/)) {
    const h2 = /^##\s+(.*)$/.exec(line);
    const h3 = /^###\s+(.*)$/.exec(line);
    if (h2 && !h3) {
      const t = h2[1].toLowerCase();
      part = t.includes('result') ? 'results' : t.includes('paper') ? 'papers' : null;
      paper = null;
      continue;
    }
    if (h3 && part === 'papers') {
      paper = { name: h3[1].trim(), sections: [], questions: [] };
      out.papers.push(paper);
      continue;
    }
    if (paper && /^sections:/i.test(line.trim())) {
      paper.sections = line.trim().replace(/^sections:\s*/i, '').split(';').map((s) => {
        const m = /^(.*?)\s+([\d.]+)%\s+of\s+([\d.]+)\s+marks?/i.exec(s.trim());
        return m ? { name: m[1].trim(), weight: Number(m[2]), marks: Number(m[3]) } : null;
      }).filter(Boolean);
      continue;
    }
    if (!line.trim().startsWith('|') || isRule(line)) continue;
    const c = cells(line);
    if (part === 'results') {
      if (/^assessment$/i.test(c[0])) continue;
      const weight = num(c[1]);
      const mark = num(c[2]);
      if (c[0] && weight != null && mark != null) out.results.push({ name: c[0], weight, mark, date: c[3] || '' });
    } else if (paper) {
      if (/^q$/i.test(c[0])) continue;
      paper.questions.push({
        q: c[0], section: c[1] || '', type: c[2] || '',
        got: /^[–-]$/.test(c[3] || '') || c[3] === '' ? null : num(c[3]),
        of: num(c[4]) || 0,
        ache: Math.max(0, Math.min(3, num(c[5]) || 0)),
        note: c[6] || '',
      });
    }
  }
  return out;
}

const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

// The tracker → the note's text. Anything in the note outside the two parts is kept.
export function formatTracker(t, previous = '', title = '') {
  const { props, body } = splitFront(previous);
  const keep = { ...props, 'opal-type': 'exam-tracker', course: t.course, target: String(t.target) };
  if (t.moderated != null) keep.moderated = String(t.moderated);
  else delete keep.moderated;
  const front = `---\n${Object.entries(keep).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n`;

  const lines = [];
  lines.push('## School results', '', '| Assessment | Weight | Mark |', '| --- | --- | --- |');
  for (const r of t.results) lines.push(`| ${esc(r.name)} | ${r.weight} | ${r.mark} |`);
  if (!COURSES[t.course].noPapers || t.papers.length) {
    lines.push('', '## WACE papers');
    for (const p of t.papers) {
      lines.push('', `### ${p.name}`);
      if (p.sections.length) lines.push(`Sections: ${p.sections.map((s) => `${s.name} ${s.weight}% of ${s.marks} marks`).join('; ')}`);
      lines.push('', '| Q | Section | Type | Marks | Out of | Headache | Notes |', '| --- | --- | --- | --- | --- | --- | --- |');
      for (const q of p.questions) lines.push(`| ${esc(q.q)} | ${esc(q.section)} | ${esc(q.type)} | ${q.got == null ? '–' : q.got} | ${q.of} | ${q.ache || 0} | ${esc(q.note)} |`);
    }
  }
  // Keep whatever else the note had (a title, notes to self) above the tracker parts.
  const head = [];
  for (const line of body.split(/\r?\n/)) {
    if (/^##\s+(school results|wace papers)/i.test(line)) break;
    head.push(line);
  }
  while (head.length && !head[head.length - 1].trim()) head.pop();
  const intro = head.length ? head.join('\n') : `# ${title || COURSES[t.course].name}`;
  return `${front}${intro}\n\n${lines.join('\n')}\n`;
}

// ---------- the sums ----------

// Weighted average of the school results (0–100), or null.
export function schoolMark(results) {
  const w = results.reduce((a, r) => a + r.weight, 0);
  if (!w) return null;
  return round1(results.reduce((a, r) => a + r.weight * r.mark, 0) / w);
}

// The exam mark needed: final ≈ half school (moderated) + half exam.
export function neededInExam(target, school) {
  if (school == null) return null;
  return Math.round(2 * target - school);
}

// Each section of a marked paper: { name, weight, marks, got, answered }
export function paperSections(paper, course) {
  const fallback = COURSES[course].sections.map(([name, weight, marks]) => ({ name, weight, marks }));
  const list = paper.sections.length ? paper.sections : fallback;
  return list.map((s) => {
    const qs = paper.questions.filter((q) => q.section === s.name);
    const answered = qs.filter((q) => q.got != null);
    // A choice section (more questions than you answer) is out of its full marks;
    // otherwise only the questions marked so far count, so half-marked papers make sense.
    const choice = qs.reduce((a, q) => a + q.of, 0) > s.marks + 0.5 || qs.length === 1;
    const outOf = choice ? s.marks : answered.reduce((a, q) => a + q.of, 0);
    return { ...s, got: answered.reduce((a, q) => a + q.got, 0), outOf: outOf || s.marks, answered: answered.length, total: qs.length };
  }).filter((s) => s.total);
}

// A marked paper's exam mark (%), weighting each section; sections with
// nothing marked are left out (e.g. only Section One done).
export function paperPercent(paper, course) {
  const secs = paperSections(paper, course).filter((s) => s.answered);
  const w = secs.reduce((a, s) => a + s.weight, 0);
  if (!w) return null;
  return Math.round(secs.reduce((a, s) => a + (Math.min(s.got, s.outOf) / s.outOf) * s.weight, 0) / w * 100);
}

// Marks lost by question type across every marked paper, biggest first.
export function lossesByType(papers) {
  const by = new Map();
  for (const p of papers) {
    for (const q of p.questions) {
      if (q.got == null || !q.of) continue;
      const key = q.type || 'Not sorted';
      const e = by.get(key) || { name: key, lost: 0, of: 0, ache: 0 };
      e.lost += Math.max(0, q.of - q.got);
      e.of += q.of;
      e.ache += q.ache || 0;
      by.set(key, e);
    }
  }
  return [...by.values()].filter((e) => e.of).sort((a, b) => b.lost - a.lost || b.ache - a.ache);
}

// Average % in each section across marked papers.
export function sectionAverages(papers, course) {
  const by = new Map();
  for (const p of papers) {
    for (const s of paperSections(p, course)) {
      if (!s.answered) continue;
      const e = by.get(s.name) || { name: s.name, sum: 0, n: 0 };
      e.sum += Math.min(s.got, s.outOf) / s.outOf;
      e.n += 1;
      by.set(s.name, e);
    }
  }
  return [...by.values()].map((e) => ({ name: e.name, avg: Math.round((e.sum / e.n) * 100) }));
}

// ---------- reading a WACE paper ----------

// The text of a paper's PDF(s), line by line → { sections, questions } with
// each question's marks, its section, and a guessed type from its opening lines.
export function readPaperLines(lines, course) {
  const sections = [];
  const questions = [];
  let section = null;
  let partOf = null; // a section split into Part A / Part B
  let current = null;
  const types = COURSES[course].types;
  const guess = (sec, text) => {
    if (course === 'pal') {
      if (/source/i.test(sec)) return 'Source analysis';
      if (/unit 3/i.test(sec)) return 'Essay · Unit 3';
      if (/unit 4/i.test(sec)) return 'Essay · Unit 4';
    }
    if (course === 'accounting' && /extended/i.test(sec)) {
      const hit = types.find(([, re]) => re && re.test(text));
      return hit ? hit[0] : 'Financial statements';
    }
    const hit = types.find(([, re]) => re && re.test(text));
    return hit ? hit[0] : '';
  };
  for (const raw of lines) {
    const line = raw.trim();
    const sec = /^Section (One|Two|Three|Four)\s*:\s*(.+?)\s+([\d.]+)%\s*\(([\d.]+)\s*Marks?\)/i.exec(line);
    if (sec) {
      section = { name: sec[2].trim(), weight: Number(sec[3]), marks: Number(sec[4]) };
      partOf = section;
      sections.push(section);
      current = null;
      continue;
    }
    const part = /^Part ([AB])\s*:\s*(Unit \d)\s*(?:([\d.]+)%\s*\(([\d.]+)\s*Marks?\))?\s*$/i.exec(line);
    if (part && partOf) {
      const base = partOf.name.replace(/\s*·.*$/, '');
      const name = `${/essay/i.test(base) ? 'Essay' : 'Extended'} · ${part[2]}`;
      let s = sections.find((x) => x.name === name);
      if (!s) {
        const weight = part[3] ? Number(part[3]) : partOf.weight / 2;
        const marks = part[4] ? Number(part[4]) : partOf.marks / 2;
        s = { name, weight, marks };
        // the whole section becomes its parts
        const at = sections.indexOf(partOf);
        if (at !== -1 && !partOf.split) {
          sections.splice(at, 1);
          partOf.split = true;
        }
        sections.push(s);
      }
      section = s;
      current = null;
      continue;
    }
    const q = /^Question (\d+)\s*\((\d+)\s*marks?\)/i.exec(line);
    if (q && section) {
      if (questions.some((x) => x.q === q[1])) continue; // "(continued)" pages
      current = { q: q[1], section: section.name, of: Number(q[2]), text: '' };
      questions.push(current);
      continue;
    }
    if (current && current.text.length < 400 && !/^Question \d+ \(continued\)/i.test(line)) current.text += ` ${line}`;
  }
  // Multiple-choice sections have no "Question N (x marks)": one line for the lot.
  for (const s of sections) {
    if (!questions.some((q) => q.section === s.name) && /multiple/i.test(s.name)) {
      questions.unshift({ q: 'MC', section: s.name, of: s.marks, text: '' });
    }
  }
  const clean = sections.filter((s) => !s.split).map(({ name, weight, marks }) => ({ name, weight, marks }));
  return {
    sections: clean,
    questions: questions.map((x) => ({
      q: x.q, section: x.section, of: x.of, got: null, ache: 0, note: '',
      type: x.q === 'MC' ? 'Multiple choice' : guess(x.section, x.text),
    })),
  };
}

// Which PDFs in a folder are WACE papers, grouped by year: { year: [paths] }.
// (Skips marking keys and solutions.)
export function findPapers(files) {
  const out = {};
  for (const f of files) {
    if (!/\.pdf$/i.test(f.path)) continue;
    const name = f.path.split('/').pop();
    if (/mark|key|solution|soln|guide|answers/i.test(f.path)) continue;
    if (!/wace/i.test(f.path)) continue; // papers live in a WACE folder (or say WACE)
    const y = /\b(20\d\d)\b/.exec(name);
    if (!y) continue;
    (out[y[1]] = out[y[1]] || []).push(f.path);
  }
  for (const y of Object.keys(out)) out[y].sort();
  return out;
}
