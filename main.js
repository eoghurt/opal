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
  vaultPath = path.resolve(folder);
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
  if (!folder) return vaultInfo();
  // Save and close the open note before the vault changes underneath it.
  const flushed = await flushWindow({ closeEditor: true });
  if (!flushed.ok) {
    dialog.showMessageBox(win, {
      type: 'warning',
      message: 'Opal could not save the current note, so the vault was not switched.',
      detail: flushed.error,
    });
    return vaultInfo();
  }
  setVault(folder);
  return vaultInfo();
}

// ---------- Reading and writing notes ----------

// Turns a vault-relative path from the window into a full path.
// Refuses anything outside the vault, hidden, or not a note.
function resolveNotePath(relPath) {
  if (!vaultPath) throw new Error('No vault is open.');
  if (typeof relPath !== 'string') throw new Error('Invalid path.');
  const full = path.resolve(vaultPath, relPath);
  if (!full.startsWith(vaultPath + path.sep)) throw new Error('That path is outside the vault.');
  if (path.relative(vaultPath, full).split(path.sep).some(isHidden)) throw new Error('That path is hidden.');
  if (!isNoteFile(full)) throw new Error('That is not a note file.');
  return full;
}

async function readNote(relPath) {
  return fs.promises.readFile(resolveNotePath(relPath), 'utf8');
}

// Writes to a hidden temp file first, then swaps it in, so a crash mid-save
// can never leave a half-written note.
async function writeNote(relPath, content) {
  if (typeof content !== 'string') throw new Error('Invalid content.');
  const full = resolveNotePath(relPath);
  const temp = path.join(path.dirname(full), `.${path.basename(full)}.opal-saving`);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  await fs.promises.writeFile(temp, content, 'utf8');
  await fs.promises.rename(temp, full);
}

// ---------- [[Links]] ----------

function listNotePaths(nodes, out = []) {
  for (const node of nodes) {
    if (node.type === 'file') out.push(node.path);
    else listNotePaths(node.children, out);
  }
  return out;
}

// Compare names the way macOS does: ignore case and accent encoding differences.
function normalizeName(name) {
  return name.replace(/\.md$/i, '').normalize('NFC').toLowerCase();
}

// Characters macOS or other apps don't allow in file names become '-'.
function safeFileName(name) {
  return name.replace(/[\\/:*?"<>|]/g, '-').replace(/^\.+/, '').trim() || 'Untitled';
}

// Finds the note a [[link]] points to, or creates it in the vault root.
// Returns the note's vault-relative path.
async function resolveLink(rawTarget) {
  if (!vaultPath) throw new Error('No vault is open.');
  // [[Note|shown text]] and [[Note#Heading]] both point at "Note".
  const target = String(rawTarget).split('|')[0].split('#')[0].trim();
  if (!target) throw new Error('That link is empty.');
  const wanted = normalizeName(target);
  const notes = listNotePaths(await scanFolder(''));

  // 1. Exact path from the vault root, e.g. [[Projects/Plan]].
  const byPath = notes.find((p) => normalizeName(p) === wanted);
  if (byPath) return byPath;

  // 2. Note name anywhere in the vault; prefer the one closest to the root.
  const byName = notes
    .filter((p) => normalizeName(path.posix.basename(p)) === wanted)
    .sort((a, b) => a.split('/').length - b.split('/').length)[0];
  if (byName) return byName;

  // 3. Not found: create it in the vault root.
  return createNote(target);
}

// Creates an empty note in the vault root and returns its path.
// If a note with that name is already there, it is left untouched ('wx' never overwrites).
async function createNote(rawName) {
  if (!vaultPath) throw new Error('No vault is open.');
  const relPath = `${safeFileName(String(rawName).replace(/\.md$/i, ''))}.md`;
  // macOS ignores case, so "idea" and "Idea" are the same file: reuse the real spelling.
  const wanted = normalizeName(relPath);
  const existing = (await fs.promises.readdir(vaultPath)).find((n) => isNoteFile(n) && normalizeName(n) === wanted);
  if (existing) return existing;
  try {
    await fs.promises.writeFile(resolveNotePath(relPath), '', { flag: 'wx' });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
  return relPath;
}

// Asks the window to save any unsaved typing, and waits until it has.
let flushCounter = 0;

function flushWindow({ closeEditor = false } = {}) {
  return new Promise((resolve) => {
    if (!win || win.isDestroyed()) return resolve({ ok: true });
    const id = ++flushCounter;
    const onDone = (_event, reply) => {
      if (reply && reply.id === id) finish(reply);
    };
    const timer = setTimeout(() => finish({ ok: false, error: 'The window did not respond.' }), 5000);
    function finish(reply) {
      clearTimeout(timer);
      ipcMain.removeListener('app:flush-done', onDone);
      resolve(reply);
    }
    ipcMain.on('app:flush-done', onDone);
    win.webContents.send('app:flush', { id, closeEditor });
  });
}

// ---------- IPC: what the window is allowed to ask for ----------

ipcMain.handle('vault:get', () => vaultInfo());
ipcMain.handle('vault:choose', () => switchVault());
ipcMain.handle('vault:list', () => (vaultPath ? scanFolder('') : []));
ipcMain.handle('file:read', (_event, relPath) => readNote(relPath));
ipcMain.handle('file:write', (_event, relPath, content) => writeNote(relPath, content));
ipcMain.handle('link:resolve', (_event, target) => resolveLink(target));
ipcMain.handle('note:create', (_event, name) => createNote(name));

// ---------- Window and menu ----------

function buildMenu() {
  const template = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Note',
          accelerator: 'CmdOrCtrl+N',
          click: () => { if (win) win.webContents.send('note:new-request'); },
        },
        { label: 'Switch Vault…', accelerator: 'CmdOrCtrl+Shift+O', click: () => switchVault() },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    { role: 'editMenu' },
    {
      // No "Reload": reloading the page could drop typing that hasn't been saved yet.
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
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

  // Before the window closes (including Cmd+Q), make sure everything typed is saved.
  let allowClose = false;
  let closing = false;
  win.on('close', async (event) => {
    if (allowClose) return;
    event.preventDefault();
    if (closing) return;
    closing = true;
    const flushed = await flushWindow();
    closing = false;
    if (!flushed.ok) {
      const { response } = await dialog.showMessageBox(win, {
        type: 'warning',
        message: 'Some changes could not be saved.',
        detail: `${flushed.error}\n\nIf you quit now, your latest typing in the open note will be lost.`,
        buttons: ['Keep Window Open', 'Quit Anyway'],
        defaultId: 0,
        cancelId: 0,
      });
      if (response === 0) return;
    }
    allowClose = true;
    win.close();
  });

  // First launch (or the saved folder has gone): ask for a vault.
  win.webContents.once('did-finish-load', () => {
    if (!vaultPath) switchVault();
  });
}

app.whenReady().then(() => {
  const saved = loadSettings().vaultPath;
  if (saved && isFolder(saved)) vaultPath = path.resolve(saved);
  watchVault();
  buildMenu();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
