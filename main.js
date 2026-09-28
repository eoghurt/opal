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
  if (win) win.webContents.send('vault:changed', vaultInfo());
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
  buildMenu();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
