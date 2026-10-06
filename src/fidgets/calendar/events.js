// Calendar events live in daily notes: Calendar/2026-09-28.md (the same
// naming Obsidian's Daily Notes use). One event per line:
//
//   - 09:00–10:30 Maths test [[Exam timetable]] #c3
//   - all day Excursion #c2
//
// An event that runs over several days sits in its first day's note with its
// last day after an arrow:  - all day School camp → 2026-10-03
//                            - 09:00–17:00 Conference → 2026-10-02  (09:00 on day 1 to 17:00 on the last)
// 🔔 10m / 🔔 1h / 🔔 1d asks for a reminder that long before (🔔 0m = at the
// start; all-day events count from 9:00).
// #color/<name> sets the event's fill and #accent/<name> its accent stripe,
// from the 30 EVENT_COLORS below (older #c1 … #c5 tags pick a palette colour).
// Anything else in the note is left alone.
//
// Repeating events live together in Calendar/Repeating.md, one per line:
//
//   - 07:30–08:30 Gym #color/sage 🔁 every week from 2026-09-28 until 2026-12-20 except 2026-10-05
//
// "from" is the first day, "until" (optional) the last, "except" lists days skipped.

import { RULE_TEXT, normaliseRule, occursOn } from './repeat.js';

export const CALENDAR_FOLDER = 'Calendar';
export const REPEATS_NAME = 'Repeating';
export const REPEATS_PATH = `${CALENDAR_FOLDER}/${REPEATS_NAME}.md`;

// The 30 colours an event's or task's fill (primary) and stripe (secondary)
// can use — chosen to read well on dark and light backgrounds.
export const EVENT_COLORS = {
  garnet: '#9B2C3A', brick: '#B4442F', coral: '#D9604C', raspberry: '#B02A5E', rose: '#C9507A', blush: '#D98AA0',
  ember: '#C2571A', apricot: '#D98A3D', amber: '#C9971C', mustard: '#A88A2A', butter: '#D4BE5A',
  olive: '#7A8A2E', moss: '#5C7F3A', fern: '#3E8E5E', sage: '#76A083', emerald: '#1F8A70', teal: '#1E7F86',
  sky: '#4A90C9', ocean: '#2F6FB0', cobalt: '#3355C9', denim: '#4A6A9A', navy: '#2A3F8F',
  iris: '#5B5BD6', lavender: '#8B7FD9', violet: '#7B4FC9', plum: '#8A3F8F', orchid: '#B45FB0',
  slate: '#5A6472', mocha: '#7A5C48', sand: '#A8987A',
};

// Names from the earlier set of 20, still written in older notes: each shows
// as its nearest colour from the set above (the notes don't need changing).
const OLD_NAMES = {
  tomato: 'brick', flamingo: 'blush', tangerine: 'apricot', banana: 'butter', lemon: 'butter',
  basil: 'fern', forest: 'moss', mint: 'teal', peacock: 'ocean', blueberry: 'cobalt',
  grape: 'violet', cocoa: 'mocha', graphite: 'slate', ink: 'slate',
};

// A colour name (new or old) → its colour, or null.
export function colorHex(name) {
  if (!name) return null;
  return EVENT_COLORS[name] || EVENT_COLORS[OLD_NAMES[name]] || null;
}

// The earlier 20 colours, kept for table shading (tables store the colour itself).
export const LEGACY_COLORS = {
  tomato: '#E4574A', flamingo: '#F28C8C', coral: '#F28B74', tangerine: '#F4A259', banana: '#F6D55C',
  lemon: '#F4E36B', sage: '#98C379', basil: '#3F9C63', forest: '#2E5E3B', mint: '#8FD4C1',
  sky: '#8EC5EA', peacock: '#3DA5D9', blueberry: '#4A6CD4', navy: '#2F3E75', lavender: '#A5A6F6',
  grape: '#8E54B8', rose: '#F3A6C4', cocoa: '#8D6346', graphite: '#6B6B6B', ink: '#16140F',
};

// Dark fills need light writing.
export function isDark(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.22;
}
export const SNAP = 15; // minutes

const EVENT_LINE = /^(\s*[-*]\s+)(?:(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})|(all[ -]day))\s+(.*?)\s*$/i;
const COLOR_TAG = /(^|\s)#c([1-5])\b/;
const PRIMARY_TAG = /(^|\s)#color\/([a-z]+)\b/;
const SECONDARY_TAG = /(^|\s)#accent\/([a-z]+)\b/;
const ALL_COLOR_TAGS = /(^|\s)#(?:c[1-5]|color\/[a-z]+|accent\/[a-z]+)\b/g;
const UNTIL_TAG = /(^|\s)→\s*(\d{4}-\d{2}-\d{2})(?=\s|$)/;
const UNTIL_ALL = /(^|\s)→\s*\d{4}-\d{2}-\d{2}(?=\s|$)/g;
const REMIND_TAG = /(^|\s)🔔\s*(\d+)\s*([mhd])(?=\s|$)/;
const REMIND_ALL = /(^|\s)🔔\s*\d+\s*[mhd](?=\s|$)/g;
export const ALL_DAY_REMIND_AT = 9 * 60;
const LINK = /\[\[([^[\]\n|#]+)(?:#[^[\]\n|]*)?(?:\|([^[\]\n]+))?\]\]/g;

const pad = (n) => String(n).padStart(2, '0');

export function dayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function dayPath(key) {
  return `${CALENDAR_FOLDER}/${key}.md`;
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfWeek(date) {
  const day = (date.getDay() + 6) % 7; // Monday first
  return addDays(new Date(date.getFullYear(), date.getMonth(), date.getDate()), -day);
}

export function clock(minutes) {
  const m = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

// Friendly title: colour tag removed; a link at the end is shown separately
// (as "→ Page"), a link in the middle reads as its text.
const JOINING_WORDS = /\b(with|to|at|for|and|of|about|from|on|in|by|the|a|an|see|re|vs)$/i;

function displayTitle(text) {
  const clean = text.replace(ALL_COLOR_TAGS, '$1').replace(REMIND_ALL, '$1').replace(UNTIL_ALL, '$1').trim();
  const before = clean.replace(/(\s*\[\[[^[\]\n]+\]\])+\s*$/, '').trim();
  // "Maths test [[Exam timetable]]" → "Maths test"; but "Lunch with [[Sam]]" keeps Sam.
  const splitOff = before && before !== clean && !JOINING_WORDS.test(before.replace(/[\s–—:-]+$/, ''));
  return (splitOff ? before : clean)
    .replace(LINK, (_m, target, alias) => (alias || target).trim())
    .replace(/\s[–—-]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// All events in one day note's text.
export function parseEvents(text, key) {
  const events = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const match = EVENT_LINE.exec(line);
    if (!match) return;
    const body = match[7];
    const color = COLOR_TAG.exec(body);
    const primary = PRIMARY_TAG.exec(body);
    const secondary = SECONDARY_TAG.exec(body);
    const link = new RegExp(LINK.source).exec(body);
    const remind = REMIND_TAG.exec(body);
    const until = UNTIL_TAG.exec(body);
    const allDay = Boolean(match[6]);
    let start = allDay ? 0 : Number(match[2]) * 60 + Number(match[3]);
    let end = allDay ? 24 * 60 : Number(match[4]) * 60 + Number(match[5]);
    start = Math.min(start, 24 * 60 - SNAP);
    if (end <= start) end = Math.min(start + 60, 24 * 60);
    end = Math.min(end, 24 * 60);
    events.push({
      day: key,
      line: index,
      raw: line,
      allDay,
      start,
      end,
      text: body.replace(ALL_COLOR_TAGS, '$1').replace(REMIND_ALL, '$1').replace(UNTIL_ALL, '$1').replace(/\s+/g, ' ').trim(), // what's written, minus tags
      endDay: until && until[2] > key ? until[2] : null, // last day, for multi-day events
      remind: remind ? Number(remind[2]) * { m: 1, h: 60, d: 1440 }[remind[3]] : null, // minutes before
      title: displayTitle(body) || 'Untitled',
      color: color ? Number(color[2]) : null,
      primary: primary && colorHex(primary[2]) ? primary[2] : null,
      secondary: secondary && colorHex(secondary[2]) ? secondary[2] : null,
      link: link ? link[1].trim() : null,
    });
  });
  return events;
}

// 10 → "10m", 60 → "1h", 1440 → "1d"
export function remindLabel(minutes) {
  if (minutes && minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes && minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

export function formatEvent({ allDay, start, end, text, color, primary, secondary, remind, endDay, day }) {
  const when = allDay ? 'all day' : `${clock(start)}–${clock(end)}`;
  const tags = [
    endDay && (!day || endDay > day) ? `→ ${endDay}` : null,
    remind != null ? `🔔 ${remindLabel(remind)}` : null,
    primary ? `#color/${primary}` : color ? `#c${color}` : null,
    secondary ? `#accent/${secondary}` : null,
  ].filter(Boolean).join(' ');
  return `- ${when} ${text.trim()}${tags ? ` ${tags}` : ''}`;
}

function splitLines(text) {
  return { lines: text.split(/\r?\n/), nl: /\r\n/.test(text) ? '\r\n' : '\n' };
}

// Finds an event's line: where it was, or (if the note changed) wherever it is now.
function findLine(lines, event) {
  if (lines[event.line] === event.raw) return event.line;
  const index = lines.indexOf(event.raw);
  if (index === -1) throw new Error('That event was changed somewhere else. The calendar has been refreshed — try again.');
  return index;
}

// Replaces (or with null, removes) an event's line.
export function replaceEvent(text, event, newLine) {
  const { lines, nl } = splitLines(text);
  const index = findLine(lines, event);
  if (newLine === null) lines.splice(index, 1);
  else lines[index] = newLine;
  return lines.join(nl);
}

// Adds an event line under the note's "## Schedule" heading (made if missing),
// keeping the schedule in time order.
export function insertEvent(text, newLine, dateLabel) {
  if (!text.trim()) return `# ${dateLabel}\n\n## Schedule\n${newLine}\n`;
  const { lines, nl } = splitLines(text);
  let heading = lines.findIndex((l) => /^#{1,6}\s+schedule\s*$/i.test(l));
  if (heading === -1) {
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    lines.push('', '## Schedule', newLine, '');
    return lines.join(nl);
  }
  const newStart = parseEvents(newLine, '')[0];
  let at = heading + 1;
  while (at < lines.length && !/^#{1,6}\s/.test(lines[at])) {
    const existing = parseEvents(lines[at], '')[0];
    if (existing && newStart && (existing.allDay ? 0 : existing.start) > (newStart.allDay ? 0 : newStart.start)) break;
    if (!existing && !lines[at].trim()) break;
    at++;
  }
  lines.splice(at, 0, newLine);
  return lines.join(nl);
}

// ---------- Repeating events ----------

const DATE = /\d{4}-\d{2}-\d{2}/;

// Every repeating series in Calendar/Repeating.md.
export function parseSeries(text) {
  const series = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const at = line.indexOf('🔁');
    if (at === -1) return;
    const event = parseEvents(line.slice(0, at), '')[0];
    const clause = line.slice(at + 2);
    const rule = normaliseRule((RULE_TEXT.exec(clause) || [])[1]);
    const from = (new RegExp(`from\\s+(${DATE.source})`).exec(clause) || [])[1];
    if (!event || !rule || !from) return;
    const until = (new RegExp(`until\\s+(${DATE.source})`).exec(clause) || [])[1] || null;
    const exceptText = (/except\s+([\d\s,-]+)/.exec(clause) || [])[1] || '';
    series.push({
      ...event,
      line: index,
      raw: line,
      rule,
      from,
      until,
      except: exceptText.match(new RegExp(DATE.source, 'g')) || [],
      repeating: true,
    });
  });
  return series;
}

export function formatSeries(s) {
  let line = `${formatEvent(s)} 🔁 ${s.rule} from ${s.from}`;
  if (s.until) line += ` until ${s.until}`;
  const except = [...new Set(s.except || [])].filter((k) => k >= s.from && (!s.until || k <= s.until)).sort();
  if (except.length) line += ` except ${except.join(', ')}`;
  return line;
}

// The repeats that land on one day, as events for that day.
export function occurrences(series, key) {
  return series
    .filter((s) => occursOn(s.rule, s.from, key) && (!s.until || key <= s.until) && !s.except.includes(key))
    .map((s) => ({ ...s, day: key, endDay: null }));
}

export function appendSeries(text, line) {
  if (!text.trim()) return `# Repeating events\n\nEvents listed here show in Opal's calendar on every day they repeat.\n\n${line}\n`;
  const { lines, nl } = splitLines(text);
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  lines.push(line, '');
  return lines.join(nl);
}

// Stacks items that run across days (all-day row) into lanes so none overlap.
// items: [{ from, to }] as column indexes; adds `lane`. Returns the lane count.
export function stackLanes(items) {
  const lanes = [];
  const order = items.slice().sort((a, b) => a.from - b.from || (b.to - b.from) - (a.to - a.from));
  for (const item of order) {
    let lane = lanes.findIndex((lastTo) => lastTo < item.from);
    if (lane === -1) lane = lanes.length;
    lanes[lane] = item.to;
    item.lane = lane;
  }
  return lanes.length;
}

// Side-by-side columns for overlapping events (like Apple/Google Calendar).
// Adds `col` and `cols` to each timed event.
export function layoutColumns(events) {
  const timed = events.filter((e) => !e.allDay).sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster = [];
  let clusterEnd = -1;
  const finish = () => {
    const columns = [];
    for (const event of cluster) {
      let col = columns.findIndex((endAt) => endAt <= event.start);
      if (col === -1) col = columns.length;
      columns[col] = event.end;
      event.col = col;
    }
    for (const event of cluster) event.cols = columns.length;
  };
  for (const event of timed) {
    if (cluster.length && event.start >= clusterEnd) {
      finish();
      cluster = [];
    }
    cluster.push(event);
    clusterEnd = Math.max(clusterEnd, event.end);
  }
  if (cluster.length) finish();
  return timed;
}
