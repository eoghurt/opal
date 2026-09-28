// The one place that decides which editor or viewer opens which kind of file.
// File kinds come from file-types.json; to support a new type, add it there
// and add its editor/viewer class here.
//
// Every class follows the same shape:
//   new Editor({ parent, filePath, url, content, save, onStatus, onOpenLink, onChange })
//     parent      element to draw into
//     filePath    the file's path in the vault
//     url         where viewers load the file from (opal-file://…)
//     content     text editors only: the file's text as read from disk
//     save(text)  text editors only: writes text back to the file (returns a promise)
//     onStatus(s) reports 'Edited' / 'Saving…' / 'Saved' / 'Save failed'
//     onOpenLink(name) asks the app to open a linked note
//     onChange()  called whenever the content changes
//   editor.isDirty    true when there is typing not yet saved
//   editor.getText()  the current content as text ('' for viewers)
//   editor.goToLine(n) optional: jump to a line (used by the outline)
//   editor.saveToken, editor.reloadFromDisk(text, token)  optional: pick up
//                     changes made by other apps without losing any typing
//   editor.reload(url) optional (viewers): redraw after the file changed on disk
//   editor.flush()    saves any unsaved changes now; rejects if saving fails
//   editor.destroy()  removes the editor from the page
//
// A class with `static editsText = true` gets the file's text as `content`.

import { MarkdownEditor } from './editors/markdown-editor.js';
import { ImageViewer, AudioViewer, VideoViewer } from './viewers/simple-viewers.js';
import { PdfViewer } from './viewers/pdf-viewer.js';
import { DocxViewer, SheetViewer, SlidesViewer } from './viewers/office-viewers.js';
import { kindOf } from './file-types.js';

const EDITORS_BY_KIND = {
  note: MarkdownEditor,
  pdf: PdfViewer,
  image: ImageViewer,
  audio: AudioViewer,
  video: VideoViewer,
  document: DocxViewer,
  spreadsheet: SheetViewer,
  presentation: SlidesViewer,
};

export function editorForFile(filePath) {
  return EDITORS_BY_KIND[kindOf(filePath)] || null;
}
