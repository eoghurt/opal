// Heatmaps from notes, using the block format of Obsidian's Tracker plugin so
// the same block works in both apps:
//
//   ```tracker
//   searchType: tag            (tag, frontmatter, text, task, task.done, dvField, fileMeta)
//   searchTarget: exercise     (the tag / property / text / field to look for)
//   folder: Calendar           (where the notes are; default the whole vault)
//   dateFormat: YYYY-MM-DD     (the date in each note's name — Tracker's default)
//   datasetName: Exercise
//   month:
//       color: green
//   ```
//
// Opal adds one setting of its own: `dateProperty: watched` takes each note's
// date from that property instead of its name (e.g. a Movies folder where
// each note is one film). Obsidian ignores it.

// A small reader for the block's YAML (keys, nested keys, simple values).
function parseTracker(source) {
  const spec = {};
  const stack = [{ indent: -1, obj: spec }];
  for (const raw of String(source || '').split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.length - raw.trimStart().length;
    const m = /^\s*([A-Za-z][\w.-]*)\s*:\s*(.*)$/.exec(raw);
    if (!m) continue;
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    let value = m[2].trim();
    if (!value) {
      const child = {};
      parent[m[1]] = child;
      stack.push({ indent, obj: child });
      continue;
    }
    value = value.replace(/^(['"])(.*)\1$/, '$2');
    parent[m[1]] = value;
  }
  return spec;
}

// Tracker's settings, tidied, with Opal's defaults.
function trackerSettings(spec) {
  const month = spec.month && typeof spec.month === 'object' ? spec.month : {};
  const target = String(spec.searchTarget || '').split(',')[0].trim();
  return {
    searchType: String(spec.searchType || 'tag').trim(),
    searchTarget: target,
    folder: String(spec.folder || '/').trim().replace(/^\/+|\/+$/g, ''),
    dateFormat: String(spec.dateFormat || 'YYYY-MM-DD').trim(),
    dateProperty: spec.dateProperty ? String(spec.dateProperty).trim() : null,
    startDate: spec.startDate ? String(spec.startDate).trim() : null,
    endDate: spec.endDate ? String(spec.endDate).trim() : null,
    title: String(spec.datasetName || spec.title || month.title || target || 'Heatmap').trim(),
    color: String(month.color || spec.color || '').trim() || null,
    unit: String(spec.valueUnit || month.valueUnit || '').trim(),
  };
}

const TOKENS = { YYYY: '(\\d{4})', YY: '(\\d{2})', MM: '(\\d{2})', M: '(\\d{1,2})', DD: '(\\d{2})', D: '(\\d{1,2})' };

function pad(n) {
  return String(n).padStart(2, '0');
}

// "2026-09-30" from a note's name using the date format (e.g. "30.09.2026 journal").
function dateFromName(name, format) {
  if (format === 'iso-8601') format = 'YYYY-MM-DD';
  const order = [];
  const pattern = format.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/YYYY|YY|MM|M|DD|D/g, (t) => {
    order.push(t);
    return TOKENS[t];
  });
  const m = new RegExp(pattern).exec(name);
  if (!m) return null;
  let y; let mo; let d;
  order.forEach((t, i) => {
    const v = Number(m[i + 1]);
    if (t === 'YYYY') y = v;
    else if (t === 'YY') y = 2000 + v;
    else if (t[0] === 'M') mo = v;
    else d = v;
  });
  if (!y || !mo || !d || mo > 12 || d > 31) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

function dateFromValue(value) {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function toNumber(value) {
  if (value === true) return 1;
  if (value === false || value == null) return null;
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) return value.length || null;
  const text = String(value).trim().toLowerCase();
  if (['yes', 'true', 'done', 'y', 'x', '✅', '✓'].includes(text)) return 1;
  if (['no', 'false', 'n', ''].includes(text)) return null;
  const n = parseFloat(text.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 1; // any other text counts as "yes"
}

const BLOCK = /^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n?---[ \t]*(?:\r?\n|$)/;

// One note's value for this heatmap (null = nothing on that day).
// props: its properties (readProperties); words: its word count.
function noteValue(text, props, settings, words) {
  const body = String(text || '').replace(BLOCK, '');
  const target = settings.searchTarget;
  switch (settings.searchType) {
    case 'frontmatter':
      return toNumber(props[target]);
    case 'tag': {
      const name = target.replace(/^#/, '');
      let total = 0;
      let found = false;
      // Tags in the properties (tags: [run]) count once.
      const tags = [].concat(props.tags || props.tag || []).map((t) => String(t).replace(/^#/, '').toLowerCase());
      if (tags.includes(name.toLowerCase())) {
        found = true;
        total += 1;
      }
      // #run or #run:5 (a value) in the text.
      const re = new RegExp(`(^|[\\s(])#${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?::(-?[\\d.]+))?(?![\\w/-])`, 'gim');
      for (let m = re.exec(body); m; m = re.exec(body)) {
        found = true;
        total += m[2] !== undefined ? Number(m[2]) : 1;
      }
      return found ? total : null;
    }
    case 'text': {
      if (!target) return null;
      let re;
      try {
        re = new RegExp(target, 'gm');
      } catch {
        re = new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gm');
      }
      let total = 0;
      let found = false;
      for (let m = re.exec(body); m; m = re.exec(body)) {
        if (m[0] === '') { re.lastIndex++; continue; }
        found = true;
        const v = m.groups && m.groups.value !== undefined ? parseFloat(m.groups.value) : 1;
        total += Number.isFinite(v) ? v : 1;
      }
      return found ? total : null;
    }
    case 'dvField': {
      const re = new RegExp(`(?:^|[\\s\\[(])${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}::\\s*([^\\]\\)\\n]+)`, 'im');
      const m = re.exec(body);
      return m ? toNumber(m[1]) : null;
    }
    case 'task':
    case 'task.all':
    case 'task.done':
    case 'task.notdone': {
      const want = settings.searchType === 'task.notdone' ? /^\s*[-*+]\s\[ \]/ : settings.searchType === 'task.done' || settings.searchType === 'task' ? /^\s*[-*+]\s\[[xX]\]/ : /^\s*[-*+]\s\[[ xX]\]/;
      const count = body.split(/\r?\n/).filter((l) => want.test(l) && (!target || l.toLowerCase().includes(target.toLowerCase()))).length;
      return count || null;
    }
    case 'fileMeta':
      if (target === 'numWords') return words || null;
      if (target === 'numChars') return body.length || null;
      if (target === 'numSentences') return (body.match(/[.!?](\s|$)/g) || []).length || null;
      return 1; // the note exists
    default:
      return null;
  }
}

function noteDate(name, props, settings) {
  if (settings.dateProperty) return dateFromValue(props[settings.dateProperty]);
  return dateFromName(name, settings.dateFormat);
}

module.exports = { parseTracker, trackerSettings, noteValue, noteDate, dateFromName };
