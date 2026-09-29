// Folder home: the page you see when you open a folder (or the vault itself).
// Big title, the folder's subfolders as coloured folder tiles, and its notes
// as scrapbook cards.

import { h, scribbleArrow } from '../ui.js';
import { progressBar } from './note-view.js';
import { slotFor } from '../palettes.js';
import { colorOf } from '../item-colors.js';
import { noteName, relativeDay, shortDate, pad2 } from '../format.js';
import { countNotes, latestModified, recentFiles } from '../tree.js';
import { kindOf, kindLabel, fileUrl, extensionOf, formatSize } from '../file-types.js';

// Four card looks, picked per note so the page feels hand-assembled but stays
// the same every time you open it.
const CARD_LOOKS = ['taped', 'block', 'lined', 'tilted'];

export function renderFolderHome(container, { folder, isRoot, notice, getPreviews, onOpenFile, onOpenFolder, onNewNote, onNewFolder, onAddSticky, onColorMenu, onRearrange, onCreateHere, onRename, onDescribe, describeNow, loadDescription, loadWords, loadWordTarget, loadDatabase, mountDatabase }) {
  const subfolders = folder.children.filter((n) => n.type === 'folder');
  const allFiles = folder.children.filter((n) => n.type === 'file');
  const files = allFiles
    .filter((n) => !n.quiet)
    .sort((a, b) => (b.modified || 0) - (a.modified || 0));
  const total = countNotes(folder);

  // A note with the same name as its folder (like School/School.md) is the
  // folder's own note. The line under the title is its `description`
  // property (or, for older folder notes, the note's first sentence).
  const folderNoteFile = allFiles.find((f) => noteName(f.path).toLowerCase() === folder.name.toLowerCase());
  const folderNote = folderNoteFile && !folderNoteFile.quiet ? folderNoteFile : null;
  let savedDescription = folder.description || (folderNoteFile && folderNoteFile.description) || '';
  const description = editableLine({
    className: 'home-desc',
    label: `Description of ${folder.name}`,
    value: savedDescription,
    onSave: (text) => onDescribe(text),
  });
  const noteCount = files.filter((f) => kindOf(f.path) === 'note').length;
  const otherCount = files.length - noteCount;
  const meta = [
    isRoot ? 'Vault' : 'Folder',
    `${subfolders.length} ${subfolders.length === 1 ? 'folder' : 'folders'}`,
    `${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`,
    otherCount ? `${otherCount} ${otherCount === 1 ? 'file' : 'files'}` : null,
  ].filter(Boolean).join(' · ') + ' here';

  // Words in the folder (counted in the background) and its word target.
  const metaLabel = h('span', { class: 'mono-label' }, meta);
  const targetSlot = h('div', { class: 'home-target' });
  if (loadWords) {
    Promise.all([loadWords(), loadWordTarget ? loadWordTarget() : null]).then(([words, target]) => {
      metaLabel.textContent = `${meta} · ${words.toLocaleString()} word${words === 1 ? '' : 's'}`;
      if (target) targetSlot.replaceChildren(progressBar(words, target));
    }).catch(() => {});
  }
  const head = h('section', { class: 'home-head' },
    h('div', { class: 'home-title' },
      metaLabel,
      editableTitle({
        name: folder.name,
        canRename: !isRoot,
        onRename,
        onEnter: () => description.open(),
      }),
      description.el,
      targetSlot),
    h('div', { class: 'home-stamp-cell', 'aria-hidden': 'true' },
      h('div', { class: 'home-stamp' },
        h('span', null, 'Files'),
        h('span', { class: 'home-stamp-num' }, String(total)),
        h('span', null, 'in here'))),
    h('div', { class: 'home-actions' },
      h('button', { class: 'home-action is-primary', onclick: (e) => onNewNote(e.currentTarget) }, '+ Note'),
      h('button', { class: 'home-action', onclick: (e) => onNewFolder(e.currentTarget) }, '+ Folder'),
      h('button', { class: 'home-action', onclick: onAddSticky }, '+ Sticky')),
  );

  const sections = [head];
  if (notice) sections.unshift(h('div', { class: 'home-notice' }, notice));

  const previewSlots = new Map(); // note path → elements waiting for its preview text
  const wantPreview = (path, el) => {
    if (!previewSlots.has(path)) previewSlots.set(path, []);
    previewSlots.get(path).push(el);
  };

  if (subfolders.length) {
    sections.push(h('section', { class: 'home-folders', 'aria-label': `Folders in ${folder.name}` },
      subfolders.map((sub) => arrangeable(folderTile(sub, onOpenFolder, wantPreview, onColorMenu), sub, onRearrange))));
  }

  if (files.length) {
    sections.push(h('section', { class: 'home-cards', 'aria-label': `Notes in ${folder.name}` },
      files.map((file) => {
        const kind = kindOf(file.path);
        let cell;
        if (kind === 'image') cell = photoCard(file, onOpenFile);
        else if (kind !== 'note') cell = fileCard(file, kind, onOpenFile);
        else {
          const preview = h('span', { class: 'card-preview' });
          wantPreview(file.path, preview);
          cell = noteCard(file, preview, onOpenFile);
        }
        cell.addEventListener('contextmenu', (event) => onColorMenu(event, file, 'file'));
        cell.addEventListener('dblclick', (event) => onColorMenu(event, file, 'file'));
        return arrangeable(cell, file, onRearrange);
      })));
  } else {
    sections.push(h('section', { class: 'home-empty' },
      h('p', { class: 'hand home-empty-text' }, subfolders.length ? 'no loose notes in here' : 'nothing here yet — start a note!'),
      scribbleArrow({ width: 120, height: 80, d: 'M10 70 C 40 60, 80 40, 104 10', head: 'M92 12 L105 9 L104 23' })));
  }

  // Shown as a database? Then the database takes the place of the note cards.
  const dbSlot = h('div', { class: 'home-db' });
  dbSlot.hidden = true;
  sections.push(dbSlot);
  if (loadDatabase) {
    loadDatabase().then((db) => {
      if (!db || !db.on || !dbSlot.isConnected) return;
      for (const section of home.querySelectorAll('.home-cards, .home-empty')) section.style.display = 'none';
      dbSlot.hidden = false;
      mountDatabase(dbSlot, db.settings);
    }).catch(() => {});
  }

  const scrollTop = container.scrollTop;
  const home = h('div', { class: 'home' }, sections);
  container.replaceChildren(home);
  container.scrollTop = scrollTop;

  // Right-click or double-click on empty space: make a new note or folder here.
  const onBlank = (event) => {
    if (event.target.closest('button, a, input, textarea, select, [draggable="true"], [contenteditable], .sticky-layer > *')) return;
    event.preventDefault();
    onCreateHere(event);
  };
  home.addEventListener('contextmenu', onBlank);
  home.addEventListener('dblclick', onBlank);

  // Fill in previews once they arrive (the page is usable before then).
  const wanted = [...previewSlots.keys()];
  if (folderNote && !wanted.includes(folderNote.path)) wanted.push(folderNote.path);
  if (wanted.length) {
    getPreviews(wanted).then((previews) => {
      for (const [p, els] of previewSlots) els.forEach((el) => { el.textContent = previews[p] || ''; });
      if (folderNote && !savedDescription) {
        const first = (previews[folderNote.path] || '').split(/(?<=[.!?])\s/)[0];
        if (first) description.show(first);
      }
    }).catch(() => {});
  }
  // The vault's own description isn't in the file list, so it's fetched.
  if (!savedDescription && loadDescription) {
    loadDescription().then((text) => {
      if (text) {
        savedDescription = text;
        description.set(text);
      }
    }).catch(() => {});
  }
  if (describeNow) description.open();
  return home;
}

// The big folder name, editable in place: Enter or clicking away renames,
// Escape puts it back. Enter also opens the description line below.
function editableTitle({ name, canRename, onRename, onEnter }) {
  const text = h('span', {
    class: 'home-h1-text',
    contenteditable: 'plaintext-only',
    spellcheck: 'false',
    role: 'textbox',
    'aria-label': canRename ? `Folder name (edit to rename)` : 'Vault name',
  }, name);
  let done = false;
  const save = (describe) => {
    const next = text.textContent.replace(/[\r\n]+/g, ' ').replace(/[/\\:]/g, '-').trim();
    if (!canRename || !next || next === name) {
      text.textContent = name;
      if (describe) onEnter();
      return;
    }
    if (done) return;
    done = true;
    onRename(next, { describe }).catch(() => {
      done = false;
      text.textContent = name;
    });
  };
  text.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      text.dataset.enter = '1';
      text.blur();
      save(true);
    } else if (event.key === 'Escape') {
      text.textContent = name;
      text.blur();
    }
  });
  text.addEventListener('blur', () => {
    if (text.dataset.enter) {
      delete text.dataset.enter;
      return;
    }
    save(false);
  });
  return h('h1', { class: 'display home-h1' }, text, h('span', { 'aria-hidden': 'true' }, '.'));
}

// A one-line description that's hidden until there is one (or you ask for it
// by pressing Enter on the title). Enter or clicking away saves it.
export function editableLine({ className, label, value, onSave, onDone }) {
  let saved = value || '';
  const el = h('p', {
    class: `${className} editable-line`,
    contenteditable: 'plaintext-only',
    spellcheck: 'true',
    role: 'textbox',
    'aria-label': label,
    'data-placeholder': 'Add a description…',
  }, saved);
  el.hidden = !saved;
  const commit = () => {
    const next = el.textContent.replace(/[\r\n]+/g, ' ').trim();
    el.textContent = next;
    el.hidden = !next;
    if (next !== saved) {
      saved = next;
      onSave(next);
    }
  };
  el.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      el.blur();
      if (onDone) onDone();
    } else if (event.key === 'Escape') {
      el.textContent = saved;
      el.blur();
    }
  });
  el.addEventListener('blur', commit);
  return {
    el,
    // Shows it (empty) and puts the cursor in it.
    open() {
      el.hidden = false;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    },
    // Shows text that isn't a saved description (an old folder note's first line).
    show(text) {
      if (document.activeElement === el) return;
      el.textContent = text;
      el.hidden = false;
      saved = text;
    },
    set(text) {
      if (document.activeElement === el) return;
      saved = text || '';
      el.textContent = saved;
      el.hidden = !saved;
    },
  };
}

// The sheets peeking out of a folder show its two most recently edited files
// (front sheet = newest). Empty folders show blank paper.
// Drag cards and folders: drop on a folder to move into it, or on either side
// of an item to put it there (the order is saved in the folder's note).
let dragging = null;

function arrangeable(el, node, onRearrange) {
  if (!onRearrange) return el;
  el.draggable = true;
  const clear = () => document.querySelectorAll('.home .drop-before, .home .drop-after, .home .drop-into')
    .forEach((x) => x.classList.remove('drop-before', 'drop-after', 'drop-into'));
  const zoneFor = (event) => {
    if (!dragging || dragging.path === node.path) return null;
    if (dragging.type === 'folder' && node.path.startsWith(`${dragging.path}/`)) return null;
    const box = el.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    if (node.type === 'folder') return x < 0.2 ? 'before' : x > 0.8 ? 'after' : 'into';
    if (dragging.type === 'folder') return null; // folders stay with folders
    return x < 0.5 ? 'before' : 'after';
  };
  el.addEventListener('dragstart', (event) => {
    dragging = node;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', node.path);
    el.classList.add('is-dragged');
  });
  el.addEventListener('dragend', () => {
    dragging = null;
    el.classList.remove('is-dragged');
    clear();
  });
  el.addEventListener('dragover', (event) => {
    const zone = zoneFor(event);
    if (!zone) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (el.classList.contains(`drop-${zone}`)) return;
    clear();
    el.classList.add(`drop-${zone}`);
  });
  el.addEventListener('dragleave', (event) => {
    if (!el.contains(event.relatedTarget)) el.classList.remove('drop-before', 'drop-after', 'drop-into');
  });
  el.addEventListener('drop', (event) => {
    const zone = zoneFor(event);
    const item = dragging;
    clear();
    if (!zone || !item) return;
    event.preventDefault();
    dragging = null;
    onRearrange(item, node, zone);
  });
  return el;
}

function folderTile(folder, onOpenFolder, wantPreview, onColorMenu) {
  const color = colorOf(folder);
  const latest = latestModified(folder);
  const [newest, next] = recentFiles(folder.children, 2);
  return h('button', {
    class: 'folder-tile',
    style: `--item-color: ${color}`,
    onclick: () => onOpenFolder(folder.path),
    oncontextmenu: (event) => onColorMenu(event, folder, 'folder'),
    ondblclick: (event) => onColorMenu(event, folder, 'folder'),
  },
    h('span', { class: 'folder-sheet sheet-a', 'aria-hidden': 'true' }, next ? sheetPreview(next, wantPreview) : null),
    h('span', { class: 'folder-sheet sheet-b', 'aria-hidden': 'true' }, newest ? sheetPreview(newest, wantPreview) : null),
    h('span', { class: 'folder-tab', style: `background: ${color}` }),
    h('span', { class: 'folder-body', style: `background: ${color}` },
      h('span', { class: 'display folder-name' }, folder.name),
      h('span', { class: 'folder-foot' },
        h('span', { class: 'serif-i' }, latest ? `edited ${relativeDay(latest)}` : 'empty'),
        h('span', { class: 'folder-count' }, pad2(countNotes(folder))))));
}

// A tiny version of a file for a folder sheet.
function sheetPreview(file, wantPreview) {
  const kind = kindOf(file.path);
  const name = noteName(file.path).replace(/\.[^.]+$/, '');
  if (kind === 'image') {
    return h('img', { class: 'sheet-photo', src: fileUrl(file.path, file.modified), alt: '', loading: 'lazy', decoding: 'async' });
  }
  if (kind === 'note') {
    const text = h('span', { class: 'sheet-text' });
    wantPreview(file.path, text);
    return h('span', { class: 'sheet-page' }, h('span', { class: 'sheet-title' }, name), text);
  }
  return h('span', { class: 'sheet-page' },
    h('span', { class: 'sheet-kind' }, extensionOf(file.path).slice(1).toUpperCase()),
    h('span', { class: 'sheet-title' }, name));
}

// Pictures look like a taped-in polaroid.
function photoCard(file, onOpenFile) {
  const tilt = slotFor(file.path) % 2 ? -2 : 1.6;
  return h('div', { class: 'card-cell' },
    h('button', { class: 'photo-card', style: `transform: rotate(${tilt}deg)`, onclick: () => onOpenFile(file.path) },
      h('span', { class: 'tape', style: `background: ${colorOf(file)}`, 'aria-hidden': 'true' }),
      h('img', { class: 'photo-img', src: fileUrl(file.path, file.modified), alt: '', loading: 'lazy', decoding: 'async' }),
      h('span', { class: 'hand photo-caption' }, noteName(file.path).replace(/\.[^.]+$/, ''))));
}

// PDFs, media and Office files: a card stamped with the file type.
function fileCard(file, kind, onOpenFile) {
  const ext = extensionOf(file.path).slice(1).toUpperCase();
  return h('div', { class: 'card-cell' },
    h('button', { class: `note-card file-card kind-${kind}`, style: `--item-color: ${colorOf(file)}`, onclick: () => onOpenFile(file.path) },
      h('span', { class: 'card-label mono-label' }, h('span', null, kindLabel(kind)), h('span', null, formatSize(file.size))),
      h('span', { class: 'display card-title' }, noteName(file.path).replace(/\.[^.]+$/, '')),
      h('span', { class: 'type-block', style: `background: ${colorOf(file)}` },
        h('span', { class: 'display type-block-ext' }, ext)),
      h('span', { class: 'serif-i card-foot' }, file.modified ? `edited ${relativeDay(file.modified)}` : '')));
}

function noteCard(file, preview, onOpenFile) {
  const look = CARD_LOOKS[slotFor(file.path) % CARD_LOOKS.length];
  const color = colorOf(file);
  const card = h('button', {
    class: `note-card look-${look}`,
    style: look === 'block' ? `background: ${color}; --item-color: ${color}` : `--item-color: ${color}`,
    onclick: () => onOpenFile(file.path),
  },
  look === 'taped' ? h('span', { class: 'tape', style: `background: ${color}`, 'aria-hidden': 'true' }) : null,
  h('span', { class: 'card-label mono-label' }, h('span', null, 'Note'), h('span', null, file.modified ? shortDate(file.modified) : '')),
  h('span', { class: 'display card-title' }, noteName(file.path)),
  preview,
  h('span', { class: 'serif-i card-foot' }, file.modified ? `edited ${relativeDay(file.modified)}` : ''));
  return h('div', { class: 'card-cell' }, card);
}

