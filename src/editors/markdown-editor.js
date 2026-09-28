// Markdown editor built on CodeMirror 6, with autosave.

import { EditorView, basicSetup } from 'codemirror';
import { Annotation, EditorState, StateField, Transaction } from '@codemirror/state';
import { Decoration, MatchDecorator, ViewPlugin } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { Prec } from '@codemirror/state';
import { livePreview, formatBar, formatKeymap } from './markdown-live.js';
import { parseStickies, writeStickies, stickyBlockRange } from '../../shared/stickies.js';
import { frontmatterRange } from '../../shared/frontmatter.js';

// Marks changes that came from the file on disk, not from typing.
const fromDisk = Annotation.define();

const SAVE_DELAY_MS = 500;
const RETRY_DELAY_MS = 3000;

const DISPLAY = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif';
const SERIF = '"Instrument Serif", Georgia, serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';

// Styles [[Note name]] as a link and remembers its target on the element.
const wikilinkMatcher = new MatchDecorator({
  regexp: /\[\[([^\[\]\n]+?)\]\]/g,
  decoration: (match) =>
    Decoration.mark({
      class: 'cm-wikilink',
      attributes: { 'data-target': match[1], title: 'Cmd-click to open' },
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
  { tag: tags.heading1, fontFamily: DISPLAY, fontSize: '2.5em', fontWeight: '800', letterSpacing: '-0.04em', lineHeight: '1.1' },
  { tag: tags.heading2, fontFamily: DISPLAY, fontSize: '1.65em', fontWeight: '800', letterSpacing: '-0.03em' },
  { tag: tags.heading3, fontFamily: DISPLAY, fontSize: '1.3em', fontWeight: '800', letterSpacing: '-0.02em' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontFamily: DISPLAY, fontWeight: '800' },
  { tag: tags.emphasis, fontFamily: SERIF, fontStyle: 'italic', fontSize: '1.12em' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.quote, fontFamily: SERIF, fontStyle: 'italic', fontSize: '1.12em' },
  { tag: tags.link, textDecoration: 'underline' },
  { tag: tags.url, color: '#6E685C' },
  { tag: tags.monospace, fontFamily: MONO, fontSize: '0.88em', backgroundColor: 'rgba(22, 20, 15, 0.06)' },
  { tag: [tags.processingInstruction, tags.contentSeparator], color: '#A39D90' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '15.5px', backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif', lineHeight: '1.65' },
  '.cm-content': { maxWidth: '680px', padding: '12px 44px 40vh', caretColor: '#16140F' },
  '.cm-cursor': { borderLeftColor: '#16140F', borderLeftWidth: '2px' },
  '.cm-gutters': { display: 'none' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(22, 20, 15, 0.14) !important' },
  '.cm-wikilink': { backgroundColor: 'var(--c2)', borderBottom: '1.5px solid #16140F', padding: '0 2px' },
  '&.cmd-held .cm-wikilink': { cursor: 'pointer' },
  '.cm-highlight': { backgroundColor: 'var(--c2)', padding: '0 1px' },
  '.cm-underline': { textDecoration: 'underline', textUnderlineOffset: '3px' },
  '.cm-faint-mark': { color: '#A39D90' },
  // Find & replace bar (Cmd+F)
  '.cm-panels': { backgroundColor: 'var(--paper)', color: '#16140F', fontFamily: MONO, fontSize: '11px' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1.5px solid #16140F' },
  '.cm-panels.cm-panels-top': { borderBottom: '1.5px solid #16140F' },
  '.cm-search': { padding: '8px 12px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' },
  '.cm-search input.cm-textfield': { fontFamily: DISPLAY, fontSize: '14px', padding: '4px 8px', border: '1.5px solid #16140F', borderRadius: '2px', backgroundColor: '#FFFFFF' },
  '.cm-search .cm-button': { backgroundImage: 'none', backgroundColor: '#FFFFFF', border: '1.5px solid #16140F', borderRadius: '2px', padding: '3px 8px', fontFamily: MONO, fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.06em' },
  '.cm-search .cm-button:hover': { backgroundColor: 'var(--c2)' },
  '.cm-search label': { display: 'inline-flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' },
  '.cm-search button[name=close]': { fontSize: '18px', marginLeft: 'auto' },
  '.cm-searchMatch': { backgroundColor: 'rgba(255, 210, 63, 0.45)', outline: '1px solid rgba(22, 20, 15, 0.4)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--c2)' },
});

export class MarkdownEditor {
  static editsText = true;

  constructor({ parent, content, save, onStatus, onOpenLink, onChange }) {
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
        basicSetup,
        windowsLines ? EditorState.lineSeparator.of('\r\n') : [],
        markdown({ base: markdownLanguage }),
        livePreview,
        formatBar,
        syntaxHighlighting(scrapbookHighlight),
        EditorView.lineWrapping,
        theme,
        wikilinks,
        hiddenStickies,
        EditorView.domEventHandlers({
          // Cmd-click a [[link]] to open it; a plain click just places the cursor.
          mousedown: (event) => {
            if (!event.metaKey || event.button !== 0) return false;
            const link = event.target.closest('.cm-wikilink');
            if (!link) return false;
            event.preventDefault();
            onOpenLink(link.dataset.target);
            return true;
          },
          // Show a pointer over links while Cmd is held.
          keydown: (event, view) => { view.dom.classList.toggle('cmd-held', event.metaKey); },
          keyup: (event, view) => { view.dom.classList.toggle('cmd-held', event.metaKey); },
          blur: (_event, view) => { view.dom.classList.remove('cmd-held'); },
        }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          if (update.transactions.some((tr) => tr.annotation(fromDisk))) this.onChange();
          else this.markEdited();
        }),
      ],
    });
    this.view.focus();
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

  // Moves the cursor to the start of a line (1-based) and scrolls to it.
  goToLine(lineNumber) {
    const doc = this.view.state.doc;
    const line = doc.line(Math.min(Math.max(1, lineNumber), doc.lines));
    this.view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
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
