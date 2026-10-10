// Live preview for the markdown editor:
//  - hides the markdown symbols (# ** * ~~ ` == <u>) unless the cursor is on them
//  - `- [ ]` task items show a real checkbox; clicking it writes [x] / [ ] into the note
//  - a small formatting bar that pops up over selected text
//  - the commands the ribbon (ribbon.js) uses, and what's active at the cursor
//  - Cmd+B / Cmd+I / Cmd+U / Cmd+K shortcuts
// The file keeps plain markdown; this only changes what you see while writing.

import { Decoration, ViewPlugin, WidgetType, showTooltip, keymap } from '@codemirror/view';
import { StateField, EditorSelection } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

const hide = Decoration.replace({});
const highlightMark = Decoration.mark({ class: 'cm-highlight' });
const underlineMark = Decoration.mark({ class: 'cm-underline' });
const faintMark = Decoration.mark({ class: 'cm-faint-mark' });
const doneLine = Decoration.line({ class: 'cm-task-done' });

// The box drawn in place of "[ ]" / "[x]". Clicking it flips the letter in the note.
class CheckboxWidget extends WidgetType {
  constructor(checked) {
    super();
    this.checked = checked;
  }

  eq(other) {
    return other.checked === this.checked;
  }

  toDOM(view) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'cm-task-box';
    box.checked = this.checked;
    box.setAttribute('aria-label', this.checked ? 'Done — click to untick' : 'Not done — click to tick');
    box.addEventListener('mousedown', (event) => event.preventDefault()); // keep the cursor where it is
    box.addEventListener('click', (event) => {
      event.preventDefault();
      const at = view.posAtDOM(box);
      const inside = view.state.doc.sliceString(at + 1, at + 2);
      if (!/[ xX]/.test(inside) || view.state.doc.sliceString(at, at + 1) !== '[') return;
      view.dispatch({ changes: { from: at + 1, to: at + 2, insert: inside === ' ' ? 'x' : ' ' }, userEvent: 'input.task' });
    });
    return box;
  }

  ignoreEvent() {
    return true;
  }
}

const TASK_LINE = /^(\s*(?:[-*+]|\d+[.)])\s)\[([ xX])\](?=\s|$)/;

// Is the text cursor on [from, to]? Symbols only reappear where you're typing —
// not while a range of text is selected (so the text doesn't jump as you drag).
function touches(state, from, to) {
  return state.selection.ranges.some((r) => r.empty && r.from <= to && r.to >= from);
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
          // A class on the whole line, so themes can underline headings.
          ranges.push(Decoration.line({ class: `cm-heading-line cm-h${node.name.slice(10) || 1}` }).range(line.from));
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

    // Task items: a checkbox in place of [ ] / [x], ticked ones crossed out.
    for (let pos = from; pos <= to;) {
      const line = state.doc.lineAt(pos);
      const m = TASK_LINE.exec(line.text);
      if (m) {
        const boxFrom = line.from + m[1].length;
        const checked = m[2] !== ' ';
        if (checked) ranges.push(doneLine.range(line.from));
        // The "- " before the box is hidden (unless you're editing this line), as in Obsidian.
        const indent = /^\s*/.exec(m[1])[0].length;
        if (!/\d/.test(m[1]) && !touches(state, line.from, line.to)) ranges.push(hide.range(line.from + indent, boxFrom));
        ranges.push(Decoration.replace({ widget: new CheckboxWidget(checked) }).range(boxFrom, boxFrom + 3));
      }
      pos = line.to + 1;
    }

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

    // <span style="color: …">coloured text</span> (from the ribbon's text colour).
    const colored = new RegExp(COLOR_SPAN.source, 'g');
    for (let m = colored.exec(text); m; m = colored.exec(text)) {
      const start = from + m.index;
      const end = start + m[0].length;
      const openEnd = start + m[0].indexOf('>') + 1;
      const closeStart = end - '</span>'.length;
      if (closeStart <= openEnd || !SAFE_COLOR.test(m[1])) continue;
      const active = touches(state, start, end);
      ranges.push((active ? faintMark : hide).range(start, openEnd));
      ranges.push(Decoration.mark({ attributes: { style: `color: ${m[1]}` } }).range(openEnd, closeStart));
      ranges.push((active ? faintMark : hide).range(closeStart, end));
    }
  }
  return Decoration.set(ranges, true);
}

export const COLOR_SPAN = /<span style="color: ?([^";<>]+);?">([^\n]*?)<\/span>/g;
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|[a-z]+)$/i;

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
// The parts of a selection that can take inline formatting: each line's
// text inside it, without spaces or line breaks at either end, and without a
// line's own markers (list bullets, "> ", "# ") when the selection starts the
// line. Markdown styles can't cross a line break, so a selection that runs
// onto the next line (or over several) is styled line by line.
const LINE_MARK = /^(\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?|\s*>\s?|#{1,6}\s+)/;
function wrapSegments(state, from, to) {
  const segments = [];
  for (let pos = from; pos <= to;) {
    const line = state.doc.lineAt(pos);
    let a = Math.max(from, line.from);
    let b = Math.min(to, line.to);
    if (a === line.from) {
      const mark = LINE_MARK.exec(line.text);
      if (mark) a = Math.min(b, line.from + mark[0].length);
    }
    const text = state.sliceDoc(a, b);
    a += text.length - text.trimStart().length;
    b -= text.length - text.trimEnd().length;
    if (b > a) segments.push([a, b]);
    if (line.to >= to) break;
    pos = line.to + 1;
  }
  return segments;
}

export function toggleWrap(view, before, after = before) {
  const { state } = view;
  const changes = state.changeByRange((range) => {
    if (!range.empty) {
      const segments = wrapSegments(state, range.from, range.to);
      // Over more than one line, or with spaces / a line break at the ends:
      // style each line's own text.
      if (segments.length > 1 || (segments.length === 1 && (segments[0][0] !== range.from || segments[0][1] !== range.to))) {
        if (segments.length === 1) range = EditorSelection.range(segments[0][0], segments[0][1]);
        else {
          let shift = 0;
          const list = segments.map(([a, b]) => {
            const change = { from: a, to: b, insert: before + state.sliceDoc(a, b) + after };
            shift += before.length + after.length;
            return change;
          });
          return {
            changes: list,
            range: EditorSelection.range(segments[0][0] + before.length, segments[segments.length - 1][1] + shift - after.length),
          };
        }
      }
    }
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
    if (!wrapper) {
      if (!colorSpanAround(view.state, range.from, range.to)) break;
      setTextColor(view, null);
      continue;
    }
    toggleWrap(view, wrapper, wrapper === '<u>' ? '</u>' : wrapper);
  }
  // …then any symbols inside it.
  const { state } = view;
  const changes = state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to);
    const clean = text.replace(/<span style="color: ?[^";<>]+;?">|<\/span>/g, '').replace(/\*\*|__|~~|==|<\/?u>|`/g, '').replace(/(^|[^*])\*(?!\*)/g, '$1');
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

// The pop-up bar over selected text keeps to the basics; everything else is
// in the ribbon at the top of the note (see ribbon.js).
const ACTIONS = [
  { id: 'bold', label: 'B', title: 'Bold (⌘B)', run: (v) => toggleWrap(v, '**'), cls: 'is-bold' },
  { id: 'italic', label: 'I', title: 'Italic (⌘I)', run: (v) => toggleWrap(v, '*'), cls: 'is-italic' },
  { id: 'underline', label: 'U', title: 'Underline (⌘U)', run: (v) => toggleWrap(v, '<u>', '</u>'), cls: 'is-underline' },
  { id: 'strike', label: 'S', title: 'Strikethrough (⌘⇧X)', run: (v) => toggleWrap(v, '~~'), cls: 'is-strike' },
  { id: 'highlight', label: 'Hi', title: 'Highlight', run: (v) => toggleWrap(v, '=='), cls: 'is-highlight' },
  { sep: true },
  { id: 'link', label: '[[ ]]', title: 'Link to a note (⌘K)', run: (v) => toggleWrap(v, '[[', ']]'), cls: 'is-mono' },
  { id: 'clear', label: '⌫', title: 'Clear formatting', run: (v) => clearFormatting(v) },
];

// ---------- More commands (used by the ribbon) ----------

// The <span style="color"> around [from, to] on its line, if any.
function colorSpanAround(state, from, to) {
  const line = state.doc.lineAt(from);
  const pattern = new RegExp(COLOR_SPAN.source, 'g');
  for (let m = pattern.exec(line.text); m; m = pattern.exec(line.text)) {
    const start = line.from + m.index;
    const end = start + m[0].length;
    const openEnd = start + m[0].indexOf('>') + 1;
    if (start <= from && end >= to) return { start, end, openEnd, closeStart: end - 7, color: m[1] };
  }
  return null;
}

// Colours the selected text (color = null takes the colour off).
export function setTextColor(view, color) {
  const { state } = view;
  const range = state.selection.main;
  const found = colorSpanAround(state, range.from, range.to);
  if (found) {
    const inner = state.sliceDoc(found.openEnd, found.closeStart);
    const insert = color ? `<span style="color: ${color}">${inner}</span>` : inner;
    const shift = color ? `<span style="color: ${color}">`.length : 0;
    view.dispatch({
      changes: { from: found.start, to: found.end, insert },
      selection: { anchor: found.start + shift, head: found.start + shift + inner.length },
      userEvent: 'input.format',
    });
  } else if (color && !range.empty) {
    const open = `<span style="color: ${color}">`;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: `${open}${state.sliceDoc(range.from, range.to)}</span>` },
      selection: { anchor: range.from + open.length, head: range.to + open.length },
      userEvent: 'input.format',
    });
  }
  view.focus();
  return true;
}

// 1. 2. 3. numbering on the selected lines (or takes it off).
export function toggleNumbered(view) {
  return eachLine(view, (lines) => {
    const pattern = /^(\s*)(\d+\.\s|[-*+]\s(\[[ xX]\]\s)?|>\s)?/;
    const allHave = lines.every((l) => /^\s*\d+\.\s/.test(l.text));
    return lines.map((l, i) => {
      const m = pattern.exec(l.text);
      return { from: l.from + m[1].length, to: l.from + m[0].length, insert: allHave ? '' : `${i + 1}. ` };
    });
  });
}

// Normal text, Heading 1–4, Quote or Code block for the selected lines.
export function setBlockStyle(view, style) {
  if (style === 'code') return toggleCodeBlock(view);
  eachLine(view, (lines) => lines.map((l) => {
    const m = /^(#{1,6}\s+|>\s?)?/.exec(l.text);
    const insert = style === 'quote' ? '> ' : /^h[1-6]$/.test(style) ? `${'#'.repeat(Number(style[1]))} ` : '';
    return { from: l.from, to: l.from + m[0].length, insert };
  }));
  return true;
}

// Wraps the selected lines in ``` fences, or takes the fences away.
export function toggleCodeBlock(view) {
  const { state } = view;
  const range = state.selection.main;
  for (let node = syntaxTree(state).resolveInner(range.head, -1); node; node = node.parent) {
    if (node.name === 'FencedCode') {
      const first = state.doc.lineAt(node.from);
      const last = state.doc.lineAt(node.to);
      const changes = [{ from: first.from, to: Math.min(first.to + 1, state.doc.length) }];
      if (last.number !== first.number) changes.push({ from: Math.max(last.from - 1, first.to + 1), to: last.to });
      view.dispatch({ changes, userEvent: 'input.format' });
      view.focus();
      return true;
    }
  }
  const first = state.doc.lineAt(range.from);
  const last = state.doc.lineAt(range.to);
  view.dispatch({
    changes: [{ from: first.from, insert: '```\n' }, { from: last.to, insert: '\n```' }],
    userEvent: 'input.format',
  });
  view.focus();
  return true;
}

// A horizontal line below the cursor's line.
export function insertDivider(view) {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const insert = `${line.text.trim() ? '\n' : ''}\n---\n`;
  view.dispatch({ changes: { from: line.to, insert }, selection: { anchor: line.to + insert.length }, userEvent: 'input' });
  view.focus();
  return true;
}

// [selected text](https://) with the address selected, ready to paste over.
export function insertWebLink(view) {
  const { state } = view;
  const range = state.selection.main;
  const text = state.sliceDoc(range.from, range.to) || 'link';
  const insert = `[${text}](https://)`;
  const urlFrom = range.from + text.length + 3;
  view.dispatch({ changes: { from: range.from, to: range.to, insert }, selection: { anchor: urlFrom, head: urlFrom + 8 }, userEvent: 'input' });
  view.focus();
  return true;
}

export function insertText(view, text) {
  const range = view.state.selection.main;
  view.dispatch({ changes: { from: range.from, to: range.to, insert: text }, selection: { anchor: range.from + text.length }, userEvent: 'input' });
  view.focus();
  return true;
}

// What the cursor or selection is in, for lighting up ribbon buttons.
export function activeFormats(state) {
  const range = state.selection.main;
  const line = state.doc.lineAt(range.head).text;
  const heading = /^(#{1,6})\s/.exec(line);
  let code = false;
  for (let node = syntaxTree(state).resolveInner(range.head, -1); node; node = node.parent) {
    if (node.name === 'FencedCode') code = true;
  }
  const color = colorSpanAround(state, range.from, range.to);
  return {
    bold: !!enclosing(state, '**', range.from, range.to),
    italic: !!enclosing(state, '*', range.from, range.to),
    underline: !!enclosing(state, '<u>', range.from, range.to),
    strike: !!enclosing(state, '~~', range.from, range.to),
    highlight: !!enclosing(state, '==', range.from, range.to),
    code: !!enclosing(state, '`', range.from, range.to),
    color: color ? color.color : null,
    style: code ? 'code' : heading ? `h${Math.min(4, heading[1].length)}` : /^\s*>/.test(line) ? 'quote' : 'normal',
    bullet: /^\s*[-*+]\s(?!\[[ xX]\])/.test(line),
    numbered: /^\s*\d+\.\s/.test(line),
    task: /^\s*[-*+]\s\[[ xX]\]\s/.test(line),
  };
}

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
