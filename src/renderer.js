// Window code: decides what's on screen and moves between screens.
// Bundled into dist/renderer.js (+ dist/renderer.css) by esbuild (`npm run build`).
//
// Screens: 'welcome' (no vault), 'home' (a folder's home page), 'note', 'palettes'.

import '@fontsource/caveat/latin-500.css';
import '@fontsource/caveat/latin-700.css';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-600.css';

import { Sidebar } from './sidebar.js';
import { Chrome } from './chrome.js';
import { editorForFile } from './editor-registry.js';
import { renderFolderHome } from './views/folder-home.js';
import { NoteView } from './views/note-view.js';
import { FileView } from './views/file-view.js';
import { fileUrl } from './file-types.js';
import { renderPalettes } from './views/palettes-view.js';
import { applyPalette } from './palettes.js';
import { askName, h, scribbleArrow } from './ui.js';
import { findFile, findFolder, recentFiles } from './tree.js';
import { noteName, parentOf } from './format.js';

const viewEl = document.getElementById('view');

// Main passes the saved palette in the address so the first paint uses it.
const initialPalette = new URLSearchParams(location.search).get('palette');
if (initialPalette) applyPalette(initialPalette);

let vault = null;
let tree = [];
let paletteName = initialPalette || 'Riso';
let screen = { kind: 'welcome' }; // plus folderPath / filePath
// The open note: { filePath, editor, noteView } or null.
let current = null;

const sidebar = new Sidebar(document.getElementById('sidebar'), {
  onOpenFile: (p) => openFile(p),
  onOpenFolder: (p) => openFolder(p),
  onSwitchVault: () => window.opal.chooseVault(),
});

const chrome = new Chrome(document.getElementById('topbar'), document.getElementById('footer'), {
  onHome: () => vault && openFolder(''),
  onPalettes: () => showPalettes(),
  onOpenFile: (p) => openFile(p),
});

// ---------- Everything happens one step at a time ----------

// Opening, closing and saving run one after another, never overlapping,
// so a fast click can't skip saving the previous note.
let queue = Promise.resolve();
function enqueue(task) {
  const run = queue.then(task);
  queue = run.catch((err) => console.error(err));
  return run;
}

// Saves and removes the open editor. Throws (keeping the note open) if saving fails.
async function closeCurrent() {
  if (!current) return;
  await current.editor.flush();
  current.editor.destroy();
  current = null;
}

// Every move to another screen goes through here: it saves the open note
// first, and stays put if that fails.
function navigate(task) {
  return enqueue(async () => {
    try {
      await closeCurrent();
    } catch (err) {
      alert(`Opal could not save “${noteName(current.filePath)}”, so it is staying open.\n\n${err.message}`);
      return;
    }
    await task();
  });
}

async function reloadTree() {
  tree = await window.opal.listFiles();
  sidebar.setTree(tree);
  chrome.setRecent(recentFiles(tree, 6));
}

// ---------- Screens ----------

function crumbsFor(folderPath) {
  const crumbs = [{ label: vault.name, onClick: () => openFolder('') }];
  const parts = folderPath ? folderPath.split('/') : [];
  parts.forEach((part, i) => {
    const target = parts.slice(0, i + 1).join('/');
    crumbs.push({ label: part, onClick: () => openFolder(target) });
  });
  return crumbs;
}

function setTitle(text) {
  document.title = text ? `${text} — Opal` : 'Opal';
}

function showWelcome(problem) {
  screen = { kind: 'welcome' };
  setTitle('');
  sidebar.setActive(null, null);
  chrome.setCrumbs([{ label: 'Welcome' }]);
  viewEl.replaceChildren(h('div', { class: 'welcome' },
    problem ? h('div', { class: 'home-notice welcome-notice' }, problem) : null,
    h('span', { class: 'mono-label' }, 'Opal · notes that live in plain files'),
    h('h1', { class: 'display home-h1' }, 'Opal.'),
    h('p', { class: 'home-desc' }, 'Pick a folder to be your vault. Any folder of markdown files works — even an Obsidian vault.'),
    h('div', { class: 'welcome-row' },
      h('button', { class: 'home-action is-primary welcome-button', onclick: () => window.opal.chooseVault() }, 'Choose a folder…'),
      scribbleArrow({ width: 110, height: 60, d: 'M104 40 C 80 56, 40 54, 14 30', head: 'M12 44 L13 29 L27 30' }),
      h('span', { class: 'hand welcome-hint' }, 'start here'))));
}

function showHome(folderPath, notice) {
  let folder = findFolder(tree, folderPath, vault.name);
  if (!folder) {
    folderPath = '';
    folder = findFolder(tree, '', vault.name);
  }
  screen = { kind: 'home', folderPath };
  setTitle(folder.name);
  sidebar.setActive('folder', folderPath);
  chrome.setCrumbs(crumbsFor(folderPath));
  renderFolderHome(viewEl, {
    folder,
    isRoot: !folderPath,
    notice,
    getPreviews: (paths) => window.opal.getPreviews(paths),
    onOpenFile: (p) => openFile(p),
    onOpenFolder: (p) => openFolder(p),
    onNewNote: () => newNote(),
    onNewFolder: () => newFolder(),
  });
}

async function showNote(filePath) {
  const EditorType = editorForFile(filePath);
  if (!EditorType) {
    showHome(parentOf(filePath), `Opal can't open this kind of file yet: ${filePath}`);
    return;
  }
  if (!EditorType.editsText) {
    await showViewer(filePath, EditorType);
    return;
  }

  let content;
  try {
    content = await window.opal.readFile(filePath);
  } catch (err) {
    showHome(parentOf(filePath), `Could not open ${filePath}: ${err.message}`);
    return;
  }
  if (!findFile(tree, filePath)) await reloadTree();

  screen = { kind: 'note', filePath };
  viewEl.scrollTop = 0;
  const noteView = new NoteView(viewEl, {
    filePath,
    vaultName: vault.name,
    onOpenFile: (p) => openFile(p),
    onOpenFolder: (p) => openFolder(p),
    onOpenLink: (target) => openLink(target),
    onNewNoteHere: () => newNote(),
    onPalettes: () => showPalettes(),
    onGoToLine: (line) => current && current.editor.goToLine && current.editor.goToLine(line),
  });

  let changeTimer = null;
  const editor = new EditorType({
    parent: noteView.editorHost,
    content,
    save: async (text) => {
      await window.opal.writeFile(filePath, text);
      noteSaved(filePath);
    },
    onStatus: (status) => chrome.setStatus(status),
    onOpenLink: (target) => openLink(target),
    onChange: () => {
      clearTimeout(changeTimer);
      changeTimer = setTimeout(() => current && current.editor === editor && noteView.setText(editor.getText()), 300);
    },
  });
  current = { filePath, editor, noteView };
  noteView.setTree(tree);
  noteView.setText(content);

  chrome.setStatus('Saved');
  setTitle(noteName(filePath));
  chrome.setCrumbs([...crumbsFor(parentOf(filePath)), { label: noteName(filePath) }]);
  sidebar.setActive('file', filePath);
}

// PDFs, pictures, media and Office files: view-only.
async function showViewer(filePath, ViewerType) {
  if (!findFile(tree, filePath)) await reloadTree();
  const node = findFile(tree, filePath);
  if (!node) {
    showHome(parentOf(filePath), `Can't find ${filePath} any more.`);
    return;
  }

  screen = { kind: 'note', filePath };
  viewEl.scrollTop = 0;
  const fileView = new FileView(viewEl, {
    filePath,
    vaultName: vault.name,
    onOpenFile: (p) => openFile(p),
    onOpenFolder: (p) => openFolder(p),
  });
  const viewer = new ViewerType({
    parent: fileView.viewerHost,
    filePath,
    url: fileUrl(filePath, node.modified),
    onStatus: (status) => chrome.setStatus(status),
  });
  current = { filePath, editor: viewer, noteView: fileView, modified: node.modified };
  fileView.setTree(tree);

  chrome.setStatus('Saved');
  setTitle(noteName(filePath));
  chrome.setCrumbs([...crumbsFor(parentOf(filePath)), { label: noteName(filePath) }]);
  sidebar.setActive('file', filePath);
}

// ---------- Moving around ----------

function openFolder(folderPath) {
  return navigate(async () => {
    if (!findFolder(tree, folderPath, vault.name)) await reloadTree();
    showHome(folderPath);
  });
}

function openFile(filePath) {
  if (current && current.filePath === filePath) return Promise.resolve();
  return navigate(() => showNote(filePath));
}

function showPalettes() {
  if (!vault) return Promise.resolve();
  return navigate(async () => {
    screen = { kind: 'palettes' };
    setTitle('Palettes');
    sidebar.setActive(null, null);
    chrome.setCrumbs([{ label: vault.name, onClick: () => openFolder('') }, { label: 'Palettes' }]);
    viewEl.scrollTop = 0;
    drawPalettes();
  });
}

function drawPalettes() {
  if (screen.kind !== 'palettes') return;
  const scrollTop = viewEl.scrollTop;
  renderPalettes(viewEl, {
    active: paletteName,
    onUse: async (name) => {
      paletteName = await window.opal.setPalette(name);
      chrome.setPalette(applyPalette(paletteName));
      drawPalettes();
    },
  });
  viewEl.scrollTop = scrollTop;
}

// Follows a [[link]]: main finds the note (or creates it), then we open it.
async function openLink(target) {
  try {
    await openFile(await window.opal.resolveLink(target));
  } catch (err) {
    alert(`Could not open [[${target}]].\n\n${err.message}`);
  }
}

// The folder new things go into: the folder on screen, or the open note's folder.
function currentFolder() {
  if (screen.kind === 'home') return screen.folderPath;
  if (screen.kind === 'note') return parentOf(screen.filePath);
  return '';
}

function folderLabel(folderPath) {
  return folderPath ? folderPath.split('/').pop() : vault.name;
}

async function newNote() {
  if (!vault) return;
  const folder = currentFolder();
  const name = await askName(`New note in ${folderLabel(folder)}`);
  if (!name) return;
  try {
    const filePath = await window.opal.createNote(name, folder);
    await openFile(filePath);
  } catch (err) {
    alert(`Could not create “${name}”.\n\n${err.message}`);
  }
}

async function newFolder() {
  if (!vault) return;
  const parent = currentFolder();
  const name = await askName(`New folder in ${folderLabel(parent)}`);
  if (!name) return;
  try {
    const folderPath = await window.opal.createFolder(name, parent);
    await navigate(async () => {
      await reloadTree();
      showHome(folderPath);
    });
  } catch (err) {
    alert(`Could not create folder “${name}”.\n\n${err.message}`);
  }
}

// ---------- Keeping up with the disk ----------

function refreshFiles() {
  // Queued so the listing is always fresher than any note just opened or created.
  return enqueue(async () => {
    if (!vault) return;
    try {
      await reloadTree();
    } catch {
      vaultWentMissing();
      return;
    }

    if (screen.kind === 'home') {
      const gone = screen.folderPath && !findFolder(tree, screen.folderPath, vault.name);
      showHome(screen.folderPath, gone ? `The folder “${screen.folderPath}” was moved or deleted outside Opal.` : undefined);
    } else if (screen.kind === 'note' && current) {
      // If the open note was moved or deleted outside Opal and nothing is waiting
      // to be saved, close it. (With unsaved typing we keep it open and let the
      // save recreate the file, so nothing is lost.)
      if (!current.editor.isDirty && !findFile(tree, current.filePath)) {
        const gone = current.filePath;
        current.editor.destroy();
        current = null;
        showHome(parentOf(gone), `“${gone}” was moved or deleted outside Opal.`);
      } else {
        current.noteView.setTree(tree);
        await pickUpOutsideEdits();
      }
    }
  });
}

// If another app (Obsidian, a text editor, sync) changed the open note, show
// that version — the editor only accepts it when nothing here is unsaved.
async function pickUpOutsideEdits() {
  const { editor, filePath } = current;
  if (editor.reload) {
    // A viewer: redraw if the file itself changed.
    const node = findFile(tree, filePath);
    if (node && node.modified !== current.modified) {
      current.modified = node.modified;
      editor.reload(fileUrl(filePath, node.modified));
    }
    return;
  }
  if (!editor.reloadFromDisk || editor.isDirty) return;
  const token = editor.saveToken;
  let diskText;
  try {
    diskText = await window.opal.readFile(filePath);
  } catch {
    return;
  }
  if (current && current.editor === editor && editor.reloadFromDisk(diskText, token)) {
    chrome.setStatus('Reloaded');
  }
}

// Opal's own saves don't trigger a vault rescan, so keep the dates fresh here.
function noteSaved(filePath) {
  const node = findFile(tree, filePath);
  if (node) {
    node.modified = Date.now();
    chrome.setRecent(recentFiles(tree, 6));
    if (current && current.filePath === filePath) current.noteView.setTree(tree);
  } else {
    // The save recreated a file that had been deleted outside Opal.
    reloadTree().catch(() => {});
  }
}

// The vault folder was moved, renamed or deleted while Opal was open.
function vaultWentMissing() {
  if (current && current.editor.isDirty) return; // keep typing; its save will say if it fails
  if (current) {
    current.editor.destroy();
    current = null;
  }
  tree = [];
  sidebar.setTree([]);
  chrome.setRecent([]);
  showWelcome(`Can't find your vault folder “${vault.name}” any more — it may have been moved, renamed or deleted. Choose it again (or another folder).`);
}

function loadVault(newVault) {
  return enqueue(async () => {
    // Main already saved and closed the note before switching; this is a safety net.
    if (current) {
      current.editor.destroy();
      current = null;
    }
    vault = newVault;
    tree = [];
    sidebar.setVault(vault);
    chrome.setRecent([]);
    if (!vault) {
      showWelcome();
      return;
    }
    await reloadTree();
    showHome('');
  });
}

// Safety net: if the page is ever unloaded some other way while typing is
// unsaved, refuse, save immediately, and let the next attempt go through.
window.addEventListener('beforeunload', (event) => {
  if (current && current.editor.isDirty) {
    event.preventDefault();
    event.returnValue = false;
    enqueue(() => current && current.editor.flush());
  }
});

window.opal.onFlushRequest(({ closeEditor }) =>
  enqueue(async () => {
    if (closeEditor) {
      await closeCurrent();
      screen = { kind: 'welcome' };
      viewEl.replaceChildren(h('div', { class: 'welcome' }, h('p', { class: 'hand welcome-hint' }, 'switching vault…')));
    } else if (current) {
      await current.editor.flush();
    }
  }),
);
window.opal.onNewNoteRequest(newNote);
window.opal.onNewFolderRequest(newFolder);
window.opal.onGoHome(() => vault && openFolder(''));
window.opal.onShowPalettes(showPalettes);
window.opal.onVaultChanged(loadVault);
window.opal.onFilesChanged(refreshFiles);

window.opal.getPalette().then((name) => {
  paletteName = name;
  chrome.setPalette(applyPalette(name));
});
window.opal.getVault().then(loadVault);
