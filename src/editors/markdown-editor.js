// Markdown editor built on CodeMirror 6, with autosave.

import { EditorView, basicSetup } from 'codemirror';
import { Decoration, MatchDecorator, ViewPlugin } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';

const SAVE_DELAY_MS = 500;
const RETRY_DELAY_MS = 3000;

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

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '15px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.6' },
  '.cm-content': { maxWidth: '760px', margin: '0 auto', padding: '24px 32px 40vh' },
  '.cm-gutters': { display: 'none' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-wikilink': { color: '#7c5cff', textDecoration: 'underline', textUnderlineOffset: '3px' },
  '&.cmd-held .cm-wikilink': { cursor: 'pointer' },
});

export class MarkdownEditor {
  constructor({ parent, content, save, onStatus, onOpenLink }) {
    this.save = save;
    this.onStatus = onStatus;
    this.dirty = false;
    this.timer = null;
    this.queue = Promise.resolve(); // saves run one at a time, in order

    this.view = new EditorView({
      parent,
      doc: content,
      extensions: [
        basicSetup,
        markdown(),
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

  markEdited() {
    this.dirty = true;
    this.onStatus('Edited');
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
