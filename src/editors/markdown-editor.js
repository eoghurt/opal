// Markdown editor built on CodeMirror 6, with autosave.

import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';

const SAVE_DELAY_MS = 500;
const RETRY_DELAY_MS = 3000;

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '15px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.6' },
  '.cm-content': { maxWidth: '760px', margin: '0 auto', padding: '24px 32px 40vh' },
  '.cm-gutters': { display: 'none' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
});

export class MarkdownEditor {
  constructor({ parent, content, save, onStatus }) {
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
