// Applying a template to a note that already has writing in it.
//
//   mergeTemplate(noteText, templateText) → the note with the template added:
//   the template's properties the note doesn't have yet are added (the note's
//   own values win), and the template's text goes below the note's own (or
//   becomes the note if it was empty). Stickies stay where they are.

import { readProperties, writeProperty } from '../shared/properties.js';
import { stickyBlockRange } from '../shared/stickies.js';

const BLOCK = /^(?:﻿)?---\r?\n[\s\S]*?\r?\n?---[ \t]*(?:\r?\n|$)/;

function body(text) {
  const match = BLOCK.exec(text);
  return match ? text.slice(match[0].length) : text;
}

function typeOf(value) {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'checkbox';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
  return 'text';
}

export function mergeTemplate(noteText, templateText) {
  let out = String(noteText || '');
  const have = readProperties(out);
  for (const [key, value] of Object.entries(readProperties(templateText))) {
    if (value == null || key in have) continue;
    out = writeProperty(out, key, value, typeOf(value));
  }
  const addition = body(String(templateText || '')).trim();
  if (!addition) return out;
  // The note's text, without its stickies block (that goes back at the end).
  const head = BLOCK.exec(out);
  const headText = head ? head[0] : '';
  let rest = out.slice(headText.length);
  const range = stickyBlockRange(rest);
  const stickies = range ? rest.slice(range.from, range.to).trim() : '';
  if (range) rest = rest.slice(0, range.from) + rest.slice(range.to);
  rest = rest.replace(/\s+$/, '');
  const joined = rest.trim() ? `${rest}\n\n${addition}\n` : `${addition}\n`;
  return `${headText}${joined}${stickies ? `\n${stickies}\n` : ''}`;
}
