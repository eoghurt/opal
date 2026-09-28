// The one place that decides which editor opens which kind of file.
// To support a new note type, write an editor class and add its extension here.
//
// Every editor class follows the same shape:
//   new Editor({ parent, content, save, onStatus, onOpenLink })
//     parent      element to draw into
//     content     the file's text as read from disk
//     save(text)  writes text back to the file (returns a promise)
//     onStatus(s) reports 'Edited' / 'Saving…' / 'Saved' / 'Save failed'
//     onOpenLink(name) asks the app to open a linked note
//     onChange()  called whenever the content changes
//   editor.isDirty    true when there is typing not yet saved
//   editor.getText()  the current content as text
//   editor.goToLine(n) optional: jump to a line (used by the outline)
//   editor.saveToken, editor.reloadFromDisk(text, token)  optional: pick up
//                     changes made by other apps without losing any typing
//   editor.flush()    saves any unsaved changes now; rejects if saving fails
//   editor.destroy()  removes the editor from the page

import { MarkdownEditor } from './editors/markdown-editor.js';

const EDITORS_BY_EXTENSION = {
  '.md': MarkdownEditor,
};

export function editorForFile(filePath) {
  const match = /\.[^./]+$/.exec(filePath);
  return (match && EDITORS_BY_EXTENSION[match[0].toLowerCase()]) || null;
}
