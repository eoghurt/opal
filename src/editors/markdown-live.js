// Live preview for the markdown editor:
//  - hides the markdown symbols (# ** * ~~ ` == <u>) unless the cursor is on them
//  - a formatting bar that pops up over selected text
//  - Cmd+B / Cmd+I / Cmd+U / Cmd+K shortcuts
// The file keeps plain markdown; this only changes what you see while writing.

import { Decoration, ViewPlugin, showTooltip, keymap } from '@codemirror/view';
import { StateField, EditorSelection } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

const hide = Decoration.replace({});
const highlightMark = Decoration.mark({ class: 'cm-highlight' });
const underlineMark = Decoration.mark({ class: 'cm-underline' });
const faintMark = Decoration.mark({ class: 'cm-faint-mark' });

// Does any selection range touch [from, to]?
function touches(state, from, to) {
  return state.selection.ranges.some((r) => r.from <= to && r.to >= from);
}

const INLINE = new Set(['Emphasis', 'StrongEmphasis', 'Strikethrough', 'InlineCode']);
const INLINE_MARKS = new Set(['EmphasisMark', 'StrikethroughMark', 'CodeMark']);

function buildDecorations(view) {
  const { state } = view;
  const ranges = [];
  for (const { from, to } of view.visibleRanges) {
    // Headings and bold/italic/strike/code from the markdown parser.
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (node.name.startsWith('ATXHeading')) {
          const line = state.doc.lineAt(node.from);
          if (touches(state, line.from, line.to)) return;
          const mark = node.node.getChild('HeaderMark');
          if (mark) {
            const after = state.doc.sliceString(mark.to, mark.to + 1) === ' ' ? mark.to + 1 : mark.to;
            ranges.push(hide.range(mark.from, after));
          }
          return;
        }
        if (INLINE.has(node.name)) {
          if (touches(state, node.from, node.to)) return false;
          for (let child = node.node.firstChild; child; child = child.nextSibling) {
            if (INLINE_MARKS.has(child.name) && child.to > child.from) ranges.push(hide.range(child.from, child.to));
          }
        }
        return undefined;
      },
    });

    // ==highlight== and <u>underline</u> (not part of standard markdown, so found by pattern).
    const text = state.doc.sliceString(from, to);
    const pattern = /==(?=\S)([^=\n]+?)==|<u>([^\n]+?)<\/u>/g;
    for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
      const start = from + m.index;
      const end = start + m[0].length;
      const isHighlight = m[0].startsWith('==');
      const open = isHighlight ? 2 : 3;
      const close = isHighlight ? 2 : 4;
      const active = touches(state, start, end);
      ranges.push((active ? faintMark : hide).range(start, start + open));
      ranges.push((isHighlight ? highlightMark : underlineMark).range(start + open, end - close));
      ranges.push((active ? faintMark : hide).range(end - close, end));
    }
  }
  return Decoration.set(ranges, true);
}

export const livePreview = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildDecorations(view);
    }
    update(update) {
      if (update.docChanged || update.viewportChanged || update.selectionSet
          || syntaxTree(update.state) !== syntaxTree(update.startState)) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

// ---------- Formatting commands ----------

// Which parsed markdown node each wrapper makes (the rest are found by pattern).
const WRAP_NODES = { '**': 'StrongEmphasis', '*': 'Emphasis', '~~': 'Strikethrough', '`': 'InlineCode' };
const WRAP_PATTERNS = { '==': /==(?=\S)([^=\n]+?)==/g, '<u>': /<u>([^\n]+?)<\/u>/g };

// The span already styled this way that contains [from, to], if any —
// looking outward through other styles (so Cmd+B works on bold+highlighted text).
function enclosing(state, before, from, to) {
  const nodeName = WRAP_NODES[before];
  if (nodeName) {
    for (let node = syntaxTree(state).resolveInner(from, 1); node; node = node.parent) {
      if (node.name === nodeName && node.from <= from && node.to >= to) {
        const open = node.firstChild;
        const close = node.lastChild;
        if (open && close && open !== close) return { open: [open.from, open.to], close: [close.from, close.to] };
      }
    }
    return null;
  }
  const line = state.doc.lineAt(from);
  const pattern = new RegExp(WRAP_PATTERNS[before].source, 'g');
  for (let m = pattern.exec(line.text); m; m = pattern.exec(line.text)) {
    const start = line.from + m.index;
    const end = start + m[0].length;
    const openLen = before.length;
    const closeLen = before === '<u>' ? 4 : before.length;
    if (start <= from && end >= to && (from >= start + openLen || to <= end - closeLen || from <= start)) {
      return { open: [start, start + openLen], close: [end - closeLen, end] };
    }
  }
  return null;
}

// Wraps the selection in `before`/`after`, or removes that style if the
// selection already has it.
export function toggleWrap(view, before, after = before) {
  const { state } = view;
  const changes = state.changeByRange((range) => {
    const found = enclosing(state, before, range.from, range.to);
    if (found) {
      const openLen = found.open[1] - found.open[0];
      const newFrom = range.from - (range.from >= found.open[1] ? openLen : range.from - found.open[0]);
      const newTo = Math.min(range.to, found.close[0]) - openLen;
      return {
        changes: [{ from: found.open[0], to: found.open[1] }, { from: found.close[0], to: found.close[1] }],
        range: EditorSelection.range(Math.max(found.open[0], newFrom), Math.max(found.open[0], newTo)),
      };
    }
    const text = state.sliceDoc(range.from, range.to);
    return {
      changes: { from: range.from, to: range.to, insert: before + text + after },
      range: EditorSelection.range(range.from + before.length, range.to + before.length),
    };
  });
  view.dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input.format' }));
  view.focus();
  return true;
}

// Applies a change to the start of every selected line.
function eachLine(view, change) {
  const { state } = view;
  const seen = new Set();
  const lines = [];
  for (const range of state.selection.ranges) {
    for (let pos = range.from; pos <= range.to;) {
      const line = state.doc.lineAt(pos);
      if (!seen.has(line.number)) {
        seen.add(line.number);
        lines.push(line);
      }
      pos = line.to + 1;
    }
  }
  const changes = change(lines);
  if (changes.length) view.dispatch({ changes, userEvent: 'input.format' });
  view.focus();
  return true;
}

export function setHeading(view, level) {
  return eachLine(view, (lines) => {
    const allAlready = lines.every((l) => new RegExp(`^#{${level}}\\s`).test(l.text) && !/^#{7}/.test(l.text));
    return lines.map((l) => {
      const existing = /^#{1,6}\s+/.exec(l.text);
      const insert = allAlready ? '' : `${'#'.repeat(level)} `;
      return { from: l.from, to: l.from + (existing ? existing[0].length : 0), insert };
    });
  });
}

// Toggles a line prefix such as "> ", "- " or "- [ ] ".
export function toggleLinePrefix(view, prefix, pattern) {
  return eachLine(view, (lines) => {
    const allHave = lines.every((l) => pattern.test(l.text));
    return lines.map((l) => {
      const found = pattern.exec(l.text);
      if (allHave) return { from: l.from, to: l.from + found[0].length, insert: '' };
      const listPrefix = /^(\s*)([-*+]\s(\[[ xX]\]\s)?|>\s|\d+\.\s)/.exec(l.text);
      return { from: l.from + (listPrefix ? listPrefix[1].length : 0), to: l.from + (listPrefix ? listPrefix[0].length : 0), insert: prefix };
    });
  });
}

// Removes inline formatting symbols from the selection (and heading marks from its lines).
export function clearFormatting(view) {
  // First peel off any styles wrapped around the selection…
  for (let round = 0; round < 8; round++) {
    const range = view.state.selection.main;
    const wrapper = ['**', '*', '~~', '`', '==', '<u>'].find((w) => enclosing(view.state, w, range.from, range.to));
    if (!wrapper) break;
    toggleWrap(view, wrapper, wrapper === '<u>' ? '</u>' : wrapper);
  }
  // …then any symbols inside it.
  const { state } = view;
  const changes = state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to);
    const clean = text.replace(/\*\*|__|~~|==|<\/?u>|`/g, '').replace(/(^|[^*])\*(?!\*)/g, '$1');
    return { changes: { from: range.from, to: range.to, insert: clean }, range: EditorSelection.range(range.from, range.from + clean.length) };
  });
  view.dispatch(state.update(changes, { userEvent: 'input.format' }));
  setHeadingOff(view);
  return true;
}

function setHeadingOff(view) {
  return eachLine(view, (lines) => lines
    .map((l) => ({ l, m: /^#{1,6}\s+/.exec(l.text) }))
    .filter(({ m }) => m)
    .map(({ l, m }) => ({ from: l.from, to: l.from + m[0].length, insert: '' })));
}

const ACTIONS = [
  { id: 'bold', label: 'B', title: 'Bold (⌘B)', run: (v) => toggleWrap(v, '**'), cls: 'is-bold' },
  { id: 'italic', label: 'I', title: 'Italic (⌘I)', run: (v) => toggleWrap(v, '*'), cls: 'is-italic' },
  { id: 'underline', label: 'U', title: 'Underline (⌘U)', run: (v) => toggleWrap(v, '<u>', '</u>'), cls: 'is-underline' },
  { id: 'strike', label: 'S', title: 'Strikethrough (⌘⇧X)', run: (v) => toggleWrap(v, '~~'), cls: 'is-strike' },
  { id: 'highlight', label: 'Hi', title: 'Highlight', run: (v) => toggleWrap(v, '=='), cls: 'is-highlight' },
  { id: 'code', label: '</>', title: 'Code', run: (v) => toggleWrap(v, '`'), cls: 'is-mono' },
  { sep: true },
  { id: 'h1', label: 'H1', title: 'Big heading', run: (v) => setHeading(v, 1) },
  { id: 'h2', label: 'H2', title: 'Heading', run: (v) => setHeading(v, 2) },
  { id: 'h3', label: 'H3', title: 'Small heading', run: (v) => setHeading(v, 3) },
  { sep: true },
  { id: 'quote', label: '❝', title: 'Quote', run: (v) => toggleLinePrefix(v, '> ', /^\s*>\s?/) },
  { id: 'bullet', label: '•', title: 'Bullet list', run: (v) => toggleLinePrefix(v, '- ', /^\s*[-*+]\s(?!\[[ xX]\])/) },
  { id: 'task', label: '☐', title: 'Checklist', run: (v) => toggleLinePrefix(v, '- [ ] ', /^\s*[-*+]\s\[[ xX]\]\s/) },
  { id: 'link', label: '[[ ]]', title: 'Link to a note (⌘K)', run: (v) => toggleWrap(v, '[[', ']]'), cls: 'is-mono' },
  { sep: true },
  { id: 'clear', label: '⌫', title: 'Clear formatting', run: (v) => clearFormatting(v) },
];

// ---------- Pop-up formatting bar ----------

function toolbarFor(state) {
  const range = state.selection.main;
  if (range.empty) return null;
  return {
    pos: range.from,
    end: range.to,
    above: true,
    arrow: false,
    create: (view) => {
      const dom = document.createElement('div');
      dom.className = 'cm-format-bar';
      dom.setAttribute('role', 'toolbar');
      dom.setAttribute('aria-label', 'Format text');
      for (const action of ACTIONS) {
        if (action.sep) {
          const sep = document.createElement('span');
          sep.className = 'cm-format-sep';
          dom.append(sep);
          continue;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `cm-format-btn ${action.cls || ''}`;
        button.textContent = action.label;
        button.title = action.title;
        button.setAttribute('aria-label', action.title);
        // mousedown (not click) so the text stays selected.
        button.addEventListener('mousedown', (event) => {
          event.preventDefault();
          action.run(view);
        });
        dom.append(button);
      }
      return { dom, offset: { x: 0, y: 8 } };
    },
  };
}

export const formatBar = StateField.define({
  create: toolbarFor,
  update(value, tr) {
    if (!tr.docChanged && !tr.selection) return value;
    return toolbarFor(tr.state);
  },
  provide: (field) => showTooltip.compute([field], (state) => state.field(field)),
});

export const formatKeymap = keymap.of([
  { key: 'Mod-b', run: (v) => toggleWrap(v, '**') },
  { key: 'Mod-i', run: (v) => toggleWrap(v, '*') },
  { key: 'Mod-u', run: (v) => toggleWrap(v, '<u>', '</u>') },
  { key: 'Mod-Shift-x', run: (v) => toggleWrap(v, '~~') },
  { key: 'Mod-k', run: (v) => toggleWrap(v, '[[', ']]') },
]);
