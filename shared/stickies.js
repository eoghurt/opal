// Sticky notes live inside the note's own markdown file, in a comment block
// that Obsidian, GitHub and other markdown apps don't display:
//
//   <!-- opal:stickies
//   {"id":"k3f9","x":0.72,"y":340,"color":2,"tilt":-2,"text":"ask ms. k"}
//   -->
//
// One sticky per line. x is a fraction of the page's width, y is pixels from
// the top, color is a palette slot (1–5), size is 0.25–2 (1 = normal).
// Used by both the window and main.js.

const BLOCK = /(?:\r?\n)*<!-- opal:stickies\r?\n([\s\S]*?)-->[ \t]*(?:\r?\n)?/;

function findBlock(text) {
  const match = BLOCK.exec(text);
  return match ? { start: match.index, end: match.index + match[0].length, body: match[1] } : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function tidy(sticky) {
  if (!sticky || typeof sticky !== 'object') return null;
  const color = Math.round(Number(sticky.color));
  return {
    id: String(sticky.id || Math.random().toString(36).slice(2, 8)).slice(0, 24),
    x: clamp(Number(sticky.x) || 0, 0, 0.95),
    y: clamp(Math.round(Number(sticky.y) || 0), 0, 200000),
    color: color >= 1 && color <= 5 ? color : 2,
    tilt: clamp(Math.round((Number(sticky.tilt) || 0) * 10) / 10, -6, 6),
    size: clamp(Math.round((Number(sticky.size) || 1) * 100) / 100, 0.25, 2),
    text: String(sticky.text == null ? '' : sticky.text).slice(0, 2000),
  };
}

// The stickies stored in a note's text ([] if none). Damaged lines are skipped.
function parseStickies(text) {
  const block = findBlock(text);
  if (!block) return [];
  return block.body
    .split(/\r?\n/)
    .map((line) => {
      if (!line.trim()) return null;
      try {
        return tidy(JSON.parse(line));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// "--" would end the comment early, so it's written as an escape JSON understands.
function encode(sticky) {
  return JSON.stringify(tidy(sticky)).replace(/--/g, '-\\u002d');
}

// The note's text with its sticky block replaced (or added, or removed when empty).
function writeStickies(text, list) {
  const nl = /\r\n/.test(text) ? '\r\n' : '\n';
  const core = list.length ? `<!-- opal:stickies${nl}${list.map(encode).join(nl)}${nl}-->` : '';
  const block = findBlock(text);
  const before = (block ? text.slice(0, block.start) : text).replace(/\s+$/, '');
  const after = block ? text.slice(block.end) : '';
  if (!core) return before + nl + (after ? nl + after : '');
  return before + (before ? nl + nl : '') + core + nl + after;
}

// The note's text without the sticky block (for word counts, outlines, previews).
function stripStickies(text) {
  const block = findBlock(text);
  return block ? `${text.slice(0, block.start)}\n${text.slice(block.end)}` : text;
}

// Where the block sits in the text, so the editor can hide it.
function stickyBlockRange(text) {
  const match = /<!-- opal:stickies\r?\n[\s\S]*?-->/.exec(text);
  return match ? { from: match.index, to: match.index + match[0].length } : null;
}

module.exports = { parseStickies, writeStickies, stripStickies, stickyBlockRange };
