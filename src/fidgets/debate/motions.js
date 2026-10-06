// Motions, read from the notes in the debate folder's Motions folder — the
// way they're already written, nothing to convert:
//
//   **Grandfinals**                              ← a round heading
//   THBT indulging in schadenfreude is immoral   ← a motion
//   - Schadenfreude is pleasure derived from…    ← its info slide
//
//   Round 2 - THW classify … organisations (Crime)   ← round, motion, topic
//   Round 7 - THP … social housing (housing)* *Housing vouchers give…*   ← info slide after "* *"
//
//   Culture                                      ← a topic heading
//   - TH, as Carol from Pluribus, would …        ← a motion under it
//   	- IS: Pluribus is a 2025 series …          ← its info slide
//
// Opal's own marks go at the end of a motion's line, as Obsidian tags:
//   #starred            a starred motion
//   #version/<name>     motions that are versions of each other (any file)

const MOTION_START = /^(?:TH[A-Z]{0,3}\b|TH,|That\b|This House\b)/;
const ROUND_LINE = /^((?:Round\s*\d+|R\d+|(?:Double[- ]?)?Octo(?:s|finals?)?|Quarter(?:s|finals?)?|Semi(?:s|finals?)?|Grand ?finals?|Finals?|Partial[- ]?double[- ]?octos?))\s*[-–—:]\s*(.+)$/i;
const TAGS = /\s+#(?:starred|version\/[\w-]+)\b/gi;

// A line's text without list markers, highlight marks and Opal's tags.
function clean(line) {
  return line
    .replace(TAGS, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/==/g, '')
    .replace(/ /g, ' ')
    .trim();
}

function looksLikeMotion(text) {
  if (MOTION_START.test(text)) return true;
  // "There is an omnipotent … God, … THW kill God."
  return /\bTH(?:W|BT|R|P|S|O)\b/.test(text) && text.length > 20;
}

// "THR the predominant belief … (suffering)* *info*" → { text, topic, info }
function splitMotion(body) {
  let text = body;
  let info = '';
  // The info slide starts at "* *" or at " *word" (an asterisk with a space
  // before it); "sycophancy*" (a footnote mark) stays in the motion.
  const foot = /\*\s+\*|\s\*(?=[^\s*])/.exec(text);
  if (foot) {
    info = text.slice(foot.index + foot[0].length).replace(/\*\s*$/, '').trim();
    text = text.slice(0, foot.index);
  }
  text = text.replace(/\*+/g, '').replace(/\s+/g, ' ').trim();
  let topic = '';
  const tail = /\s*\(([^()]{1,30})\)\s*$/.exec(text);
  if (tail && !/^(?:e\.?g\.?|eg|i\.?e\.?)\b/i.test(tail[1])) {
    topic = tail[1].trim();
    text = text.slice(0, tail.index).trim();
  }
  // …or after the info slide: "…Export Processing Zones (Kenya)".
  const late = !topic && /\s*\(([^()]{1,30})\)\s*\*?\s*$/.exec(info);
  if (late && !/^(?:e\.?g\.?|eg|i\.?e\.?)\b/i.test(late[1])) {
    topic = late[1].trim();
    info = info.slice(0, late.index).replace(/\*+\s*$/, '').trim();
  }
  return { text, topic, info };
}

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'motion';
}

// One motion note → [{ id, text, info, topic, round, source, path, line, raw, starred, version }]
export function parseMotionNote(text, { path, source }) {
  const lines = String(text || '').split(/\r?\n/);
  const out = [];
  let round = '';
  let topic = '';
  let tab = '';
  let i = 0;
  // Front matter is skipped.
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end !== -1) i = end + 1;
  }
  let last = null;
  for (; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (line === '---') break; // the "Related" footer
    if (!line) continue;
    if (/^https?:\/\/\S+$/.test(line)) {
      if (!tab) tab = line;
      continue;
    }
    const bold = /^\*\*([^*]+)\*\*$/.exec(line);
    if (bold) {
      round = bold[1].trim();
      last = null;
      continue;
    }
    const indented = /^(\t|\s{2,})/.test(raw);
    const body = clean(raw);
    const isInfo = last && (indented || /^IS:/i.test(body) || (/^\s*[-*+]\s/.test(raw) && !looksLikeMotion(body)));
    if (isInfo && !looksLikeMotion(body)) {
      last.info = [last.info, body.replace(/^IS:\s*/i, '')].filter(Boolean).join(' ');
      continue;
    }
    const roundLine = ROUND_LINE.exec(body);
    if (roundLine || looksLikeMotion(body)) {
      const split = splitMotion(roundLine ? roundLine[2] : body);
      const motion = {
        text: split.text,
        info: split.info,
        topic: split.topic || topic,
        round: roundLine ? roundLine[1].replace(/\s+/g, ' ') : round,
        source,
        path,
        line: i,
        raw,
        starred: /\s#starred\b/i.test(raw),
        version: (/\s#version\/([\w-]+)/i.exec(raw) || [])[1] || null,
        tab,
      };
      motion.id = `${path}#${i}`;
      out.push(motion);
      last = motion;
      continue;
    }
    // A short plain line with no list marker: a topic heading.
    if (!/^\s*[-*+]/.test(raw) && body.length <= 40 && !/\s[-–—]\s/.test(body)) {
      topic = body.replace(/[:#*]/g, '').trim();
      last = null;
    }
  }
  return out;
}

// A practice prep note: its first line is the motion.
export function prepMotion(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && l !== '---');
  const first = lines[0] ? clean(lines[0]) : '';
  const info = lines[1] && /^IS:/i.test(lines[1]) ? lines[1].replace(/^IS:\s*/i, '') : '';
  return first ? { text: first, info } : null;
}

// Words that matter, for comparing two motions.
function words(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}
const STOP = new Set(['thw', 'thbt', 'ths', 'thr', 'thp', 'tho', 'the', 'this', 'house', 'that', 'would', 'believes', 'supports', 'regrets', 'prefers', 'opposes', 'and', 'for', 'with', 'from', 'than', 'rather', 'should', 'their', 'its', 'into', 'are', 'was', 'were', 'has', 'have', 'been', 'which', 'who', 'all', 'more', 'over', 'world', 'where', 'what', 'when', 'not', 'any']);

// 0–1: how alike two motions are (shared important words).
export function likeness(a, b) {
  const x = new Set(words(a));
  const y = new Set(words(b));
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / Math.min(x.size, y.size) * (2 * both / (x.size + y.size)) ** 0.5;
}

// How `text` differs from `other`, word by word (a shortest edit):
// → [{ text, changed }] where changed is false, 'added' (only in `text`) or
// 'removed' (only in `other`).
export function wordingDiff(text, other) {
  const a = String(text).split(/\s+/).filter(Boolean);
  const b = String(other).split(/\s+/).filter(Boolean);
  const key = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, '');
  const n = a.length;
  const m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = key(a[i]) === key(b[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  const push = (word, changed) => out.push({ text: `${word} `, changed });
  while (i < n || j < m) {
    if (i < n && j < m && key(a[i]) === key(b[j])) { push(a[i], false); i++; j++; }
    else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) { push(b[j], 'removed'); j++; }
    else { push(a[i], 'added'); i++; }
  }
  return out;
}

// Adds or removes a tag at the end of a motion's line.
export function setLineTag(raw, tag, on) {
  const pattern = tag.startsWith('version/') ? /\s+#version\/[\w-]+\b/gi : new RegExp(`\\s+#${tag.replace('/', '\\/')}\\b`, 'gi');
  const bare = raw.replace(pattern, '').replace(/\s+$/, '');
  return on ? `${bare} #${tag}` : bare;
}

// Finds a motion's line again and changes it. → the note's new text
export function changeMotionLine(text, motion, change) {
  const lines = String(text).split('\n');
  let at = lines[motion.line] === motion.raw ? motion.line : lines.indexOf(motion.raw);
  if (at === -1) at = lines.findIndex((l) => clean(l).startsWith(motion.text.slice(0, 40)));
  if (at === -1) throw new Error('That motion was changed somewhere else. The page has been refreshed — try again.');
  lines[at] = change(lines[at]);
  return lines.join('\n');
}

export function versionName(motion) {
  return slug(motion.text.replace(/^(?:TH[A-Z]{0,3}|TH,|That|This House)\s*/i, '').split(/\s+/).slice(0, 4).join(' '));
}

export { clean as cleanMotionLine, slug };
