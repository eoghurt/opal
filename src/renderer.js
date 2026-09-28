// Window code: wires the sidebar and the editor area together.
// Bundled into dist/renderer.js by esbuild (`npm run build`).

const header = document.getElementById('sidebar-header');
const editorHost = document.getElementById('editor-host');

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

function loadVault(vault) {
  renderHeader(vault);
  showMessage(vault ? 'Select a note from the sidebar.' : 'Choose a folder to use as your vault.');
}

window.opal.onVaultChanged(loadVault);
window.opal.getVault().then(loadVault);
