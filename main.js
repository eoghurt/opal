// Main process: the only part of Opal that touches the disk.
// The window (renderer) asks for things through IPC; see preload.js.

const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

app.setName('Opal');
// Lets automated tests use a throwaway settings folder instead of the real one.
if (process.env.OPAL_USER_DATA) app.setPath('userData', process.env.OPAL_USER_DATA);

let win = null;
let vaultPath = null;

// ---------- Settings (only remembers which folder is the vault) ----------

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
}

// ---------- Vault ----------

function isFolder(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function vaultInfo() {
  return vaultPath ? { path: vaultPath, name: path.basename(vaultPath) } : null;
}

function setVault(folder) {
  vaultPath = folder;
  saveSettings({ ...loadSettings(), vaultPath: folder });
  watchVault();
  if (win) win.webContents.send('vault:changed', vaultInfo());
}

// File types Opal can open. Later versions add more (e.g. spreadsheets).
const NOTE_EXTENSIONS = ['.md'];

function isNoteFile(name) {
  return NOTE_EXTENSIONS.includes(path.extname(name).toLowerCase());
}

function isHidden(name) {
  return name.startsWith('.');
}

// Builds the folder tree: [{ type: 'folder', name, path, children }, { type: 'file', name, path }].
// Paths are relative to the vault and always use '/'. Folders with no notes are left out.
async function scanFolder(relFolder) {
  const entries = await fs.promises.readdir(path.join(vaultPath, relFolder), { withFileTypes: true });
  const folders = [];
  const files = [];
  for (const entry of entries) {
    if (isHidden(entry.name)) continue;
    const relPath = relFolder ? `${relFolder}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const children = await scanFolder(relPath);
      if (children.length) folders.push({ type: 'folder', name: entry.name, path: relPath, children });
    } else if (entry.isFile() && isNoteFile(entry.name)) {
      files.push({ type: 'file', name: entry.name, path: relPath });
    }
  }
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  return [...folders.sort(byName), ...files.sort(byName)];
}

// Watches the vault for changes made outside Opal and tells the window to refresh.
let watcher = null;
let refreshTimer = null;

function watchVault() {
  if (watcher) watcher.close();
  watcher = null;
  if (!vaultPath) return;
  try {
    watcher = fs.watch(vaultPath, { recursive: true }, (_event, filename) => {
      if (filename && filename.split(path.sep).some(isHidden)) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (win) win.webContents.send('vault:files-changed');
      }, 200);
    });
    watcher.on('error', (err) => console.error('Vault watcher error:', err));
  } catch (err) {
    console.error('Could not watch vault:', err);
  }
}

async function pickFolder() {
  const result = await dialog.showOpenDialog(win, {
    title: 'Choose a folder for your vault',
    buttonLabel: 'Use as Vault',
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
}

async function switchVault() {
  const folder = await pickFolder();
  if (folder) setVault(folder);
  return vaultInfo();
}

// ---------- IPC: what the window is allowed to ask for ----------

ipcMain.handle('vault:get', () => vaultInfo());
ipcMain.handle('vault:choose', () => switchVault());
ipcMain.handle('vault:list', () => (vaultPath ? scanFolder('') : []));

// ---------- Window and menu ----------

function buildMenu() {
  const template = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        { label: 'Switch Vault…', accelerator: 'CmdOrCtrl+Shift+O', click: () => switchVault() },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 750,
    title: 'Opal',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // The window must never navigate away or open new windows.
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.on('closed', () => { win = null; });

  // First launch (or the saved folder has gone): ask for a vault.
  win.webContents.once('did-finish-load', () => {
    if (!vaultPath) switchVault();
  });
}

app.whenReady().then(() => {
  const saved = loadSettings().vaultPath;
  if (saved && isFolder(saved)) vaultPath = saved;
  watchVault();
  buildMenu();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
