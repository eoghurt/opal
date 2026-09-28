// Window code: wires the sidebar and the editor area together.
// Bundled into dist/renderer.js by esbuild (`npm run build`).

import { Sidebar } from './sidebar.js';
import { editorForFile } from './editor-registry.js';

const header = document.getElementById('sidebar-header');
const editorHost = document.getElementById('editor-host');
const noteHeader = document.getElementById('note-header');
const noteTitle = document.getElementById('note-title');
const noteStatus = document.getElementById('note-status');

const sidebar = new Sidebar(document.getElementById('file-tree'), {
  onOpenFile: (filePath) => openFile(filePath),
});

// The open note: { filePath, editor } or null.
let current = null;

// Opening, closing and saving run one after another, never overlapping,
// so a fast click can't skip saving the previous note.
let queue = Promise.resolve();
function enqueue(task) {
  const run = queue.then(task);
  queue = run.catch((err) => console.error(err));
  return run;
}

function showMessage(text) {
  editorHost.innerHTML = '';
  noteHeader.hidden = true;
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.textContent = text;
  editorHost.append(div);
}

function setStatus(text) {
  noteStatus.textContent = text;
  noteStatus.classList.toggle('error', text === 'Save failed');
}

// Saves and removes the open editor. Throws (keeping the note open) if saving fails.
async function closeCurrent() {
  if (!current) return;
  await current.editor.flush();
  current.editor.destroy();
  current = null;
}

function openFile(filePath) {
  return enqueue(async () => {
    if (current && current.filePath === filePath) return;

    try {
      await closeCurrent();
    } catch (err) {
      alert(`Opal could not save “${current.filePath}”, so it is staying open.\n\n${err.message}`);
      return;
    }

    const EditorType = editorForFile(filePath);
    if (!EditorType) {
      showMessage(`Opal can't open this kind of file yet: ${filePath}`);
      return;
    }

    let content;
    try {
      content = await window.opal.readFile(filePath);
    } catch (err) {
      showMessage(`Could not open ${filePath}: ${err.message}`);
      return;
    }

    editorHost.innerHTML = '';
    noteHeader.hidden = false;
    noteTitle.textContent = filePath.replace(/\.md$/i, '');
    setStatus('Saved');
    current = {
      filePath,
      editor: new EditorType({
        parent: editorHost,
        content,
        save: (text) => window.opal.writeFile(filePath, text),
        onStatus: setStatus,
        onOpenLink: openLink,
      }),
    };
    sidebar.setActive(filePath);
  });
}

// Follows a [[link]]: main finds the note (or creates it), then we open it.
async function openLink(target) {
  try {
    await openFile(await window.opal.resolveLink(target));
  } catch (err) {
    alert(`Could not open [[${target}]].\n\n${err.message}`);
  }
}

function renderHeader(vault) {
  header.innerHTML = '';
  const name = document.createElement('div');
  name.className = 'vault-name';
  name.textContent = vault ? vault.name : 'No vault';
  name.title = vault ? vault.path : '';

  const button = document.createElement('button');
  button.className = 'vault-switch';
  button.textContent = vault ? 'Switch' : 'Choose folder…';
  button.addEventListener('click', () => window.opal.chooseVault());

  header.append(name, button);
}

function refreshFiles() {
  // Queued so the listing is always fresher than any note just opened or created.
  return enqueue(async () => {
    sidebar.setTree(await window.opal.listFiles());

    // If the open note was moved or deleted outside Opal and nothing is waiting
    // to be saved, close it. (With unsaved typing we keep it open and let the
    // save recreate the file, so nothing is lost.)
    if (current && !current.editor.isDirty && !sidebar.hasFile(current.filePath)) {
      const gone = current.filePath;
      current.editor.destroy();
      current = null;
      sidebar.setActive(null);
      showMessage(`“${gone}” was moved or deleted outside Opal.`);
    }
  });
}

function loadVault(vault) {
  return enqueue(async () => {
    // Main already saved and closed the note before switching; this is a safety net.
    if (current) {
      current.editor.destroy();
      current = null;
    }
    renderHeader(vault);
    sidebar.reset();
    showMessage(vault ? 'Select a note from the sidebar.' : 'Choose a folder to use as your vault.');
    if (vault) sidebar.setTree(await window.opal.listFiles());
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
      sidebar.setActive(null);
      showMessage('Switching vault…');
    } else if (current) {
      await current.editor.flush();
    }
  }),
);
window.opal.onVaultChanged(loadVault);
window.opal.onFilesChanged(refreshFiles);
window.opal.getVault().then(loadVault);
