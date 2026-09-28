// Folder home: the page you see when you open a folder (or the vault itself).
// Big title, the folder's subfolders as coloured folder tiles, and its notes
// as scrapbook cards.

import { h, scribbleArrow } from '../ui.js';
import { slotFor } from '../palettes.js';
import { noteName, relativeDay, shortDate, pad2 } from '../format.js';
import { countNotes, latestModified } from '../tree.js';

// Four card looks, picked per note so the page feels hand-assembled but stays
// the same every time you open it.
const CARD_LOOKS = ['taped', 'block', 'lined', 'tilted'];

export function renderFolderHome(container, { folder, isRoot, notice, getPreviews, onOpenFile, onOpenFolder, onNewNote, onNewFolder }) {
  const subfolders = folder.children.filter((n) => n.type === 'folder');
  const files = folder.children
    .filter((n) => n.type === 'file')
    .sort((a, b) => (b.modified || 0) - (a.modified || 0));
  const total = countNotes(folder);

  // A note with the same name as its folder (like School/School.md) is the
  // folder's own note: its first line becomes the description.
  const folderNote = files.find((f) => noteName(f.path).toLowerCase() === folder.name.toLowerCase());
  const description = h('p', { class: 'home-desc' },
    folderNote ? '' : `Tip: a note named “${folder.name || 'Home'}” in here becomes this line.`);
  if (!folderNote) description.classList.add('is-tip');

  const meta = [
    isRoot ? 'Vault' : 'Folder',
    `${subfolders.length} ${subfolders.length === 1 ? 'folder' : 'folders'}`,
    `${files.length} ${files.length === 1 ? 'note' : 'notes'} here`,
  ].join(' · ');

  const head = h('section', { class: 'home-head' },
    h('div', { class: 'home-title' },
      h('span', { class: 'mono-label' }, meta),
      h('h1', { class: 'display home-h1' }, `${folder.name}.`),
      description),
    h('div', { class: 'home-stamp-cell', 'aria-hidden': 'true' },
      h('div', { class: 'home-stamp' },
        h('span', null, 'Notes'),
        h('span', { class: 'home-stamp-num' }, String(total)),
        h('span', null, 'in here'))),
    h('div', { class: 'home-actions' },
      h('button', { class: 'home-action is-primary', onclick: onNewNote }, '+ Note'),
      h('button', { class: 'home-action', onclick: onNewFolder }, '+ Folder')),
  );

  const sections = [head];
  if (notice) sections.unshift(h('div', { class: 'home-notice' }, notice));

  if (subfolders.length) {
    sections.push(h('section', { class: 'home-folders', 'aria-label': `Folders in ${folder.name}` },
      subfolders.map((sub) => folderTile(sub, onOpenFolder))));
  }

  const previewSlots = new Map();
  if (files.length) {
    sections.push(h('section', { class: 'home-cards', 'aria-label': `Notes in ${folder.name}` },
      files.map((file) => {
        const preview = h('span', { class: 'card-preview' });
        previewSlots.set(file.path, preview);
        return noteCard(file, preview, onOpenFile);
      })));
  } else {
    sections.push(h('section', { class: 'home-empty' },
      h('p', { class: 'hand home-empty-text' }, subfolders.length ? 'no loose notes in here' : 'nothing here yet — start a note!'),
      scribbleArrow({ width: 120, height: 80, d: 'M10 70 C 40 60, 80 40, 104 10', head: 'M92 12 L105 9 L104 23' })));
  }

  const scrollTop = container.scrollTop;
  container.replaceChildren(h('div', { class: 'home' }, sections));
  container.scrollTop = scrollTop;

  // Fill in previews once they arrive (the page is usable before then).
  const wanted = [...previewSlots.keys()];
  if (folderNote && !wanted.includes(folderNote.path)) wanted.push(folderNote.path);
  if (wanted.length) {
    getPreviews(wanted).then((previews) => {
      for (const [p, el] of previewSlots) el.textContent = previews[p] || '';
      if (folderNote) {
        const first = (previews[folderNote.path] || '').split(/(?<=[.!?])\s/)[0];
        description.textContent = first || `${folder.name} has a folder note — write a line in it.`;
      }
    }).catch(() => {});
  }
}

function folderTile(folder, onOpenFolder) {
  const slot = slotFor(folder.path);
  const latest = latestModified(folder);
  return h('button', { class: 'folder-tile', onclick: () => onOpenFolder(folder.path) },
    h('span', { class: 'folder-sheet sheet-a', 'aria-hidden': 'true' }),
    h('span', { class: 'folder-sheet sheet-b', 'aria-hidden': 'true' }),
    h('span', { class: 'folder-tab', style: `background: var(--c${slot})` }),
    h('span', { class: 'folder-body', style: `background: var(--c${slot})` },
      h('span', { class: 'display folder-name' }, folder.name),
      h('span', { class: 'folder-foot' },
        h('span', { class: 'serif-i' }, latest ? `edited ${relativeDay(latest)}` : 'empty'),
        h('span', { class: 'folder-count' }, pad2(countNotes(folder))))));
}

function noteCard(file, preview, onOpenFile) {
  const slot = slotFor(file.path);
  const look = CARD_LOOKS[slot % CARD_LOOKS.length];
  const card = h('button', {
    class: `note-card look-${look}`,
    style: look === 'block' ? `background: var(--c${slot})` : null,
    onclick: () => onOpenFile(file.path),
  },
  look === 'taped' ? h('span', { class: 'tape', style: `background: var(--c${slot})`, 'aria-hidden': 'true' }) : null,
  h('span', { class: 'card-label mono-label' }, h('span', null, 'Note'), h('span', null, file.modified ? shortDate(file.modified) : '')),
  h('span', { class: 'display card-title' }, noteName(file.path)),
  preview,
  h('span', { class: 'serif-i card-foot' }, file.modified ? `edited ${relativeDay(file.modified)}` : ''));
  return h('div', { class: 'card-cell' }, card);
}

