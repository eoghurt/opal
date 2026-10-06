// Motions, read from the notes in the debate folder's Motions folder — the
// way they're already written, nothing to convert:
//
//   **Grandfinals**                              ← a round heading
//   THBT indulging in schadenfreude is immoral   ← a motion
//   - Schadenfreude is pleasure derived from…    ← its info slide
//
//   Round 2 - THW classify … organisations (Crime)   ← round, motion (a note in brackets is left out)
//   Round 7 - THP … social housing (housing)* *Housing vouchers give…*   ← info slide after "* *"
//
//   Ideas                                        ← a heading (skipped)
//   - TH, as Carol from Pluribus, would …        ← a motion
//   	- IS: Pluribus is a 2025 series …          ← its info slide
//
// Opal's own marks go at the end of a motion's line, as Obsidian tags:
//   #starred            a starred motion
//   #version/<name>     motions that are versions of each other (any file)
//   #topic/<name>       its topics (up to 3), from TOPICS

// The topics motions are sorted into.
export const TOPICS = ['Africa', 'Animals', 'Art', 'Asia', 'Business/Work', 'Children', 'Cities', 'Criminal Justice', 'Culture', 'Development', 'Economics', 'Education/Academia', 'Environment', 'Europe', 'Feminism', 'International Relations', 'Latin America', 'Law', 'LGBTQ+', 'Media', 'Medical', 'Middle East', 'Military', 'Minority Communities', 'Philosophy', 'Politics', 'Religion', 'Romance/Sexuality', 'Science', 'Social Justice', 'Sports', 'Technology/AI'];

// Each topic's colour and symbol (an icon name in icons.js).
const COLORS = { Africa: '#C9971C', Animals: '#3E8E5E', Art: '#B45FB0', Asia: '#D9604C', 'Business/Work': '#A0785E', Children: '#C2A93E', Cities: '#7D8896', 'Criminal Justice': '#C04A5A', Culture: '#C9507A', Development: '#8FA23A', Economics: '#1F9A7D', 'Education/Academia': '#3F82C9', Environment: '#6E9A44', Europe: '#5F82B8', Feminism: '#D0457E', 'International Relations': '#4A63C2', 'Latin America': '#D98A3D', Law: '#8F65D9', 'LGBTQ+': '#9B8FE6', Media: '#4A9ED9', Medical: '#26A0A8', 'Middle East': '#D9692E', Military: '#C5553F', 'Minority Communities': '#D98AA0', Philosophy: '#6E6EE6', Politics: '#4D6DE0', Religion: '#A55BAA', 'Romance/Sexuality': '#E0607E', Science: '#76A083', 'Social Justice': '#B89A33', Sports: '#3FA34D', 'Technology/AI': '#3AAFC9' };
export const MAX_TOPICS = 3;
export function topicLook(topic) {
  return { color: COLORS[topic] || '#8E8E93', icon: `t_${String(topic).toLowerCase().replace(/\+/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}` };
}

// "Criminal Justice" → "criminal-justice" (the tag's name), and back.
export function topicSlug(topic) {
  return String(topic).toLowerCase().replace(/\+/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
// The topics tagged on a line, in order, at most 3.
export function topicsOf(line) {
  const out = [];
  for (const m of String(line).matchAll(/\s#topic\/([\w-]+)/gi)) {
    const t = topicFromSlug(m[1]);
    if (t && !out.includes(t)) out.push(t);
  }
  return out.slice(0, MAX_TOPICS);
}

// A line with its topic tags replaced by these.
export function setLineTopics(line, topics) {
  const bare = String(line).replace(/\s+#topic\/[\w-]+\b/gi, '').replace(/\s+$/, '');
  const tags = topics.slice(0, MAX_TOPICS).map((t) => ` #topic/${topicSlug(t)}`).join('');
  // Keep #starred / #version after the topics, as Opal writes them.
  const keep = (bare.match(/(\s+#(?:starred|version\/[\w-]+)\b)+$/) || [''])[0];
  return `${bare.slice(0, bare.length - keep.length)}${tags}${keep}`;
}

export function topicFromSlug(slug) {
  return TOPICS.find((t) => topicSlug(t) === String(slug).toLowerCase()) || '';
}

const MOTION_START = /^(?:TH[A-Z]{0,3}\b|TH,|That\b|This House\b)/;
const ROUND_LINE = /^((?:Round\s*\d+|R\d+|(?:Double[- ]?)?Octo(?:s|finals?)?|Quarter(?:s|finals?)?|Semi(?:s|finals?)?|Grand ?finals?|Finals?|Partial[- ]?double[- ]?octos?))\s*[-–—:]\s*(.+)$/i;
const TAGS = /\s+#(?:starred|version\/[\w-]+|topic\/[\w-]+)\b/gi;

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
      if (last.infoLine == null) last.infoLine = i;
      continue;
    }
    const roundLine = ROUND_LINE.exec(body);
    if (roundLine || looksLikeMotion(body)) {
      const split = splitMotion(roundLine ? roundLine[2] : body);
      const motion = {
        text: split.text,
        info: split.info,
        topics: topicsOf(raw),
        oldTopic: split.topic,
        inlineInfo: Boolean(split.info),
        infoLine: null,
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
    // A short plain line with no list marker: a heading.
    if (!/^\s*[-*+]/.test(raw) && body.length <= 40 && !/\s[-–—]\s/.test(body)) last = null;
  }
  return out;
}

// A practice prep note: its first line is the motion.
export function prepMotion(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && l !== '---');
  const first = lines[0] ? clean(lines[0]) : '';
  const info = lines[1] && /^IS:/i.test(lines[1]) ? lines[1].replace(/^IS:\s*/i, '') : '';
  return first ? { text: first, info, topics: topicsOf(lines[0] || '') } : null;
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
  const pattern = tag.startsWith('version/') ? /\s+#version\/[\w-]+\b/gi : tag.startsWith('topic/') ? /\s+#topic\/[\w-]+\b/gi : new RegExp(`\\s+#${tag.replace('/', '\\/')}\\b`, 'gi');
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

// Rewrites a motion's wording and info slide where they're written: the
// motion in its line (round label, list mark and tags kept), the info slide
// inline ("* *…*") or on its own line under it. → the note's new text
export function editMotion(text, motion, { text: wording, info }) {
  const lines = String(text).split('\n');
  let at = lines[motion.line] === motion.raw ? motion.line : lines.indexOf(motion.raw);
  if (at === -1) throw new Error('That motion was changed somewhere else. The page has been refreshed — try again.');
  const line = lines[at].replace(/\u00a0/g, ' ');
  const tags = (line.match(TAGS) || []).join('');
  const bare = line.replace(TAGS, '').replace(/\s+$/, '');
  // The wording as written, which may carry a footnote mark ("issues* has").
  const words = motion.text.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const found = new RegExp(words.join('\\*?\\s+')).exec(bare);
  if (!found) throw new Error('Couldn’t find that motion’s wording in its note.');
  const head = bare.slice(0, found.index);
  let rest = bare.slice(found.index + found[0].length);
  const wrap = /^\s*==/.test(head) && /==\s*$/.test(rest) ? '==' : '';
  if (motion.inlineInfo) {
    // "…text* *old info*" → the new info (or none).
    rest = rest.replace(/\*\s+\*[\s\S]*$|\s\*(?=[^\s*])[\s\S]*$/, '').replace(/==\s*$/, '');
    rest = `${rest}${info ? `* *${info}*` : ''}${wrap}`;
  }
  lines[at] = `${head}${wording}${rest}${tags}`;
  if (!motion.inlineInfo) {
    const indent = (/^(\s*)/.exec(lines[at])[1] || '');
    const listy = /^\s*[-*+]\s/.test(lines[at]);
    const infoText = listy ? `${indent}\t- IS: ${info}` : `${indent}- ${info}`;
    if (motion.infoLine != null && lines[motion.infoLine] !== undefined) {
      if (info) lines[motion.infoLine] = lines[motion.infoLine].replace(/^(\s*(?:[-*+]\s+)?(?:IS:\s*)?).*$/i, `$1${info}`);
      else lines.splice(motion.infoLine, 1);
    } else if (info) {
      lines.splice(at + 1, 0, infoText);
    }
  }
  return lines.join('\n');
}

export function versionName(motion) {
  return slug(motion.text.replace(/^(?:TH[A-Z]{0,3}|TH,|That|This House)\s*/i, '').split(/\s+/).slice(0, 4).join(' '));
}

export { clean as cleanMotionLine, slug };
