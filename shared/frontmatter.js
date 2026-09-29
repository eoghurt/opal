// Front matter: the properties block at the very top of a note, which
// Obsidian shows as "Properties":
//
//   ---
//   opal-color: coral
//   ---
//
// Opal keeps its own settings here under `opal-` names. Only simple
// "key: value" lines are handled; anything else in the block is left alone.
// Used by both the window and main.js.

const BLOCK = /^(?:﻿)?---\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/;

// The ten colours a folder or page can have. Everything starts as manila.
const ITEM_COLORS = {
  manila: '#F2D38A',
  coral: '#F28B74',
  tangerine: '#F6A55C',
  lemon: '#F4E36B',
  sage: '#A9C98E',
  mint: '#8FD4C1',
  sky: '#8EC5EA',
  periwinkle: '#A9B3F0',
  lilac: '#CDA8EC',
  rose: '#F3A6C4',
};
const DEFAULT_COLOR = 'manila';

function findBlock(text) {
  const match = BLOCK.exec(text);
  return match ? { start: 0, end: match[0].length, body: match[1] } : null;
}

function lineKey(line) {
  const match = /^([A-Za-z0-9_-]+):\s?(.*)$/.exec(line);
  return match ? { key: match[1], value: match[2].trim() } : null;
}

function getProp(text, key) {
  const block = findBlock(text);
  if (!block) return null;
  for (const line of block.body.split(/\r?\n/)) {
    const found = lineKey(line);
    if (found && found.key === key) return found.value.replace(/^(["'])(.*)\1$/, '$2');
  }
  return null;
}

// Sets (or with null, removes) one property; removes the whole block if it
// ends up empty. Everything else in the note stays as it was.
function setProp(text, key, value) {
  const nl = /\r\n/.test(text) ? '\r\n' : '\n';
  const block = findBlock(text);
  const lines = block ? block.body.split(/\r?\n/) : [];
  const index = lines.findIndex((l) => {
    const found = lineKey(l);
    return found && found.key === key;
  });
  if (value == null) {
    if (index !== -1) lines.splice(index, 1);
  } else if (index !== -1) {
    lines[index] = `${key}: ${value}`;
  } else {
    lines.push(`${key}: ${value}`);
  }
  const rest = block ? text.slice(block.end) : text;
  const kept = lines.filter((l, i) => l.trim() || i < lines.length - 1);
  if (!kept.some((l) => l.trim())) return rest;
  return `---${nl}${kept.join(nl)}${nl}---${nl}${rest}`;
}

// Properties Opal shows in its own way (so a block of only these is hidden in
// the editor): the description under the title, the word target as a bar.
const OPAL_SHOWN = ['description', 'word-target'];

// Where the block is, and whether it holds only Opal's own settings (then the
// editor hides it).
function frontmatterRange(text) {
  const block = findBlock(text);
  if (!block) return null;
  const keys = block.body.split(/\r?\n/).filter((l) => l.trim()).map((l) => (lineKey(l) || { key: '' }).key);
  return { from: 0, to: block.end, onlyOpal: keys.length > 0 && keys.every((k) => k.startsWith('opal-') || OPAL_SHOWN.includes(k)) };
}

function stripFrontmatter(text) {
  const block = findBlock(text);
  return block ? text.slice(block.end) : text;
}

// Colours of files that can't hold their own properties (PDFs, pictures…)
// live in their folder note as `opal-file-colors: {"Name.pdf":"sky"}`.
function fileColors(text) {
  try {
    const value = JSON.parse(getProp(text, 'opal-file-colors') || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function setFileColor(text, fileName, color) {
  const map = fileColors(text);
  if (color) map[fileName] = color;
  else delete map[fileName];
  return setProp(text, 'opal-file-colors', Object.keys(map).length ? JSON.stringify(map) : null);
}

// A folder's own order for its items (set by dragging in Opal), kept in its
// folder note as `opal-order: ["Maths","Essay plan.md",…]`. Names not in the
// list come after, in the usual order.
function itemOrder(text) {
  try {
    const value = JSON.parse(getProp(text, 'opal-order') || '[]');
    return Array.isArray(value) ? value.filter((n) => typeof n === 'string') : [];
  } catch {
    return [];
  }
}

function setItemOrder(text, names) {
  return setProp(text, 'opal-order', names && names.length ? JSON.stringify(names) : null);
}

// A one-line description, shown under a note's or folder's title. Kept as the
// standard `description` property (quoted, so any text is safe in it).
function getDescription(text) {
  const raw = getProp(text, 'description');
  if (raw == null) return '';
  const block = findBlock(text);
  const line = block.body.split(/\r?\n/).map(lineKey).find((f) => f && f.key === 'description');
  const value = line ? line.value : raw;
  if (/^".*"$/.test(value)) {
    try {
      return String(JSON.parse(value));
    } catch {
      return value.slice(1, -1);
    }
  }
  return value.replace(/^'(.*)'$/, '$1');
}

function setDescription(text, description) {
  const clean = String(description || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 500);
  return setProp(text, 'description', clean ? JSON.stringify(clean) : null);
}

function validColor(name) {
  return Object.prototype.hasOwnProperty.call(ITEM_COLORS, name) ? name : null;
}

module.exports = {
  ITEM_COLORS, DEFAULT_COLOR, getProp, setProp, frontmatterRange, stripFrontmatter, fileColors, setFileColor, itemOrder, setItemOrder, validColor, getDescription, setDescription,
};
