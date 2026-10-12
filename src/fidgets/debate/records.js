// Competitions, rounds and the notes they live in — plain markdown with
// properties (front matter), so Obsidian and Dataview read them too.
//
//   <Debate>/Competitions/<Name> <Year>.md   one note per competition
//   <Debate>/Rounds/<Round ID>.md             one note per round (Form 1 + Form 2)
//   <Debate>/Rounds/Audio/<Round ID>.m4a      a practice speech's recording
//
// The Schools Record and Adjudication Record tables are read once, to make
// the competition notes (they're left as they are).

// ---------- Simple properties ----------

// The front matter of a note → { props, body }. Values: text, numbers,
// true/false, or [a, b] lists.
export function readProps(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(String(text || ''));
  if (!m) return { props: {}, body: String(text || '') };
  const props = {};
  let listKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      props[listKey].push(unquote(item[1]));
      continue;
    }
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    listKey = null;
    const value = kv[2].trim();
    if (value === '') {
      props[kv[1]] = [];
      listKey = kv[1];
    } else if (/^\[.*\]$/.test(value)) {
      props[kv[1]] = value.slice(1, -1).split(',').map((v) => unquote(v.trim())).filter(Boolean);
    } else {
      props[kv[1]] = unquote(value);
    }
  }
  // An empty "key:" with no list items is just empty.
  for (const [k, v] of Object.entries(props)) if (Array.isArray(v) && !v.length) props[k] = '';
  return { props, body: String(text).slice(m[0].length) };
}

function unquote(v) {
  const s = String(v).trim();
  if (/^".*"$/.test(s)) return s.slice(1, -1).replace(/\\"/g, '"');
  if (/^'.*'$/.test(s)) return s.slice(1, -1).replace(/''/g, "'");
  return s;
}

function quote(v) {
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  if (s === '' || /^[\w .,/()&'+–—-]+$/.test(s) && !/^[-\d]/.test(s.trim()) && !/^(true|false|null|yes|no)$/i.test(s)) return s;
  if (/^\d+(\.\d+)?$/.test(s)) return s;
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// { props } + body → note text. Keys with no value are kept (empty).
export function writeProps(props, body = '') {
  const lines = ['---'];
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) lines.push(v.length ? `${k}: [${v.map(quote).join(', ')}]` : `${k}:`);
    else lines.push(v === '' ? `${k}:` : `${k}: ${quote(v)}`);
  }
  lines.push('---');
  return `${lines.join('\n')}\n${body.replace(/^\n+/, '\n')}`;
}

// The text under a "## Heading" (or "### Heading") until the next heading
// of the same or a higher level.
export function section(body, heading) {
  const lines = String(body).split(/\r?\n/);
  const at = lines.findIndex((l) => new RegExp(`^#{2,4}\\s+${escape(heading)}\\s*$`, 'i').test(l));
  if (at === -1) return '';
  const level = /^#+/.exec(lines[at])[0].length;
  const out = [];
  for (let i = at + 1; i < lines.length; i++) {
    const h = /^(#+)\s/.exec(lines[i]);
    if (h && h[1].length <= level) break;
    out.push(lines[i]);
  }
  return out.join('\n').trim();
}

// Replaces (or adds) a section's text.
export function setSection(body, heading, text, level = 3) {
  const lines = String(body).split(/\r?\n/);
  const at = lines.findIndex((l) => new RegExp(`^#{2,4}\\s+${escape(heading)}\\s*$`, 'i').test(l));
  const content = String(text || '').trim();
  if (at === -1) {
    return `${String(body).replace(/\s*$/, '')}\n\n${'#'.repeat(level)} ${heading}\n\n${content}\n`;
  }
  const lvl = /^#+/.exec(lines[at])[0].length;
  let end = at + 1;
  while (end < lines.length && !(/^(#+)\s/.test(lines[end]) && /^#+/.exec(lines[end])[0].length <= lvl)) end++;
  lines.splice(at + 1, end - at - 1, '', ...(content ? [content, ''] : ['']));
  return lines.join('\n');
}

function escape(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------- The record tables ----------

// An HTML table (Opal's table format) → rows of cell text, with merged
// (rowspan) cells repeated in every row they cover.
export function readHtmlTable(text) {
  const table = /<table[\s\S]*?<\/table>/i.exec(String(text || ''));
  if (!table) return [];
  const rows = [];
  const carry = []; // column → { text, left }
  for (const tr of table[0].match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = [...tr.matchAll(/<t([hd])([^>]*)>([\s\S]*?)<\/t[hd]>/gi)];
    const row = [];
    let col = 0;
    const take = () => {
      while (carry[col] && carry[col].left > 0) {
        row[col] = carry[col].text;
        carry[col].left--;
        col++;
      }
    };
    for (const cell of cells) {
      take();
      const text = cellText(cell[3]);
      const span = Number((/rowspan="(\d+)"/i.exec(cell[2]) || [])[1] || 1);
      row[col] = text;
      if (span > 1) carry[col] = { text, left: span - 1 };
      col++;
    }
    take();
    rows.push(row);
  }
  return rows;
}

function cellText(html) {
  return html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

// The format, when the competition's name says it.
export function formatFromName(name) {
  if (/british parliamentary|\bBP\b/i.test(name)) return 'British Parliamentary';
  if (/asian parliamentary|\bAP\b/i.test(name)) return 'Asian Parliamentary';
  if (/world schools|\bWSDC\b/i.test(name)) return 'World Schools';
  if (/australs/i.test(name)) return 'Australs';
  return '';
}

// "Western Australia Schools Debating Championships", 2026 → "WASDC26"
export function shortCode(name, year) {
  const skip = new Set(['of', 'the', 'and', 'for', 'a', 'an', '&']);
  const letters = String(name).split(/[\s-]+/).filter((w) => w && !skip.has(w.toLowerCase())).map((w) => (/^[A-Z]{2,}$/.test(w) ? w : w[0].toUpperCase())).join('');
  return `${letters.slice(0, 8)}${String(year || '').slice(-2)}`;
}

// Schools Record + Adjudication Record → competition notes to make:
// [{ name, props, body }]
export function competitionsFromRecords(schoolsText, judgingText) {
  const out = [];
  const rows = readHtmlTable(schoolsText);
  const head = (rows[0] || []).map((h) => h.toLowerCase());
  const col = (name) => head.findIndex((h) => h.startsWith(name));
  for (const r of rows.slice(1)) {
    const name = r[col('competition')];
    if (!name) continue;
    const year = r[col('year')] || '';
    out.push(competitionNote({
      role: 'speaker',
      competition: name,
      year,
      team: r[col('team')] || '',
      record: (r[col('win')] || '').replace(/^NIL$/i, ''),
      placing: r[col('placing')] || '',
      speaks: r[col('speaks')] || '',
      notes: r[col('notes')] || '',
      tab: r[col('tabs')] || '',
    }));
  }
  const jrows = readHtmlTable(judgingText);
  const jhead = (jrows[0] || []).map((h) => h.toLowerCase());
  const jcol = (name) => jhead.findIndex((h) => h.startsWith(name));
  for (const r of jrows.slice(1)) {
    const name = r[jcol('competition')];
    if (!name) continue;
    out.push(competitionNote({
      role: 'adjudicator',
      competition: name,
      year: r[jcol('year')] || '',
      rooms: r[jcol('rooms')] || '',
      notes: r[jcol('notes')] || '',
      teams: r[jcol('total')] || '',
    }));
  }
  return out;
}

const OVERVIEW = ['What went well', 'What didn’t', 'The one thing to change before the next comp', 'Best moment'];

export function competitionNote(fields) {
  const props = {
    'opal-type': 'debate-competition',
    role: fields.role || 'speaker',
    competition: fields.competition,
    year: fields.year || '',
    short: fields.short || shortCode(fields.competition, fields.year),
    format: fields.format || formatFromName(fields.competition),
  };
  if (props.role === 'adjudicator') {
    Object.assign(props, { rooms: fields.rooms || '', teams: fields.teams || '', notes: fields.notes || '' });
  } else {
    Object.assign(props, { team: fields.team || '', record: fields.record || '', placing: fields.placing || '', speaks: fields.speaks || '', notes: fields.notes || '', tab: fields.tab || '', feeling: '' });
  }
  const body = props.role === 'adjudicator' ? '\n' : `\n## Tournament overview\n\n${OVERVIEW.map((h) => `### ${h}\n\n`).join('\n')}`;
  const name = `${fields.competition}${props.year ? ` ${props.year}` : ''}`.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  return { name, props, body };
}

export { OVERVIEW as OVERVIEW_PROMPTS };

// ---------- Competitions, read back ----------

// A competition note → the fields the pages show.
export function readCompetition(text, path) {
  const { props, body } = readProps(text);
  if (props['opal-type'] !== 'debate-competition') return null;
  const overview = {};
  for (const h of OVERVIEW) overview[h] = section(body, h);
  return {
    path,
    name: props.competition || path.split('/').pop().replace(/\.md$/, ''),
    role: props.role === 'adjudicator' ? 'adjudicator' : 'speaker',
    year: String(props.year || ''),
    short: props.short || shortCode(props.competition || '', props.year),
    format: props.format || '',
    team: props.team || '',
    record: props.record || '',
    placing: props.placing || '',
    speaks: props.speaks || '',
    notes: props.notes || '',
    tab: props.tab || '',
    rooms: Number(props.rooms) || 0,
    teams: props.teams || '',
    feeling: props.feeling || '',
    overview,
    text,
  };
}

// Broke to the elimination rounds?
export function broke(placing) {
  return /final|semi|quarter|octo|champion|runner|winner/i.test(String(placing || ''));
}

// "8th", "5th novice", "1st" → 8, 5, 1 (or null)
export function speakerRank(speaks) {
  const m = /(\d+)(?:st|nd|rd|th)/i.exec(String(speaks || ''));
  return m ? Number(m[1]) : null;
}

// "4/6" → { won: 4, of: 6 }
export function readRecord(record) {
  const m = /(\d+)\s*\/\s*(\d+)/.exec(String(record || ''));
  return m ? { won: Number(m[1]), of: Number(m[2]) } : null;
}

// ---------- Rounds (the two forms) ----------

export const ROUND_NAMES = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'Double Octos', 'Octos', 'Quarters', 'Semis', 'Final', 'Practice', 'Internal'];
const ROUND_CODES = { 'Double Octos': 'DO', Octos: 'OF', Quarters: 'QF', Semis: 'SF', Final: 'GF', Practice: 'P', Internal: 'INT' };
export const FORMATS = ['World Schools', 'British Parliamentary', 'Asian Parliamentary', 'Australs', 'Other'];
export const POSITIONS = {
  'World Schools': ['1st Prop', '2nd Prop', '3rd Prop', 'Prop Reply', '1st Opp', '2nd Opp', '3rd Opp', 'Opp Reply'],
  Australs: ['1st Prop', '2nd Prop', '3rd Prop', 'Prop Reply', '1st Opp', '2nd Opp', '3rd Opp', 'Opp Reply'],
  'Asian Parliamentary': ['1st Prop', '2nd Prop', '3rd Prop', 'Prop Reply', '1st Opp', '2nd Opp', '3rd Opp', 'Opp Reply'],
  'British Parliamentary': ['PM', 'DPM', 'LO', 'DLO', 'MG', 'GW', 'MO', 'OW'],
  Other: ['1st Prop', '2nd Prop', '3rd Prop', 'Prop Reply', '1st Opp', '2nd Opp', '3rd Opp', 'Opp Reply'],
};
export const isBP = (format) => format === 'British Parliamentary';

export function roundId(short, round) {
  const code = ROUND_CODES[round] || round;
  return `${short}-${code}`;
}

// A practice speech's Round ID: PRAC-<date>-P, then -P2, -P3 … for a second
// or later speech the same day. `taken` holds the Round IDs already used.
export function practiceId(date, taken = []) {
  const base = roundId(`PRAC-${date}`, 'Practice');
  const used = new Set([...taken].map((id) => String(id).toUpperCase()));
  if (!used.has(base.toUpperCase())) return base;
  let n = 2;
  while (used.has(`${base}${n}`.toUpperCase())) n++;
  return `${base}${n}`;
}

// The 15 dimensions of the Weakness Diagnostic, by cluster (Form 2 scores them).
export const DIMENSIONS = [
  ['Analysis', ['Mechanism depth', 'Characterisation', 'Principled reasoning', 'Matter']],
  ['Strategy', ['Round vision', 'Win path selection', 'Weighing and comparison', 'Charity', 'Position play']],
  ['Execution', ['Structure and signposting', 'Efficiency', 'Manner and rhetoric', 'Flowing and tracking']],
  ['Meta', ['Prep process', 'Partner work']],
];
export const CLUSTER_OF = Object.fromEntries(DIMENSIONS.flatMap(([c, ds]) => ds.map((d) => [d, c])));
export const scoreKey = (dimension) => `score_${dimension.toLowerCase().replace(/[^a-z]+/g, '_')}`;
export const CAUSES = ['Throughput', 'Page architecture', 'Structural listening', 'Round vision', 'Collapse under time', 'Knowledge gap', 'Execution under pressure'];

// Long answers kept as sections in the round's note (title → field).
// A practice speech uses Transcript, Judging, Symptom, Cause, Mini fix and
// Model rewrite (Claude's debate-judging skill fills them in).
export const ROUND_SECTIONS = [
  ['Transcript', 'transcript'],
  ['Judging', 'judging'],
  ['Judge feedback', 'feedback'],
  ['At what point did they decide', 'decided'],
  ['What I was trying to do', 'trying'],
  ['What surprised me', 'surprised'],
  ['Partner said', 'partner'],
  ['Coach said', 'coach'],
  ['Symptom', 'symptom'],
  ['Cause', 'cause'],
  ['For the judge to be right', 'believe'],
  ['Mini fix', 'mini'],
  ['Model rewrite', 'rewrite'],
  ['Anything else', 'other'],
];
const SPEECH_SECTIONS = ['Transcript', 'Judging', 'Symptom', 'Cause', 'Mini fix', 'Model rewrite'];
const NEW_SECTIONS = new Set(['transcript', 'judging', 'rewrite']);

// A practice speech's properties, after motion (numbers may be half marks).
const SPEECH_PROPS = ['prep', 'prep_minutes', 'recording', 'judge', 'wsdc_style', 'wsdc_content', 'wsdc_strategy', 'wsdc_total', 'wudc', 'duration', 'wpm', 'fillers'];
const NUMBER_PROPS = new Set(['prep_minutes', 'wsdc_style', 'wsdc_content', 'wsdc_strategy', 'wsdc_total', 'wudc', 'wpm', 'fillers']);
const unlink = (v) => String(v || '').replace(/^\[\[|\]\]$/g, '');

// A practice speech: round Practice with a recording, prep or transcript.
export const isSpeech = (round) => round.round === 'Practice' && Boolean(round.recording || round.prep || round.transcript || round.judge);
// Judged by a panel (competition evidence), not by Claude.
export const panelJudged = (round) => String(round.judge || '').trim().toLowerCase() !== 'claude';

// A round note → its fields.
export function readRound(text, path) {
  const { props, body } = readProps(text);
  if (props['opal-type'] !== 'debate-round') return null;
  const round = { path, ...props, scores: {} };
  for (const [, dims] of DIMENSIONS) for (const d of dims) {
    const v = Number(props[scoreKey(d)]);
    if (v >= 1 && v <= 5) round.scores[d] = v;
  }
  for (const [title, key] of ROUND_SECTIONS) {
    const text = section(body, title);
    // The newer sections are only there when the note has them, so an older
    // round reads exactly as it always did.
    if (text || !NEW_SECTIONS.has(key)) round[key] = text;
  }
  for (const key of SPEECH_PROPS) {
    if (!(key in props) || props[key] === '') continue;
    if (NUMBER_PROPS.has(key)) round[key] = Number.isFinite(Number(props[key])) ? Number(props[key]) : null;
  }
  if (props.prep) round.prepName = unlink(props.prep);
  if (props.recording) round.recordingName = unlink(props.recording);
  // A practice speech's date is in its Round ID when there's no date: property.
  if (!props.date && /^PRAC-\d{4}-\d{2}-\d{2}/.test(props.round_id || '')) round.date = props.round_id.slice(5, 15);
  round.form1 = true;
  round.form2 = String(props.form2) === 'true';
  round.competitionName = String(props.competition || '').replace(/^\[\[|\]\]$/g, '');
  return round;
}

// Fields → a round note.
export function writeRound(round) {
  const props = {
    'opal-type': 'debate-round',
    round_id: round.round_id,
    competition: round.competitionName ? `[[${round.competitionName}]]` : '',
    date: round.date || '',
    round: round.round || '',
    format: round.format || '',
    position: round.position || '',
    motion: round.motion || '',
  };
  // A practice speech's properties: written only when there's a value, so
  // competition rounds are written exactly as before.
  for (const key of SPEECH_PROPS) {
    let v = round[key];
    if (key === 'prep' && round.prepName) v = `[[${round.prepName}]]`;
    if (key === 'recording' && round.recordingName) v = `[[${round.recordingName}]]`;
    if (v === undefined || v === null || v === '' || (NUMBER_PROPS.has(key) && !Number.isFinite(Number(v)))) continue;
    props[key] = NUMBER_PROPS.has(key) ? Number(v) : String(v);
  }
  Object.assign(props, {
    result: round.result || '',
    speaks: round.speaks || '',
    judges: round.judges || '',
    clusters: round.clusters || [],
    deserved: round.deserved || '',
    hours_slept: round.hours_slept || '',
    round_of_day: round.round_of_day || '',
    eaten: round.eaten || '',
    unusual: round.unusual || [],
    form2: Boolean(round.form2),
  });
  for (const [, dims] of DIMENSIONS) for (const d of dims) if (round.scores && round.scores[d]) props[scoreKey(d)] = round.scores[d];
  Object.assign(props, {
    candidates: round.candidates || [],
    level: round.level || '',
    seen_before: round.seen_before || '',
    priority: round.priority || '',
  });
  // A practice speech keeps its six headings even while they're empty.
  const speech = isSpeech(round);
  const body = ROUND_SECTIONS.filter(([title, key]) => round[key] || (speech && SPEECH_SECTIONS.includes(title)))
    .map(([title, key]) => (round[key] ? `## ${title}\n\n${round[key].trim()}\n` : `## ${title}\n`)).join('\n');
  return writeProps(props, `\n${body}`);
}

// A round's points: BP 1st–4th → 3/2/1/0; two-team: win 1, loss 0.
export function placing(result) {
  const m = /^([1-4])/.exec(String(result || ''));
  return m ? Number(m[1]) : null;
}

export function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// ---------- Practice speeches: transcript numbers ----------

// The fillers counted in a transcript (as they're written in the Fillers line).
export const FILLERS = ['right?', 'like', 'kind of', 'you know', 'um', 'uh', 'I think', 'basically'];
const FILLER_RE = {
  'right?': /\bright\s*\?/gi,
  like: /\blike\b/gi,
  'kind of': /\bkind of\b/gi,
  'you know': /\byou know\b/gi,
  um: /\bum+\b/gi,
  uh: /\buh+\b/gi,
  'I think': /\bI think\b/gi,
  basically: /\bbasically\b/gi,
};

// → { total, counts: [[filler, n], …] } most first, fillers at 0 left out.
export function countFillers(text) {
  const t = String(text || '');
  const counts = FILLERS.map((f) => [f, (t.match(FILLER_RE[f]) || []).length]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  return { total: counts.reduce((s, [, n]) => s + n, 0), counts };
}

export function wordCount(text) {
  return (String(text || '').match(/[A-Za-z0-9’']+/g) || []).length;
}

// 419 → "6:59"; "6:59" → 419.
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function parseDuration(text) {
  const m = /^(\d+):([0-5]\d)$/.exec(String(text || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function wordsPerMinute(text, seconds) {
  return seconds > 0 ? Math.round(wordCount(text) / (seconds / 60)) : null;
}

// "Fillers: 63 (like 21, um 14, …) · 203 wpm · 6:59"
export function fillersLine({ total, counts }, wpm, duration) {
  return [`Fillers: ${total}${counts.length ? ` (${counts.map(([f, n]) => `${f} ${n}`).join(', ')})` : ''}`, wpm ? `${wpm} wpm` : null, duration || null].filter(Boolean).join(' · ');
}

// The Judging section with the Fillers line on top (replacing an old one).
export function withFillersLine(judging, line) {
  const rest = String(judging || '').replace(/^Fillers: .*(\r?\n)*/, '').trim();
  return rest ? `${line}\n\n${rest}` : line;
}

// A transcript into a round: Transcript, wpm, fillers and the Fillers line.
export function applyTranscript(round, text) {
  const transcript = String(text || '').trim();
  const seconds = parseDuration(round.duration);
  const fillers = countFillers(transcript);
  const wpm = wordsPerMinute(transcript, seconds);
  return {
    ...round,
    transcript,
    wpm: wpm ?? round.wpm ?? null,
    fillers: fillers.total,
    judging: withFillersLine(round.judging, fillersLine(fillers, wpm, round.duration)),
  };
}
