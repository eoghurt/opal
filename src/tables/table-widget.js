// Shows each HTML table in a note as an editable table (TableEditor) inside
// the CodeMirror editor. The note's text stays the only copy: every change in
// the table is written back over the table's lines.

import { EditorView, WidgetType, Decoration } from '@codemirror/view';
import { StateField } from '@codemirror/state';
import { undo, redo } from '@codemirror/commands';
import { TableEditor } from './table-editor.js';
import { findTableBlocks, blankTable, serializeTable } from './table-model.js';

class TableWidget extends WidgetType {
  constructor(source) {
    super();
    this.source = source;
  }

  eq(other) {
    return other.source === this.source;
  }

  toDOM(view) {
    const editor = new TableEditor(this.source, {
      onCommit: (next) => writeBack(view, editor.root, next),
      onHistory: (direction) => (direction < 0 ? undo(view) : redo(view)),
    });
    editor.root.opalTable = editor;
    return editor.root;
  }

  // The table's own edits come back as a "new" widget with the text it just
  // wrote: keep the same table (and the cursor in it). Anything else — undo,
  // an outside edit — reloads it.
  updateDOM(dom) {
    const editor = dom.opalTable;
    if (!editor) return false;
    if (editor.serialized !== this.source) editor.load(this.source);
    return true;
  }

  destroy(dom) {
    if (dom.opalTable) dom.opalTable.destroy();
  }

  ignoreEvent() {
    return true;
  }
}

// Replaces the table's lines with `next` ('' removes the table).
function writeBack(view, dom, next) {
  let pos;
  try {
    pos = view.posAtDOM(dom);
  } catch {
    return;
  }
  const doc = view.state.doc;
  const first = doc.lineAt(pos);
  let last = first;
  while (last.number < doc.lines && !/<\/table>/i.test(last.text)) last = doc.line(last.number + 1);
  const from = first.from;
  let to = last.to;
  if (!next) {
    // Take a blank line with it, so no gap is left behind.
    if (last.number < doc.lines && !doc.line(last.number + 1).text.trim()) to = doc.line(last.number + 1).to;
  }
  view.dispatch({ changes: { from, to, insert: next }, userEvent: next ? 'input.table' : 'delete.table' });
}

function tableDecorations(state) {
  const doc = state.doc;
  const lines = [];
  for (let i = 1; i <= doc.lines; i++) lines.push(doc.line(i).text);
  const ranges = findTableBlocks(lines).map(({ fromLine, toLine }) => {
    const from = doc.line(fromLine).from;
    const to = doc.line(toLine).to;
    return Decoration.replace({ widget: new TableWidget(state.sliceDoc(from, to)), block: true }).range(from, to);
  });
  return ranges.length ? Decoration.set(ranges) : Decoration.none;
}

export const tableBlocks = StateField.define({
  create: (state) => tableDecorations(state),
  update: (decos, tr) => (tr.docChanged ? tableDecorations(tr.state) : decos),
  provide: (field) => [
    EditorView.decorations.from(field),
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
});

// Puts a new table on its own lines below the cursor's line, with blank lines
// around it (so markdown apps see it as a table), then puts the cursor in it.
export function insertTable(view, rows = 3, cols = 3) {
  const html = serializeTable(blankTable(rows, cols));
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  const empty = !line.text.trim();
  const at = empty ? line.from : line.to;
  const before = empty ? (line.number > 1 && state.doc.line(line.number - 1).text.trim() ? '\n' : '') : '\n\n';
  const nextLine = line.number < state.doc.lines ? state.doc.line(line.number + 1) : null;
  const after = empty ? (nextLine && nextLine.text.trim() ? '\n\n' : '\n') : (nextLine && !nextLine.text.trim() ? '' : '\n');
  const insert = `${before}${html}${after}`;
  view.dispatch({ changes: { from: at, to: empty ? line.to : at, insert }, userEvent: 'input.table' });
  const tableStart = at + before.length;
  requestAnimationFrame(() => {
    const found = [...view.dom.querySelectorAll('.otable')].find((el) => {
      try {
        return view.posAtDOM(el) === tableStart;
      } catch {
        return false;
      }
    });
    const cell = found && found.querySelector('td, th');
    if (cell) {
      cell.focus();
      found.classList.add('is-active');
    }
  });
}
