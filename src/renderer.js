// Window code: wires the sidebar and the editor area together.
// Bundled into dist/renderer.js by esbuild (`npm run build`).

import { Sidebar } from './sidebar.js';

const header = document.getElementById('sidebar-header');
const editorHost = document.getElementById('editor-host');

const sidebar = new Sidebar(document.getElementById('file-tree'), {
  onOpenFile: (filePath) => showMessage(`Selected: ${filePath}`),
});

function showMessage(text) {
  editorHost.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.textContent = text;
  editorHost.append(div);
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

async function refreshFiles() {
  sidebar.setTree(await window.opal.listFiles());
}

async function loadVault(vault) {
  renderHeader(vault);
  sidebar.reset();
  showMessage(vault ? 'Select a note from the sidebar.' : 'Choose a folder to use as your vault.');
  if (vault) await refreshFiles();
}

window.opal.onVaultChanged(loadVault);
window.opal.onFilesChanged(refreshFiles);
window.opal.getVault().then(loadVault);
