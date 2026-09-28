// Markdown editor built on CodeMirror 6, with autosave.

import { EditorView, basicSetup } from 'codemirror';
import { Decoration, MatchDecorator, ViewPlugin } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { markdown } from '@codemirror/lang-markdown';

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
});

export class MarkdownEditor {
  constructor({ parent, content, save, onStatus, onOpenLink, onChange }) {
    this.save = save;
    this.onStatus = onStatus;
    this.onChange = onChange || (() => {});
    this.dirty = false;
    this.timer = null;
    this.queue = Promise.resolve(); // saves run one at a time, in order

    this.view = new EditorView({
      parent,
      doc: content,
      extensions: [
        basicSetup,
        markdown(),
        syntaxHighlighting(scrapbookHighlight),
        EditorView.lineWrapping,
        theme,
        wikilinks,
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
          if (update.docChanged) this.markEdited();
        }),
      ],
    });
    this.view.focus();
  }

  get isDirty() {
    return this.dirty;
  }

  getText() {
    return this.view.state.doc.toString();
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
    const text = this.view.state.doc.toString();
    this.onStatus('Saving…');
    try {
      await this.save(text);
      if (!this.dirty) this.onStatus('Saved');
    } catch (err) {
      this.dirty = true;
      this.onStatus('Save failed');
      throw err;
    }
  }

  destroy() {
    clearTimeout(this.timer);
    this.view.destroy();
  }
}
