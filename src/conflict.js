// When another app (Obsidian, sync, a text editor) changed a note while it had
// unsaved typing here, Opal still saves your version — but main first puts the
// other app's version in the note's version history. This shows the notice
// that says so, with what you can do about it:
//
//   Compare      both versions side by side, differences marked
//   Keep mine    nothing to do (yours is saved; theirs stays in history)
//   Keep theirs  the other app's version goes back in (yours goes to history)
//   Merge        both sets of changes together, line by line, from the version
//                both started from; where both changed the same lines, both
//                are kept, marked <<<<<<< Opal / ======= / >>>>>>> Other app
//
//   showConflict({ filePath, mine, theirs, base, editor, name })

import { h } from './ui.js';
import { showToast } from './toast.js';
import { diffLines } from './diff.js';
import { merge3 } from './merge.js';

export function showConflict({ filePath, mine, theirs, base, editor, name, saveSnapshot }) {
  // Only acts while the same note is still open in the same editor.
  const live = () => {
    const dom = editor && (editor.view ? editor.view.dom : editor.root || editor.el);
    return !!(dom && dom.isConnected);
  };
  const replace = async (text, note) => {
    if (!live()) {
      showToast(`“${name}” isn't open any more.`, { detail: 'Both versions are in its History.' });
      return;
    }
    await saveSnapshot(filePath, editor.getText(), 'before-merge').catch(() => {});
    editor.replaceText(text);
    editor.markEdited(); // saves it like typing
    if (note) showToast(note, { kind: 'info' });
  };
  showToast(`“${name}” was also changed in another app.`, {
    detail: 'Your version is saved; the other one is in its History.',
    kind: 'info',
    actions: [
      { label: 'Compare', keepOpen: true, run: () => openCompare({ name, mine: live() ? editor.getText() : mine, theirs }) },
      { label: 'Keep mine', run: () => {} },
      { label: 'Keep theirs', run: () => replace(theirs, 'The other app’s version is back. Yours is in History.') },
      {
        label: 'Merge',
        primary: true,
        run: () => {
          const { text, conflicts } = merge3(base, live() ? editor.getText() : mine, theirs);
          return replace(text, conflicts
            ? `Merged. ${conflicts} ${conflicts === 1 ? 'place was' : 'places were'} changed on both sides — look for <<<<<<< Opal and keep what you want.`
            : 'Merged: both sets of changes are in.');
        },
      },
    ],
  });
}

// Both versions side by side: lines only in yours on the left, only in theirs on the right.
function openCompare({ name, mine, theirs }) {
  const rows = diffLines(theirs, mine);
  const left = [];
  const right = [];
  for (const r of rows) {
    if (r.kind === 'same') {
      left.push(h('div', { class: 'cmp-line' }, r.text || ' '));
      right.push(h('div', { class: 'cmp-line' }, r.text || ' '));
    } else if (r.kind === 'added') {
      left.push(h('div', { class: 'cmp-line is-mine' }, r.text || ' '));
    } else {
      right.push(h('div', { class: 'cmp-line is-theirs' }, r.text || ' '));
    }
  }
  const close = () => box.remove();
  const box = h('div', { class: 'cmp-backdrop', onclick: (e) => { if (e.target === box) close(); } },
    h('div', { class: 'cmp', role: 'dialog', 'aria-label': `Compare versions of ${name}` },
      h('div', { class: 'cmp-head' },
        h('b', null, `Compare “${name}”`),
        h('button', { type: 'button', class: 'toast-close', 'aria-label': 'Close', onclick: close }, '×')),
      h('div', { class: 'cmp-cols' },
        h('div', { class: 'cmp-col' }, h('div', { class: 'cmp-label' }, 'Yours (in Opal)'), ...left),
        h('div', { class: 'cmp-col' }, h('div', { class: 'cmp-label' }, 'The other app’s'), ...right))));
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.body.append(box);
  box.tabIndex = -1;
  box.focus();
}
