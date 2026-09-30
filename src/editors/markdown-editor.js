// Markdown editor built on CodeMirror 6, with autosave.

import { EditorView } from 'codemirror';
import { highlightSpecialChars, highlightActiveLine, dropCursor, keymap as viewKeymap } from '@codemirror/view';
import { history, historyKeymap, defaultKeymap, indentWithTab, undo, redo } from '@codemirror/commands';
import { indentOnInput, bracketMatching, defaultHighlightStyle } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { searchKeymap } from '@codemirror/search';
import { Annotation, EditorState, StateField, Transaction } from '@codemirror/state';
import { Decoration, MatchDecorator, ViewPlugin } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { Prec } from '@codemirror/state';
import { livePreview, formatBar, formatKeymap } from './markdown-live.js';
import { parseStickies, writeStickies, stickyBlockRange } from '../../shared/stickies.js';
import { frontmatterRange } from '../../shared/frontmatter.js';
import { tableBlocks, insertTable } from '../tables/table-widget.js';
import { trackerBlocks } from '../heatmap.js';
import { linkPreview, wikilinkCompletions } from './markdown-links.js';
import { keymap } from '@codemirror/view';

// Marks changes that came from the file on disk, not from typing.
const fromDisk = Annotation.define();

const SAVE_DELAY_MS = 500;
const RETRY_DELAY_MS = 3000;

const DISPLAY = 'var(--display)';
const SERIF = 'var(--ed-serif, var(--serif))';
const MONO = 'var(--mono)';

// Styles [[Note name]] as a link and remembers its target on the element.
const wikilinkMatcher = new MatchDecorator({
  regexp: /\[\[([^\[\]\n]+?)\]\]/g,
  decoration: (match) =>
    Decoration.mark({
      class: 'cm-wikilink',
      attributes: { 'data-target': match[1], title: 'Click to open' },
    }),
});

const wikilinks = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = wikilinkMatcher.createDeco(view);
    }
    update(update) {
      this.decorations = wikilinkMatcher.updateDeco(update, this.decorations);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

// The sticky-notes block (see shared/stickies.js) is kept in the file but
// hidden from the editor, and the cursor skips over it.
const hiddenStickies = StateField.define({
  create: (state) => stickyDecorations(state),
  update: (decos, tr) => (tr.docChanged ? stickyDecorations(tr.state) : decos),
  provide: (field) => [
    EditorView.decorations.from(field),
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
});

// Also hides a properties block that only holds Opal's settings (like colour).
function stickyDecorations(state) {
  const text = state.doc.toString();
  const hidden = [];
  const props = frontmatterRange(text);
  if (props && props.onlyOpal) {
    const to = state.doc.lineAt(Math.max(0, props.to - 1)).to;
    hidden.push(Decoration.replace({ block: true }).range(0, to));
  }
  const range = stickyBlockRange(text);
  if (range) {
    hidden.push(Decoration.replace({ block: true }).range(state.doc.lineAt(range.from).from, state.doc.lineAt(range.to).to));
  }
  return hidden.length ? Decoration.set(hidden, true) : Decoration.none;
}

// Scrapbook type: SF Pro bold headings, serif italics, mono code, faint markup symbols.
const scrapbookHighlight = HighlightStyle.define([
  // Sizes, weights and faces come from the theme (see themes.css); the
  // fallbacks are the Scrapbook look.
  { tag: tags.heading1, fontFamily: DISPLAY, fontSize: 'var(--ed-h1, 2.5em)', fontWeight: 'var(--ed-h-weight, 800)', letterSpacing: 'var(--ed-h1-track, -0.04em)', lineHeight: '1.1' },
  { tag: tags.heading2, fontFamily: DISPLAY, fontSize: 'var(--ed-h2, 1.65em)', fontWeight: 'var(--ed-h-weight, 800)', letterSpacing: 'var(--ed-h2-track, -0.03em)' },
  { tag: tags.heading3, fontFamily: DISPLAY, fontSize: 'var(--ed-h3, 1.3em)', fontWeight: 'var(--ed-h-weight, 800)', letterSpacing: 'var(--ed-h3-track, -0.02em)' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontFamily: DISPLAY, fontWeight: 'var(--ed-h-weight, 800)' },
  { tag: tags.emphasis, fontFamily: SERIF, fontStyle: 'italic', fontSize: 'var(--ed-serif-size, 1.12em)' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.quote, fontFamily: SERIF, fontStyle: 'italic', fontSize: 'var(--ed-serif-size, 1.12em)', color: 'var(--ed-quote, inherit)' },
  { tag: tags.link, color: 'var(--link)' },
  { tag: tags.url, color: 'var(--ink-3)' },
  { tag: tags.monospace, fontFamily: MONO, fontSize: '0.88em', backgroundColor: 'rgb(var(--ink-rgb) / 0.06)' },
  { tag: [tags.processingInstruction, tags.contentSeparator], color: 'var(--ink-4)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '15.5px', backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--sans)', lineHeight: '1.65' },
  // The text fills the note's width, growing and shrinking as side panels open and close.
  '.cm-content': { maxWidth: 'none', padding: '12px 44px 40vh', caretColor: 'var(--ink)' },
  '.cm-cursor': { borderLeftColor: 'var(--ink)', borderLeftWidth: '2px' },
  '.cm-gutters': { display: 'none' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'rgb(var(--ink-rgb) / 0.14) !important' },
  // Links are just coloured text (underlined while the pointer is on them).
  '.cm-wikilink': { color: 'var(--link)' },
  '.cm-wikilink:hover': { textDecoration: 'underline', textUnderlineOffset: '3px' },
  '&.cmd-held .cm-wikilink': { cursor: 'pointer' },
  '.cm-highlight': { backgroundColor: 'var(--c2)', padding: '0 1px' },
  '.cm-underline': { textDecoration: 'underline', textUnderlineOffset: '3px' },
  '.cm-faint-mark': { color: 'var(--ink-4)' },
  // Find & replace bar (Cmd+F)
  '.cm-panels': { backgroundColor: 'var(--paper)', color: 'var(--ink)', fontFamily: MONO, fontSize: '11px' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1.5px solid var(--ink)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1.5px solid var(--ink)' },
  '.cm-search': { padding: '8px 12px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' },
  '.cm-search input.cm-textfield': { fontFamily: DISPLAY, fontSize: '14px', padding: '4px 8px', border: '1.5px solid var(--ink)', borderRadius: '2px', backgroundColor: 'var(--white)' },
  '.cm-search .cm-button': { backgroundImage: 'none', backgroundColor: 'var(--white)', border: '1.5px solid var(--ink)', borderRadius: '2px', padding: '3px 8px', fontFamily: MONO, fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.06em' },
  '.cm-search .cm-button:hover': { backgroundColor: 'var(--c2)' },
  '.cm-search label': { display: 'inline-flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' },
  '.cm-search button[name=close]': { fontSize: '18px', marginLeft: 'auto' },
  '.cm-searchMatch': { backgroundColor: 'rgba(255, 210, 63, 0.45)', outline: '1px solid rgb(var(--ink-rgb) / 0.4)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--c2)' },
});

export class MarkdownEditor {
  static editsText = true;

  // onOpenHref(address) opens a [text](address) link; linkTargets() lists notes
  // and files for [[ suggestions; findLink(name) finds a file without creating it.
  constructor({ parent, content, save, onStatus, onOpenLink, onOpenHref, onChange, onCursor, linkTargets, findLink, saveImage, heatmap }) {
    this.saveImage = saveImage;
    this.linkTargets = linkTargets || (() => []);
    this.save = save;
    this.onStatus = onStatus;
    this.onChange = onChange || (() => {});
    this.dirty = false;
    this.saving = false;
    this.saveCount = 0; // goes up after every save; see reloadFromDisk
    this.timer = null;
    this.queue = Promise.resolve(); // saves run one at a time, in order

    // Keep Windows-style line endings if the whole file uses them, so saving
    // doesn't rewrite every line.
    const windowsLines = /\r\n/.test(content) && !/(^|[^\r])\n/.test(content);

    this.view = new EditorView({
      parent,
      doc: content,
      extensions: [
        Prec.high(formatKeymap),
        Prec.high(keymap.of([
          { key: 'Mod-Alt-t', run: (view) => { insertTable(view, 3, 3); return true; } },
          // Ctrl+Z / Ctrl+Y as well as ⌘Z / ⌘⇧Z, and ⌘Y for redo.
          { key: 'Ctrl-z', run: undo, preventDefault: true },
          { key: 'Ctrl-y', run: redo, preventDefault: true },
          { key: 'Ctrl-Shift-z', run: redo, preventDefault: true },
          { key: 'Mod-y', run: redo, preventDefault: true },
        ])),
        // CodeMirror's usual setup, minus the parts that don't suit writing:
        // no line numbers or folding, and the Mac's own text selection (it
        // highlights only the text) instead of CodeMirror's drawn blocks.
        highlightSpecialChars(),
        highlightActiveLine(),
        history(),
        dropCursor(),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        autocompletion({ override: [wikilinkCompletions(() => this.linkTargets())], icons: false }),
        viewKeymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...completionKeymap, indentWithTab]),
        windowsLines ? EditorState.lineSeparator.of('\r\n') : [],
        markdown({ base: markdownLanguage }),
        livePreview,
        formatBar,
        syntaxHighlighting(scrapbookHighlight),
        EditorView.lineWrapping,
        theme,
        wikilinks,
        linkPreview(findLink || (async () => null)),
        hiddenStickies,
        tableBlocks,
        heatmap ? trackerBlocks(heatmap) : [],
        EditorView.domEventHandlers({
          // Click a link to open it. While you're editing a link (its brackets
          // are showing) a click just moves the cursor; Cmd-click always opens.
          mousedown: (event) => {
            if (event.button !== 0 || event.shiftKey || event.altKey || event.ctrlKey) return false;
            const link = event.target.closest('.cm-wikilink, .cm-mdlink');
            if (!link) return false;
            const editing = link.classList.contains('cm-wikilink') && link.textContent.startsWith('[[');
            if (editing && !event.metaKey) return false;
            event.preventDefault();
            if (link.classList.contains('cm-wikilink')) onOpenLink(link.dataset.target);
            else if (onOpenHref) onOpenHref(link.dataset.href);
            return true;
          },
          // Pictures pasted or dropped in are copied into Attachments and
          // linked where they land, as ![[file name]].
          paste: (event, view) => this.takePictures(view, event.clipboardData && event.clipboardData.files, null, event),
          drop: (event, view) => {
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            return this.takePictures(view, event.dataTransfer && event.dataTransfer.files, pos, event);
          },
          // Show a pointer over links while Cmd is held.
          keydown: (event, view) => { view.dom.classList.toggle('cmd-held', event.metaKey); },
          keyup: (event, view) => { view.dom.classList.toggle('cmd-held', event.metaKey); },
          blur: (_event, view) => { view.dom.classList.remove('cmd-held'); },
        }),
        EditorView.updateListener.of((update) => {
          if (onCursor && (update.selectionSet || update.docChanged)) onCursor();
          if (!update.docChanged) return;
          if (update.transactions.some((tr) => tr.annotation(fromDisk))) this.onChange();
          else this.markEdited();
        }),
      ],
    });
    this.view.focus();
  }

  // Handles the picture files among `files`; returns true if there were any.
  takePictures(view, files, pos, event) {
    const pictures = [...(files || [])].filter((f) => /^image\//.test(f.type));
    if (!pictures.length || !this.saveImage) return false;
    event.preventDefault();
    const at = pos ?? view.state.selection.main.head;
    (async () => {
      const links = [];
      for (const file of pictures) {
        try {
          const ext = (file.name.match(/\.([a-z0-9]+)$/i) || [])[1] || file.type.split('/')[1] || 'png';
          links.push(`![[${await this.saveImage(ext.replace('jpeg', 'jpg').replace('svg+xml', 'svg'), await file.arrayBuffer())}]]`);
        } catch (err) {
          alert(`Couldn't add that picture.\n\n${err.message}`);
        }
      }
      if (!links.length) return;
      const insert = links.join('\n');
      const from = Math.min(at, view.state.doc.length);
      const sel = view.state.selection.main;
      const replace = pos == null && !sel.empty ? { from: sel.from, to: sel.to } : { from, to: from };
      view.dispatch({ changes: { ...replace, insert }, selection: { anchor: replace.from + insert.length }, userEvent: 'input.paste' });
      view.focus();
    })();
    return true;
  }

  get isDirty() {
    return this.dirty;
  }

  getText() {
    return this.view.state.sliceDoc();
  }

  // A token to pass to reloadFromDisk: read it just before reading the file.
  get saveToken() {
    return this.saveCount;
  }

  // Another app changed the file: show its version, but only when nothing is
  // being typed or saved here (and no save happened since the file was read),
  // so neither side's changes are lost. Only the changed part is replaced, so
  // the cursor and scroll position stay put. Returns true if it reloaded.
  reloadFromDisk(diskText, token) {
    if (this.dirty || this.saving || token !== this.saveCount) return false;
    // Not undoable: Cmd+Z must never undo someone else's edit.
    return this.replaceText(diskText, [fromDisk.of(true), Transaction.addToHistory.of(false)]);
  }

  // Swaps the text for `next`, changing only the part that differs, so the
  // cursor and scroll position stay put. Returns true if anything changed.
  replaceText(next, annotations = []) {
    const current = this.getText();
    if (next === current) return false;
    let start = 0;
    while (start < current.length && start < next.length && current[start] === next[start]) start++;
    let endCur = current.length;
    let endNext = next.length;
    while (endCur > start && endNext > start && current[endCur - 1] === next[endNext - 1]) {
      endCur--;
      endNext--;
    }
    const state = this.view.state;
    // Positions in the editor count line breaks as one character.
    const toPos = (offset) => state.toText(current.slice(0, offset)).length;
    this.view.dispatch({
      changes: { from: toPos(start), to: toPos(endCur), insert: next.slice(start, endNext) },
      annotations,
    });
    return true;
  }

  // Sticky notes stored in this note (see shared/stickies.js).
  getStickies() {
    return parseStickies(this.getText());
  }

  // Saves stickies into the note like any other edit (autosaved, undoable).
  setStickies(list) {
    this.replaceText(writeStickies(this.getText(), list));
  }

  // Jumps to a heading by its text (for [[Note#Heading]] links). True if found.
  goToHeading(heading) {
    const wanted = heading.trim().toLowerCase();
    const doc = this.view.state.doc;
    for (let i = 1; i <= doc.lines; i++) {
      const m = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(doc.line(i).text);
      if (m && m[1].toLowerCase() === wanted) {
        this.goToLine(i);
        return true;
      }
    }
    return false;
  }

  // A new rows × cols table below the cursor's line (see tables/).
  insertTable(rows, cols) {
    insertTable(this.view, rows, cols);
  }

  // Moves the cursor to the start of a line (1-based) and scrolls to it.
  // Moves to a line (1-based); with a column and length, selects that text.
  goToLine(lineNumber, column = 0, length = 0) {
    const doc = this.view.state.doc;
    const line = doc.line(Math.min(Math.max(1, lineNumber), doc.lines));
    const from = Math.min(line.from + column, line.to);
    const to = Math.min(from + length, line.to);
    this.view.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y: 'center' }) });
    this.view.focus();
  }

  markEdited() {
    this.dirty = true;
    this.onStatus('Edited');
    this.onChange();
    this.scheduleSave(SAVE_DELAY_MS);
  }

  scheduleSave(delay) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.flush().catch(() => this.scheduleSave(RETRY_DELAY_MS));
    }, delay);
  }

  // Saves now. Resolves once everything typed so far is on disk.
  flush() {
    clearTimeout(this.timer);
    const run = this.queue.then(() => this.writeIfDirty());
    this.queue = run.catch(() => {});
    return run;
  }

  async writeIfDirty() {
    if (!this.dirty) return;
    this.dirty = false;
    this.saving = true;
    const text = this.getText();
    this.onStatus('Saving…');
    try {
      await this.save(text);
      this.saveCount++;
      if (!this.dirty) this.onStatus('Saved');
    } catch (err) {
      this.dirty = true;
      this.onStatus('Save failed');
      throw err;
    } finally {
      this.saving = false;
    }
  }

  destroy() {
    clearTimeout(this.timer);
    this.view.destroy();
  }
}
