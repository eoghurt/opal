// Note properties (the YAML block at the top of a note) the way Obsidian writes
// them, for databases: text, numbers, dates, checkboxes, links and lists.
//
//   ---
//   subject: English
//   due: 2026-10-02
//   mark: 18
//   submitted: true
//   book: "[[Pride and Prejudice]]"
//   tags:
//     - reading
//   ---
//
// readProperties(text) → { key: value } (value: string | number | boolean | string[] | null)
// writeProperty(text, key, value, type) → text with that one property changed
// (null / '' removes it). Everything else in the note stays as it was.

const BLOCK = /^(?:﻿)?---\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/;
const KEY = /^([^\s:#][^:]*?):(?:\s+(.*))?\s*$/;

function unquote(raw) {
  const value = raw.trim();
  if (/^".*"$/.test(value)) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  if (/^'.*'$/.test(value)) return value.slice(1, -1).replace(/''/g, "'");
  return value;
}

function scalar(raw) {
  const value = raw.trim();
  if (value === '' || value === '~' || value === 'null') return null;
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === 'true';
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (/^\[.*\]$/.test(value) && !/^\[\[.*\]\]$/.test(value)) {
    // [a, b] flow list
    return value.slice(1, -1).split(',').map((s) => unquote(s)).filter((s) => s !== '');
  }
  return unquote(value);
}

function readProperties(text) {
  const match = BLOCK.exec(String(text || ''));
  if (!match) return {};
  const out = {};
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = KEY.exec(lines[i]);
    if (!m) continue;
    const key = m[1].trim();
    if (m[2] !== undefined && m[2].trim() !== '') {
      out[key] = scalar(m[2]);
      continue;
    }
    // A list on the lines below ("  - item").
    const items = [];
    while (i + 1 < lines.length && /^\s+-\s?/.test(lines[i + 1])) {
      i++;
      items.push(unquote(lines[i].replace(/^\s+-\s?/, '')));
    }
    out[key] = items.length ? items : null;
  }
  return out;
}

// How a value is written for a column type (Obsidian's own formats).
function formatValue(value, type) {
  if (value === null || value === undefined || value === '') return null;
  if (type === 'checkbox') return value === true || value === 'true' ? 'true' : 'false';
  if (type === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : null;
  }
  if (type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : null;
  if (Array.isArray(value)) return value;
  const text = String(value).replace(/[\r\n]+/g, ' ').trim();
  if (!text) return null;
  if (type === 'link') {
    const target = text.replace(/^\[\[|\]\]$/g, '');
    return JSON.stringify(`[[${target}]]`);
  }
  // Plain text unless YAML would read it as something else.
  const risky = /^[\s\-?:,[\]{}#&*!|>'"%@`]|: | #|^(true|false|null|~|yes|no)$|^-?\d+(\.\d+)?$|^\d{4}-\d{2}-\d{2}/i.test(text);
  return risky ? JSON.stringify(text) : text;
}

function writeProperty(text, key, value, type = 'text') {
  const source = String(text || '');
  const nl = /\r\n/.test(source) ? '\r\n' : '\n';
  const match = BLOCK.exec(source);
  const lines = match ? match[1].split(/\r?\n/) : [];
  const rest = match ? source.slice(match[0].length) : source;
  // Find the key and any list lines under it.
  let at = -1;
  let span = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = KEY.exec(lines[i]);
    if (m && m[1].trim() === key) {
      at = i;
      span = 1;
      while (i + span < lines.length && /^\s+-\s?/.test(lines[i + span])) span++;
      break;
    }
  }
  const formatted = formatValue(value, type);
  let replacement = [];
  if (Array.isArray(formatted)) {
    replacement = formatted.length ? [`${key}:`, ...formatted.map((v) => `  - ${formatValue(v, 'text')}`)] : [];
  } else if (formatted !== null) {
    replacement = [`${key}: ${formatted}`];
  }
  if (at >= 0) lines.splice(at, span, ...replacement);
  else lines.push(...replacement);
  const kept = lines.filter((l) => l.trim());
  if (!kept.length) return rest;
  return `---${nl}${kept.join(nl)}${nl}---${nl}${rest}`;
}

module.exports = { readProperties, writeProperty, formatValue };
