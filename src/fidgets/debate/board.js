// The feedback board, the training plan and the dashboard's to-do list —
// read from (and written back to) the notes as they already are.
//
// Board: one card per weakness, a note made from Feedback/_Card Template.md,
// in one of four folders: 1 Do Now, 2 In Progress (2 at most), 3 Parked, 4 Done.

import { readProps, writeProps, section } from './records.js';

export const COLUMNS = [
  { folder: '1 Do Now', status: 'do-now', name: 'Do now' },
  { folder: '2 In Progress', status: 'in-progress', name: 'In progress', cap: 2 },
  { folder: '3 Parked', status: 'parked', name: 'Parked' },
  { folder: '4 Done', status: 'done', name: 'Done' },
];

// The template's example text, which means "not filled in yet".
const PLACEHOLDERS = new Set(['judge, verbatim.', 'partner or coach.', 'one, named.', 'the rule you hold in your head while speaking', 'the drill, if the mini decays', 'the structural change, if the mini fails under full attention']);
const filled = (s) => (s && !PLACEHOLDERS.has(String(s).trim().toLowerCase()) ? String(s).trim() : '');

// Rows of a markdown table found in some text: [[cell, …], …] (no header).
export function tableRows(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => /^\s*\|/.test(l));
  // Split on the cell bars, not on an escaped one inside a link ([[Note\|alias]]).
  return lines.slice(2).map((l) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|')));
}

// A card note → { title, dimension, evidence[], rounds[], cause, fix{Mini,Micro,Macro}, trial[], verdict, … }
export function readCard(text, path, column) {
  const { props, body } = readProps(text);
  const title = (/^#\s+(.+)$/m.exec(body) || [])[1] || path.split('/').pop().replace(/\.md$/, '');
  const evidenceText = section(body, 'Evidence');
  const evidence = evidenceText.split(/\r?\n/).filter((l) => /^>/.test(l)).map((l) => filled(l.replace(/^>\s?/, ''))).filter(Boolean);
  const roundsLine = (/Rounds this has appeared in:(.*)$/m.exec(body) || [])[1] || '';
  const rounds = roundsLine.split(/[,·]/).map((s) => s.replace(/\[\[|\]\]/g, '').trim()).filter(Boolean);
  const fix = {};
  for (const [level, content] of tableRows(section(body, 'The fix'))) fix[level] = filled(content);
  const trial = tableRows(section(body, 'Trial')).map(([round, result]) => ({ round, result: (result || '').toLowerCase() }));
  const verdicts = [...section(body, 'Verdict').matchAll(/^- \[( |x|X)\] (.+)$/gm)].map((m) => ({ done: m[1] !== ' ', text: m[2] }));
  return {
    path,
    column,
    title: title.replace(/<dimension>|<short label>/g, '').trim() || title,
    dimension: props.dimension || (title.split(/\s+[—-]\s+/)[0] || ''),
    roundId: props.round_id || '',
    competition: props.competition || '',
    cause: props.cause || filled(section(body, 'Cause')),
    level: props.level || '',
    opened: props.opened || '',
    closed: props.closed || '',
    evidence,
    rounds: rounds.length ? rounds : (props.round_id ? [props.round_id] : []),
    fix,
    trial,
    verdicts,
    text,
  };
}

// Writes one trial result ("Held", "Decayed", "Failed") into the card's table.
export function setTrial(text, round, result) {
  const lines = text.split('\n');
  const head = lines.findIndex((l) => /^##\s+Trial\b/i.test(l));
  if (head === -1) return text;
  for (let i = head + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) {
    const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (/^\s*\|/.test(lines[i]) && cells[0] === round) {
      lines[i] = `| ${round} | ${result} |`;
      return lines.join('\n');
    }
  }
  return text;
}

// Ticks one verdict (and unticks the others).
export function setVerdict(text, index) {
  let n = -1;
  const lines = text.split('\n');
  const head = lines.findIndex((l) => /^##\s+Verdict\b/i.test(l));
  if (head === -1) return text;
  for (let i = head + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) {
    if (/^- \[( |x|X)\] /.test(lines[i])) {
      n++;
      lines[i] = lines[i].replace(/^- \[( |x|X)\]/, n === index ? '- [x]' : '- [ ]');
    }
  }
  return lines.join('\n');
}

// Moves a card's status property (the file itself moves folder too).
export function setStatus(text, status, today) {
  const { props, body } = readProps(text);
  props.status = status;
  if (status === 'done' && !props.closed) props.closed = today;
  return writeProps(props, body);
}

// Adds a round to "Rounds this has appeared in:" and its verbatim feedback
// to the evidence.
export function addEvidence(text, roundId, quote) {
  let out = text.replace(/(Rounds this has appeared in:)(.*)$/m, (all, label, list) => {
    const ids = list.split(/[,·]/).map((s) => s.trim()).filter(Boolean);
    if (!ids.includes(roundId)) ids.push(roundId);
    return `${label} ${ids.join(', ')}`;
  });
  if (quote) {
    const lines = out.split('\n');
    const at = lines.findIndex((l) => /^Rounds this has appeared in:/.test(l));
    if (at !== -1) lines.splice(at, 0, ...quote.split(/\r?\n/).filter(Boolean).map((l) => `> ${l} (${roundId})`), '');
    out = lines.join('\n');
  }
  return out;
}

// A new card from the template, filled in from a round's Form 2.
export function newCard(template, f) {
  const { props, body } = readProps(template);
  Object.assign(props, {
    round_id: f.roundId, competition: f.competition || '', date: f.date || '', dimension: f.dimension,
    cause: f.cause || '', level: f.level || 'Mini', status: 'do-now', opened: f.today, closed: '',
  });
  let out = body;
  out = out.replace(/^#\s+.*$/m, `# ${f.dimension} — ${f.label || f.symptom || 'from ' + f.roundId}`);
  const quotes = (s) => s.split(/\r?\n/).filter((l) => l.trim()).map((l) => `> ${l.trim()}`).join('\n');
  out = out.replace(/^> Judge, verbatim\.$/m, f.feedback ? quotes(f.feedback) : '> Judge, verbatim.');
  out = out.replace(/^> Partner or coach\.$/m, [f.partner, f.coach].filter(Boolean).length ? quotes([f.partner, f.coach].filter(Boolean).join('\n')) : '> Partner or coach.');
  out = out.replace(/^Rounds this has appeared in:.*$/m, `Rounds this has appeared in: ${f.roundId}`);
  if (f.cause) out = out.replace(/^One, named\.$/m, f.cause);
  if (f.mini) out = out.replace(/^\| Mini \|[^|\n]*\|$/m, `| Mini | ${f.mini.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`);
  return writeProps(props, out);
}

// ---------- Training plan ----------

export function readTrainingPlan(text) {
  const { props, body } = readProps(text);
  const week = tableRows(section(body, 'Weekly template')).map(([day, block, hours, content]) => ({ day, block, hours, content: (content || '').replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1') }));
  const drillText = section(body, 'Drill bank');
  const drills = tableRows(drillText).map(([n, name, time, method, fixes]) => ({ n: Number(n), name, time, method, fixes }));
  const leans = {};
  for (const m of drillText.matchAll(/Phase (\d+) leans on ([\d,\s and]+)/g)) leans[m[1]] = m[2].match(/\d+/g).map(Number);
  const phases = [];
  for (const m of body.matchAll(/^##\s+Phase (\d+),\s*months?\s+(\d+)\s+to\s+(\d+),\s*(.+)$/gim)) {
    const content = section(body, m[0].replace(/^##\s+/, ''));
    const milestone = (/Milestone\.\s*([\s\S]*?)(?:\n\n|$)/.exec(content) || [])[1] || '';
    phases.push({ n: Number(m[1]), from: Number(m[2]), to: Number(m[3]), name: m[4].trim(), milestone: milestone.trim() });
  }
  const matterText = section(body, 'Matter cycle');
  const areaSentence = matterText.split(/(?<=\.)\s+/).find((s) => (s.match(/,/g) || []).length >= 5) || '';
  const areas = areaSentence.replace(/\.$/, '').split(/,\s*/).map((a) => a.replace(/^and\s+/, '').trim()).filter(Boolean).map((a) => a[0].toUpperCase() + a.slice(1));
  const areaWeeks = Number((/(\d+)\s+weeks each/.exec(matterText) || [])[1]) || 3;
  const tracking = tableRows(section(body, 'Tracking')).map(([metric, target]) => ({ metric, target }));
  const target = (/^##\s+The target\s*\n+([^\n]+)/m.exec(body) || [])[1] || '';
  const intro = body.replace(/^#\s+.*$/m, '').trim().split(/\n\n/)[0] || '';
  return { start: props['plan-start'] || '', week, drills, leans, phases, areas, areaWeeks, tracking, target: target.trim(), intro: intro.trim() };
}

// Months since the plan started (1 = the first month), or null.
export function planMonth(start, now = new Date()) {
  const m = /^(\d{4})-(\d{2})/.exec(String(start || ''));
  if (!m) return null;
  return (now.getFullYear() - Number(m[1])) * 12 + now.getMonth() + 1 - Number(m[2]) + 1;
}

// ---------- Drill log (Training/Drill log.md) ----------

export function readDrillLog(text) {
  return [...String(text || '').matchAll(/^- (\d{4}-\d{2}-\d{2}) · (\d+) /gm)].map((m) => ({ date: m[1], n: Number(m[2]) }));
}

export function addDrillLog(text, date, drill) {
  const head = String(text || '').trim() ? String(text).replace(/\s*$/, '') : '# Drill log\n\nEach drill done, newest last.';
  return `${head}\n- ${date} · ${drill.n} ${drill.name} (${drill.time})\n`;
}

// ---------- Dashboard ----------

// "**To do:**" items and the KPI lists from the Dashboard note.
export function readDashboard(text) {
  const lines = String(text || '').split(/\r?\n/);
  const list = (label) => {
    const at = lines.findIndex((l) => l.replace(/\*/g, '').trim().toLowerCase().startsWith(label));
    if (at === -1) return [];
    const out = [];
    for (let i = at + 1; i < lines.length; i++) {
      const m = /^\s*-\s+(?:\[[ xX]\]\s+)?(.*)$/.exec(lines[i]);
      if (!m) {
        if (lines[i].trim()) break;
        continue;
      }
      const item = m[1].replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1').trim();
      if (item) out.push(item);
    }
    return out;
  };
  return { todo: list('to do'), qualitative: list('qualitative kpis'), quantitative: list('quantitative kpis') };
}
