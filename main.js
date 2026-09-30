// Main process: the only part of Opal that touches the disk.
// The window (renderer) asks for things through IPC; see preload.js.

const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, net, protocol, shell, Notification, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const FILE_TYPES = require('./file-types.json');
const frontmatter = require('./shared/frontmatter.js');
const { stripStickies, parseStickies, writeStickies } = require('./shared/stickies.js');
const { relinkText, resolve: resolveTarget, joinPath, folderOf } = require('./shared/relink.js');
const { countWords } = require('./shared/words.js');
const { readProperties, writeProperty } = require('./shared/properties.js');
const tracker = require('./shared/tracker.js');
const { stripFrontmatter } = frontmatter;

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
  migrateVault().catch((err) => console.error('Settings move failed:', err));
  if (win) win.webContents.send('vault:changed', vaultInfo());
}

// File types Opal can open. Later versions add more (e.g. spreadsheets).
// Only notes can be edited and saved. Every other known type is view-only.
const NOTE_EXTENSIONS = FILE_TYPES.note.extensions;
const KNOWN_EXTENSIONS = Object.values(FILE_TYPES).flatMap((t) => t.extensions);

function isNoteFile(name) {
  return NOTE_EXTENSIONS.includes(path.extname(name).toLowerCase());
}

// Any file Opal can show: notes plus PDFs, images, media and Office files.
function isKnownFile(name) {
  return KNOWN_EXTENSIONS.includes(path.extname(name).toLowerCase());
}

function isHidden(name) {
  return name.startsWith('.');
}

// Builds the folder tree:
//   [{ type: 'folder', name, path, children }, { type: 'file', name, path, created, modified }].
// Paths are relative to the vault and always use '/'. Dates are milliseconds.
// Folders and files also carry `color` (one of the ten names, or null =
// the default), read from note properties (see shared/frontmatter.js).
async function scanFolder(relFolder) {
  return (await scanDir(relFolder)).nodes;
}

async function scanDir(relFolder) {
  const entries = await fs.promises.readdir(path.join(vaultPath, relFolder), { withFileTypes: true });
  const folders = [];
  const files = [];
  await Promise.all(entries.map(async (entry) => {
    if (isHidden(entry.name)) return;
    const relPath = relFolder ? `${relFolder}/${entry.name}` : entry.name;
    try {
      if (entry.isDirectory()) {
        const inside = await scanDir(relPath);
        folders.push({ type: 'folder', name: entry.name, path: relPath, children: inside.nodes, color: inside.color, description: inside.description, wordTarget: inside.wordTarget });
      } else if (entry.isFile() && isKnownFile(entry.name)) {
        const full = path.join(vaultPath, relPath);
        const stat = await fs.promises.stat(full);
        const file = { type: 'file', name: entry.name, path: relPath, created: stat.birthtimeMs, modified: stat.mtimeMs, size: stat.size, color: null };
        if (isNoteFile(entry.name)) Object.assign(file, await noteProps(full, stat.mtimeMs));
        files.push(file);
      }
    } catch {
      // The entry vanished mid-scan; the next refresh will catch up.
    }
  }));

  // The folder's settings (colour, order, file colours, description) live in
  // its hidden .opal.md. Older vaults kept them in the folder's own note
  // (School/School.md; the vault's is named after the vault) — still read.
  const folderName = relFolder ? path.posix.basename(relFolder) : path.basename(vaultPath);
  const folderNote = files.find((f) => f.name.toLowerCase() === `${folderName.toLowerCase()}.md`);
  const hidden = await folderSettingsProps(relFolder);
  const legacyColors = folderNote ? folderNote.fileColors || {} : {};
  const map = { ...legacyColors, ...hidden.fileColors };
  const order = hidden.order.length ? hidden.order : (folderNote ? folderNote.order || [] : []);
  for (const file of files) {
    if (!isNoteFile(file.name)) file.color = frontmatter.validColor(map[file.name]);
    // A folder note that only holds Opal's settings stays behind the scenes.
    file.quiet = file === folderNote && Boolean(file.settingsOnly);
    delete file.fileColors;
    delete file.settingsOnly;
    delete file.order;
  }

  // Your own order first (from dragging), then by name.
  const rank = (n) => {
    const i = order.indexOf(n.name);
    return i === -1 ? Infinity : i;
  };
  const byName = (a, b) => (rank(a) - rank(b)) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  return {
    nodes: [...folders.sort(byName), ...files.sort(byName)],
    color: hidden.color || (folderNote ? folderNote.color : null),
    description: hidden.description || (folderNote ? folderNote.description : ''),
    wordTarget: hidden.wordTarget || null,
  };
}

function wordTarget(value) {
  const n = parseInt(String(value || '').replace(/[,\s]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// A note's Opal properties, from the start of the file (cached until it changes).
const propsCache = new Map();

async function noteProps(full, mtimeMs) {
  const cached = propsCache.get(full);
  if (cached && cached.mtimeMs === mtimeMs) return cached.props;
  let head = '';
  const handle = await fs.promises.open(full, 'r');
  try {
    const buffer = Buffer.alloc(16384); // room for a long opal-order list
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    head = buffer.toString('utf8', 0, bytesRead);
  } finally {
    await handle.close();
  }
  const props = {
    color: frontmatter.validColor(frontmatter.getProp(head, 'opal-color')),
    fileColors: frontmatter.fileColors(head),
    order: frontmatter.itemOrder(head),
    description: frontmatter.getDescription(head),
    wordTarget: wordTarget(frontmatter.getProp(head, 'word-target')),
    // Nothing but Opal's own settings (colours, stickies) in it?
    settingsOnly: head.length < 4096 && !stripStickies(frontmatter.stripFrontmatter(head)).trim(),
  };
  propsCache.set(full, { mtimeMs, props });
  return props;
}

// ---------- A folder's hidden settings file (.opal.md) ----------
//
// Every folder can have a hidden `.opal.md` holding Opal's settings for it,
// as note properties (and folder-page stickies). Hidden files don't show in
// Finder or Obsidian, so setting a colour never adds a visible note.

const SETTINGS_FILE = '.opal.md';
const FOLDER_KEYS = ['opal-color', 'opal-file-colors', 'opal-order', 'description'];

function folderSettingsFull(relFolder) {
  return path.join(resolveFolderPath(relFolder || ''), SETTINGS_FILE);
}

async function readFolderSettings(relFolder) {
  try {
    return await fs.promises.readFile(folderSettingsFull(relFolder), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return '';
    throw err;
  }
}

async function writeFolderSettings(relFolder, text) {
  if (typeof text !== 'string') throw new Error('Invalid settings.');
  const full = folderSettingsFull(relFolder);
  // Nothing left in it: no file at all.
  if (!frontmatter.stripFrontmatter(text).trim() && !frontmatter.frontmatterRange(text)) {
    await fs.promises.rm(full, { force: true });
  } else {
    const temp = `${full}.opal-saving`;
    await fs.promises.writeFile(temp, text, 'utf8');
    await fs.promises.rename(temp, full);
  }
  scheduleRefresh(); // hidden files don't wake the folder watcher
}

// Changes a folder's settings; `change(text) → text`.
async function changeFolderSettings(relFolder, change) {
  await writeFolderSettings(relFolder, change(await readFolderSettings(relFolder)));
}

async function folderSettingsProps(relFolder) {
  const none = { color: null, fileColors: {}, order: [], description: '', wordTarget: null };
  let full;
  try {
    full = folderSettingsFull(relFolder);
  } catch {
    return none;
  }
  let stat;
  try {
    stat = await fs.promises.stat(full);
  } catch {
    return none;
  }
  const props = await noteProps(full, stat.mtimeMs);
  return { color: props.color, fileColors: props.fileColors || {}, order: props.order || [], description: props.description || '', wordTarget: props.wordTarget || null };
}

// Older vaults: moves Opal's settings out of a folder's own note (School/School.md)
// into its hidden .opal.md. A note that held nothing else goes to the Trash; one
// with your own writing keeps it and just loses Opal's lines.
async function migrateFolderNote(relFolder) {
  const name = relFolder ? path.posix.basename(relFolder) : path.basename(vaultPath);
  const notePath = joinRel(relFolder, `${name}.md`);
  let noteText;
  try {
    noteText = await readNote(notePath);
  } catch {
    return false;
  }
  const keys = FOLDER_KEYS.filter((k) => frontmatter.getProp(noteText, k) != null);
  const stickies = parseStickies(noteText);
  if (!keys.length && !stickies.length) return false;

  let settings = await readFolderSettings(relFolder);
  let rest = noteText;
  for (const key of keys) {
    const raw = rawProp(noteText, key);
    if (frontmatter.getProp(settings, key) == null) settings = frontmatter.setProp(settings, key, raw);
    rest = frontmatter.setProp(rest, key, null);
  }
  if (stickies.length) {
    if (!parseStickies(settings).length) settings = writeStickies(settings, stickies);
    rest = writeStickies(rest, []);
  }
  await writeFolderSettings(relFolder, settings);
  if (!rest.trim()) {
    await shell.trashItem(resolveNotePath(notePath));
  } else {
    await writeNote(notePath, rest);
  }
  return true;
}

// A property's value exactly as written (keeps quotes, e.g. on descriptions).
function rawProp(text, key) {
  const match = new RegExp(`^${key}:\\s?(.*)$`, 'm').exec(text.slice(0, text.indexOf('\n---', 3) + 1 || text.length));
  return match ? match[1].trim() : frontmatter.getProp(text, key);
}

// Once per vault opening: tidy every folder's old settings note away.
async function migrateVault() {
  if (!vaultPath) return;
  const folders = [''];
  const walk = (nodes) => nodes.forEach((n) => {
    if (n.type === 'folder') {
      folders.push(n.path);
      walk(n.children);
    }
  });
  walk(await scanFolder(''));
  let moved = 0;
  for (const folder of folders) {
    try {
      if (await migrateFolderNote(folder)) moved++;
    } catch (err) {
      console.error(`Could not move the settings for ${folder || 'the vault'}:`, err);
    }
  }
  if (moved) scheduleRefresh();
}

// ---------- Colours ----------

// Sets the colour of a folder or file (null = back to the default).
// Notes keep it in their own properties; folders in their folder note
// (created if needed); other files in their folder's note.
async function setColor(relPath, kind, color) {
  if (color !== null && !frontmatter.validColor(color)) throw new Error('Unknown colour.');
  if (kind === 'folder') {
    await changeFolderSettings(relPath, (text) => frontmatter.setProp(text, 'opal-color', color));
    return relPath;
  }
  if (!isNoteFile(relPath)) {
    resolveVaultFile(relPath);
    const folder = relPath.includes('/') ? relPath.slice(0, relPath.lastIndexOf('/')) : '';
    await changeFolderSettings(folder, (text) => frontmatter.setFileColor(text, path.posix.basename(relPath), color));
    return relPath;
  }
  let text = '';
  try {
    text = await readNote(relPath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  await writeNote(relPath, frontmatter.setProp(text, 'opal-color', color));
  scheduleRefresh(); // Opal's own save isn't picked up by the watcher
  return relPath;
}

// ---------- Rearranging ----------

// Saves a folder's own order for its items (names, in order).
async function setOrder(relFolder, names) {
  if (!Array.isArray(names) || names.some((n) => typeof n !== 'string')) throw new Error('Invalid order.');
  await changeFolderSettings(relFolder, (text) => frontmatter.setItemOrder(text, names.slice(0, 500)));
}

// The line under a note's or folder's title (empty = none). Folders keep it
// in their hidden .opal.md, like their colour.
async function setDescription(relPath, kind, text) {
  if (typeof text !== 'string') throw new Error('Invalid description.');
  if (kind === 'folder') {
    await changeFolderSettings(relPath, (current) => frontmatter.setDescription(current, text));
    return relPath;
  }
  const notePath = relPath;
  if (!isNoteFile(relPath)) {
    throw new Error('Only notes and folders have descriptions.');
  }
  let current = '';
  try {
    current = await readNote(notePath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const next = frontmatter.setDescription(current, text);
  if (next !== current) await writeNote(notePath, next);
  scheduleRefresh();
  return notePath;
}

// Moves a page, file or folder into another folder. Never a folder into itself.
async function moveItemOnly(relPath, kind, destFolder) {
  const full = kind === 'folder' ? resolveSubfolder(relPath) : resolveVaultFile(relPath);
  const destFull = resolveFolderPath(destFolder || '');
  if (kind === 'folder' && (destFolder === relPath || (destFolder || '').startsWith(`${relPath}/`))) {
    throw new Error("A folder can't go inside itself.");
  }
  const name = path.basename(full);
  const newRel = joinRel(destFolder || '', name);
  if (path.dirname(full) === destFull) return relPath; // already there
  if (fs.existsSync(path.join(destFull, name))) throw new Error(`There's already something called “${name}” in that folder.`);
  await fs.promises.rename(full, path.join(destFull, name));
  scheduleRefresh();
  return newRel;
}

// A short plain-text preview of a note, for cards: skips front matter and
// headings, strips markdown symbols.
async function notePreview(relPath) {
  const handle = await fs.promises.open(resolveNotePath(relPath), 'r');
  try {
    const buffer = Buffer.alloc(6000);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    let text = buffer.toString('utf8', 0, bytesRead).replace(/�+$/, '');
    text = text.replace(/^---\n[\s\S]*?\n---\n?/, '');
    text = text.replace(/<!--[\s\S]*?(-->|$)/g, ' ');
    // HTML (like tables) shows as its words only.
    text = text.replace(/<\/(td|th)>/gi, ' · ').replace(/<[^>]*(>|$)/g, ' ');
    return text
      .split('\n')
      .filter((line) => line.trim() && !/^\s*#/.test(line))
      .join(' ')
      .replace(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`>~]|^\s*[-+]\s|\s[-+]\s(?=\S)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 260);
  } finally {
    await handle.close();
  }
}

async function notePreviews(relPaths) {
  if (!Array.isArray(relPaths)) throw new Error('Invalid list.');
  const result = {};
  await Promise.all(relPaths.slice(0, 100).map(async (p) => {
    try {
      result[p] = await notePreview(p);
    } catch {
      result[p] = '';
    }
  }));
  return result;
}

// Watches the vault for changes made outside Opal and tells the window to refresh.
let watcher = null;
let refreshTimer = null;

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (win) win.webContents.send('vault:files-changed');
  }, 200);
}

function watchVault() {
  if (watcher) watcher.close();
  watcher = null;
  if (!vaultPath) return;
  try {
    watcher = fs.watch(vaultPath, { recursive: true }, (_event, filename) => {
      if (filename && filename.split(path.sep).some(isHidden)) return;
      if (filename && isOwnWrite(path.join(vaultPath, filename))) return;
      scheduleRefresh();
    });
    watcher.on('error', (err) => {
      // Usually means the vault folder itself was moved or deleted: let the window find out.
      console.error('Vault watcher error:', err);
      if (win) win.webContents.send('vault:files-changed');
    });
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
// Refuses anything outside the vault, hidden, or of an unknown type.
function resolveVaultFile(relPath) {
  if (!vaultPath) throw new Error('No vault is open.');
  if (typeof relPath !== 'string') throw new Error('Invalid path.');
  const full = path.resolve(vaultPath, relPath);
  if (!full.startsWith(vaultPath + path.sep)) throw new Error('That path is outside the vault.');
  if (path.relative(vaultPath, full).split(path.sep).some(isHidden)) throw new Error('That path is hidden.');
  if (!isKnownFile(full)) throw new Error('Opal does not open that kind of file.');
  return full;
}

// The same, but only for notes (the only files Opal ever writes).
function resolveNotePath(relPath) {
  const full = resolveVaultFile(relPath);
  if (!isNoteFile(full)) throw new Error('That is not a note file.');
  return full;
}

// ---------- Serving files to viewers ----------

// Viewers (PDF, images, media, Office files) load vault files from
// opal-file://vault/<path>. This only ever hands out known file types from
// inside the vault; anything else gets "not found".
protocol.registerSchemesAsPrivileged([
  { scheme: 'opal-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function serveVaultFile(request) {
  try {
    const url = new URL(request.url);
    const relPath = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    const full = resolveVaultFile(relPath);
    return net.fetch(pathToFileURL(full).toString(), { headers: request.headers });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

// Renames a note in place (same folder). Returns its new path.
async function renameNoteOnly(relPath, newName) {
  const full = resolveNotePath(relPath);
  const fileName = `${safeFileName(String(newName).replace(/\.md$/i, ''))}.md`;
  const folder = relPath.includes('/') ? relPath.slice(0, relPath.lastIndexOf('/')) : '';
  const newRel = joinRel(folder, fileName);
  const newFull = resolveNotePath(newRel);
  if (newFull.toLowerCase() !== full.toLowerCase() && fs.existsSync(newFull)) {
    throw new Error(`There's already a note called “${fileName.slice(0, -3)}” there.`);
  }
  await fs.promises.rename(full, newFull);
  scheduleRefresh();
  return newRel;
}

// Renames any vault file, keeping its extension (notes: see renameNote).
async function renameFileOnly(relPath, newName) {
  if (isNoteFile(relPath)) return renameNoteOnly(relPath, newName);
  const full = resolveVaultFile(relPath);
  const ext = path.extname(full);
  const base = safeFileName(String(newName).replace(new RegExp(`${ext.replace('.', '\\.')}$`, 'i'), ''));
  const folder = relPath.includes('/') ? relPath.slice(0, relPath.lastIndexOf('/')) : '';
  const newRel = joinRel(folder, `${base}${ext}`);
  const newFull = resolveVaultFile(newRel);
  if (newFull.toLowerCase() !== full.toLowerCase() && fs.existsSync(newFull)) throw new Error(`There's already a file called “${base}${ext}” there.`);
  await fs.promises.rename(full, newFull);
  scheduleRefresh();
  return newRel;
}

// Moves any vault file to the Mac's Trash (recoverable from there).
async function trashFile(relPath) {
  await shell.trashItem(resolveVaultFile(relPath));
  scheduleRefresh();
}

// Folders: rename, move to the Trash, show in Finder. Never the vault itself.
function resolveSubfolder(relFolder) {
  if (!relFolder) throw new Error("That's the vault itself.");
  const full = resolveFolderPath(relFolder);
  if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) throw new Error('That folder no longer exists.');
  return full;
}

async function renameFolderOnly(relFolder, newName) {
  const full = resolveSubfolder(relFolder);
  const name = safeFileName(String(newName));
  const parent = relFolder.includes('/') ? relFolder.slice(0, relFolder.lastIndexOf('/')) : '';
  const newRel = joinRel(parent, name);
  const newFull = resolveFolderPath(newRel);
  if (newFull.toLowerCase() !== full.toLowerCase() && fs.existsSync(newFull)) throw new Error(`There's already a folder called “${name}” there.`);
  await fs.promises.rename(full, newFull);
  scheduleRefresh();
  return newRel;
}

async function trashFolder(relFolder) {
  await shell.trashItem(resolveSubfolder(relFolder));
  scheduleRefresh();
}

function revealFolder(relFolder) {
  shell.showItemInFolder(relFolder ? resolveSubfolder(relFolder) : resolveFolderPath(''));
}

// ---------- Keeping links working after a rename or move ----------

const RELINK_MAX_BYTES = 2 * 1024 * 1024;

// Runs a rename/move, then points every link in the vault at the new place.
async function withRelink(relPath, kind, change) {
  const before = listNotePaths(await scanFolder(''));
  const newRel = await change();
  if (newRel === relPath) return newRel;
  const moves = kind === 'folder'
    ? before.filter((p) => p.startsWith(`${relPath}/`)).map((p) => ({ from: p, to: newRel + p.slice(relPath.length) }))
    : [{ from: relPath, to: newRel }];
  try {
    await relinkVault(before, moves);
  } catch (err) {
    console.error('Could not update links:', err); // the rename itself still worked
  }
  try {
    if (kind === 'folder' || isNoteFile(relPath)) await moveHistory(relPath, newRel);
  } catch (err) {
    console.error('Could not move the version history:', err);
  }
  try {
    await moveBookmarks(relPath, newRel, kind === 'folder');
  } catch (err) {
    console.error('Could not update bookmarks:', err);
  }
  return newRel;
}

async function relinkVault(before, moves) {
  const moved = new Map(moves.map((m) => [m.from, m.to]));
  const after = before.map((p) => moved.get(p) || p);
  let count = 0;
  for (let i = 0; i < before.length; i++) {
    if (!isNoteFile(after[i])) continue;
    const full = path.join(vaultPath, after[i]);
    try {
      const stat = await fs.promises.stat(full);
      if (stat.size > RELINK_MAX_BYTES) continue;
      const text = await fs.promises.readFile(full, 'utf8');
      if (!text.includes('[[') && !text.includes('](')) continue;
      const next = relinkText(text, { oldPath: before[i], newPath: after[i], moves, before, after });
      if (next === text) continue;
      // Written like any outside edit, so an open note picks up the change.
      const temp = path.join(path.dirname(full), `.${path.basename(full)}.opal-saving`);
      await fs.promises.writeFile(temp, next, 'utf8');
      await fs.promises.rename(temp, full);
      count++;
    } catch (err) {
      console.error(`Could not update links in ${after[i]}:`, err);
    }
  }
  if (count) scheduleRefresh();
  return count;
}

function renameNote(relPath, newName) {
  return withRelink(relPath, 'file', () => renameNoteOnly(relPath, newName));
}

function renameFile(relPath, newName) {
  return withRelink(relPath, 'file', () => renameFileOnly(relPath, newName));
}

function renameFolder(relFolder, newName) {
  return withRelink(relFolder, 'folder', () => renameFolderOnly(relFolder, newName));
}

function moveItem(relPath, kind, destFolder) {
  return withRelink(relPath, kind === 'folder' ? 'folder' : 'file', () => moveItemOnly(relPath, kind, destFolder));
}

// Moves a note to the Mac's Trash (recoverable from there).
async function trashNote(relPath) {
  await shell.trashItem(resolveNotePath(relPath));
  scheduleRefresh();
}

// Opens a vault file in its usual Mac app (e.g. Preview, Word). Only known
// file types, so this can never be used to launch a program.
async function openInDefaultApp(relPath) {
  const problem = await shell.openPath(resolveVaultFile(relPath));
  if (problem) throw new Error(problem);
}

// Whole-file read for viewers that need the bytes (PDF, Word, Excel, PowerPoint).
// PDFs (often big scans) get a higher limit than Office files.
const MAX_VIEW_BYTES = 60 * 1024 * 1024;
const MAX_PDF_BYTES = 300 * 1024 * 1024;

async function readFileBytes(relPath) {
  const full = resolveVaultFile(relPath);
  if (isNoteFile(full)) throw new Error('Notes are read as text.');
  const { size } = await fs.promises.stat(full);
  const limit = path.extname(full).toLowerCase() === '.pdf' ? MAX_PDF_BYTES : MAX_VIEW_BYTES;
  if (size > limit) throw new Error('This file is too big to preview here.');
  return fs.promises.readFile(full);
}

function revealInFinder(relPath) {
  shell.showItemInFolder(resolveVaultFile(relPath));
}

// Refuses files that aren't valid UTF-8 text: editing and saving them would
// garble them. (A byte-order mark, if present, is kept as-is.)
async function readNote(relPath) {
  const bytes = await fs.promises.readFile(resolveNotePath(relPath));
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error("This file isn't plain UTF-8 text, so Opal won't open it for editing — saving could damage it.");
  }
}

// Writes to a hidden temp file first, then swaps it in, so a crash mid-save
// can never leave a half-written note.
async function writeNote(relPath, content) {
  if (typeof content !== 'string') throw new Error('Invalid content.');
  const full = resolveNotePath(relPath);
  const existed = fs.existsSync(full);
  const temp = path.join(path.dirname(full), `.${path.basename(full)}.opal-saving`);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  await fs.promises.writeFile(temp, content, 'utf8');
  await fs.promises.rename(temp, full);
  // Only overwrites are "our own save". A brand-new file must always be
  // noticed so it shows up in the sidebar.
  if (existed) {
    const { mtimeMs, size } = await fs.promises.stat(full);
    ownWrites.set(full, { mtimeMs, size });
  } else {
    ownWrites.delete(full);
  }
}

// Notes Opal itself just saved, with the exact modified time and size they
// had afterwards. The folder watcher ignores a change only if the file is
// still exactly that — so an autosave doesn't rescan the vault, but an edit
// from another app is always noticed, however soon after a save it happens.
const ownWrites = new Map();

function isOwnWrite(fullPath) {
  const written = ownWrites.get(fullPath);
  if (!written) return false;
  try {
    const now = fs.statSync(fullPath);
    if (now.mtimeMs === written.mtimeMs && now.size === written.size) return true;
  } catch {
    // Gone or unreadable: definitely not just our save.
  }
  ownWrites.delete(fullPath);
  return false;
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
// Long names are cut to 180 characters (macOS allows about 255 bytes).
function safeFileName(name) {
  const clean = name.replace(/[\\/:*?"<>|]/g, '-').replace(/^\.+/, '').trim();
  return Array.from(clean).slice(0, 180).join('').trim() || 'Untitled';
}

// Finds the note a [[link]] points to, or creates it in the vault root.
// Returns the note's vault-relative path.
// With create = false, a missing note gives null instead of being made.
async function resolveLink(rawTarget, create = true) {
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

  if (!create) return null;

  // 3. Not found: create it in the vault root — but only notes. A missing
  //    [[photo.png]] can't be made up, so say so instead.
  const ext = path.extname(target).toLowerCase();
  if (ext && !NOTE_EXTENSIONS.includes(ext) && KNOWN_EXTENSIONS.includes(ext)) {
    throw new Error(`There's no file called “${target}” in this vault.`);
  }
  return createNote(target);
}

// Web and email links from notes open in the Mac's own browser / mail app.
// Only http(s) and mailto are allowed, so a note can't launch anything else.
async function openWebLink(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    throw new Error("That isn't a web address.");
  }
  if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) throw new Error('Opal only opens web (http/https) and email links.');
  await shell.openExternal(parsed.href);
  return true;
}

// Turns a vault-relative folder path from the window into a full path ('' = vault root).
function resolveFolderPath(relFolder) {
  if (!vaultPath) throw new Error('No vault is open.');
  if (!relFolder) return vaultPath;
  if (typeof relFolder !== 'string') throw new Error('Invalid folder.');
  const full = path.resolve(vaultPath, relFolder);
  if (!full.startsWith(vaultPath + path.sep)) throw new Error('That folder is outside the vault.');
  if (path.relative(vaultPath, full).split(path.sep).some(isHidden)) throw new Error('That folder is hidden.');
  return full;
}

function joinRel(relFolder, name) {
  return relFolder ? `${relFolder}/${name}` : name;
}

// ---------- Templates ----------
//
// Notes in the vault's Templates folder are templates. {{title}}, {{date}} and
// {{time}} (and {{date:DD/MM/YYYY}}-style formats) are filled in, as in
// Obsidian's Templates plugin. A folder's default template is `opal-template`
// in its .opal.md; daily notes use the Calendar folder's.

const TEMPLATES_FOLDER = 'Templates';

async function listTemplates() {
  try {
    return listNotePaths(await scanFolder(TEMPLATES_FOLDER)).filter(isNoteFile);
  } catch {
    return [];
  }
}

function validTemplate(relPath) {
  return typeof relPath === 'string' && relPath.startsWith(`${TEMPLATES_FOLDER}/`) && isNoteFile(relPath) && !relPath.includes('..');
}

async function folderTemplate(relFolder) {
  const value = frontmatter.getProp(await readFolderSettings(relFolder || ''), 'opal-template');
  return validTemplate(value) && fs.existsSync(path.join(vaultPath, value)) ? value : null;
}

async function templateInfo(relFolder) {
  return { templates: await listTemplates(), default: await folderTemplate(relFolder) };
}

async function setFolderTemplate(relFolder, templatePath) {
  if (templatePath != null && !validTemplate(templatePath)) throw new Error('Templates live in the Templates folder.');
  await changeFolderSettings(relFolder || '', (text) => frontmatter.setProp(text, 'opal-template', templatePath ? JSON.stringify(templatePath) : null));
}

// Moment-style date formats (the common ones Obsidian templates use).
function formatDate(date, format) {
  const two = (n) => String(n).padStart(2, '0');
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const h12 = date.getHours() % 12 || 12;
  const tokens = {
    YYYY: String(date.getFullYear()), YY: String(date.getFullYear()).slice(-2),
    MMMM: months[date.getMonth()], MMM: months[date.getMonth()].slice(0, 3), MM: two(date.getMonth() + 1), M: String(date.getMonth() + 1),
    DD: two(date.getDate()), D: String(date.getDate()),
    dddd: days[date.getDay()], ddd: days[date.getDay()].slice(0, 3),
    HH: two(date.getHours()), H: String(date.getHours()), hh: two(h12), h: String(h12),
    mm: two(date.getMinutes()), ss: two(date.getSeconds()), A: date.getHours() < 12 ? 'AM' : 'PM',
  };
  return format.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|ss|A/g, (m, literal) => (literal !== undefined ? literal : tokens[m]));
}

function fillTemplate(text, title, when = new Date()) {
  return text
    .replace(/\{\{\s*title\s*\}\}/gi, title)
    .replace(/\{\{\s*date(?::([^}]+))?\s*\}\}/gi, (_m, format) => formatDate(when, (format || 'YYYY-MM-DD').trim()))
    .replace(/\{\{\s*time(?::([^}]+))?\s*\}\}/gi, (_m, format) => formatDate(when, (format || 'HH:mm').trim()));
}

// A template's text filled in for an existing note (applying a template to it).
async function filledTemplate(templatePath, notePath) {
  if (!validTemplate(templatePath)) throw new Error('Templates live in the Templates folder.');
  const title = path.basename(String(notePath || ''), '.md');
  return fillTemplate(stripStickies(await readNote(templatePath)), title, new Date());
}

// Creates a note in a folder (default: the vault root) and returns its path.
// If a note with that name is already there, it is left untouched ('wx' never overwrites).
// template: a Templates/… path, 'default' for the folder's default, or nothing (blank).
async function createNote(rawName, relFolder = '', template = null) {
  const folderFull = resolveFolderPath(relFolder);
  const fileName = `${safeFileName(String(rawName).replace(/\.md$/i, ''))}.md`;
  const relPath = joinRel(relFolder, fileName);
  // macOS ignores case, so "idea" and "Idea" are the same file: reuse the real spelling.
  const wanted = normalizeName(fileName);
  const existing = (await fs.promises.readdir(folderFull)).find((n) => isNoteFile(n) && normalizeName(n) === wanted);
  if (existing) return joinRel(relFolder, existing);
  let content = '';
  const templatePath = template === 'default' ? await folderTemplate(relFolder) : (validTemplate(template) ? template : null);
  if (templatePath) {
    try {
      // A daily note (named YYYY-MM-DD) uses its own day for {{date}}, as in
      // Obsidian's Daily notes plugin.
      const title = fileName.replace(/\.md$/i, '');
      const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(title);
      const now = new Date();
      const when = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), now.getHours(), now.getMinutes()) : now;
      content = fillTemplate(stripStickies(await readNote(templatePath)), title, when);
    } catch {
      content = ''; // the template has gone: a blank note instead
    }
  }
  try {
    await fs.promises.writeFile(resolveNotePath(relPath), content, { flag: 'wx' });
    scheduleRefresh(); // don't rely on the watcher: a quick save could hide the new file from it
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
  return relPath;
}

// Creates a folder inside another (default: the vault root) and returns its path.
async function createFolder(rawName, relParent = '') {
  const parentFull = resolveFolderPath(relParent);
  const name = safeFileName(String(rawName));
  const relPath = joinRel(relParent, name);
  resolveFolderPath(relPath);
  try {
    await fs.promises.mkdir(path.join(parentFull, name));
    scheduleRefresh();
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
  return relPath;
}

// ---------- Look ----------

const PALETTES = ['Riso', 'Sorbet', 'Field notes', 'Metro', 'Postcard', 'Scrapbook'];

function getPalette() {
  const saved = loadSettings().palette;
  return PALETTES.includes(saved) ? saved : 'Riso';
}

function setPalette(name) {
  if (!PALETTES.includes(name)) throw new Error('Unknown palette.');
  saveSettings({ ...loadSettings(), palette: name });
  return name;
}

// The theme (Scrapbook, Minimal or GitHub) and light / dark / match the Mac.
const THEMES = ['scrapbook', 'minimal', 'github'];
const MODES = ['light', 'dark', 'auto'];

function getLook() {
  const { theme, mode } = loadSettings();
  return { theme: THEMES.includes(theme) ? theme : 'scrapbook', mode: MODES.includes(mode) ? mode : 'light' };
}

function setLook(look) {
  const next = { ...getLook(), ...(look || {}) };
  if (!THEMES.includes(next.theme) || !MODES.includes(next.mode)) throw new Error('Unknown theme.');
  saveSettings({ ...loadSettings(), theme: next.theme, mode: next.mode });
  applyNativeTheme(next);
  return next;
}

// Window frame, scroll bars and menus follow the chosen mode (Scrapbook is always light).
function applyNativeTheme({ theme, mode }) {
  nativeTheme.themeSource = theme === 'scrapbook' || mode === 'light' ? 'light' : mode === 'dark' ? 'dark' : 'system';
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

// ---------- Search ----------
// Looks through every note's text for the query. Notes are read from disk and
// remembered in memory only (until they change), never stored anywhere else.

const searchCache = new Map(); // full path → { mtimeMs, text }
const SEARCH_MAX_BYTES = 5 * 1024 * 1024;

async function listNotes(relFolder = '', out = []) {
  let entries;
  try {
    entries = await fs.promises.readdir(path.join(vaultPath, relFolder), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (isHidden(entry.name)) continue;
    const relPath = relFolder ? `${relFolder}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await listNotes(relPath, out);
    else if (entry.isFile() && isNoteFile(entry.name)) out.push(relPath);
  }
  return out;
}

async function noteText(relPath) {
  const full = path.join(vaultPath, relPath);
  const stat = await fs.promises.stat(full);
  if (stat.size > SEARCH_MAX_BYTES) return '';
  const cached = searchCache.get(full);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.text;
  const text = new TextDecoder('utf-8').decode(await fs.promises.readFile(full));
  searchCache.set(full, { mtimeMs: stat.mtimeMs, text });
  return text;
}

// → [{ path, count, matches: [{ line (1-based), text, at, length }] }], best first.
async function searchVault(query) {
  if (!vaultPath || typeof query !== 'string') return [];
  const needle = query.trim().toLowerCase().slice(0, 200);
  if (needle.length < 2) return [];
  const results = [];
  for (const relPath of await listNotes()) {
    let text;
    try {
      text = await noteText(relPath);
    } catch {
      continue;
    }
    // Sticky notes' hidden data isn't searched, and table lines are searched
    // (and shown) as their words, without the HTML around them.
    text = stripStickies(text);
    const lower = text.toLowerCase();
    if (!lower.includes(needle)) continue;
    const lines = text.split(/\r?\n/);
    const matches = [];
    let count = 0;
    lines.forEach((raw, index) => {
      const isHtml = /<\/?(table|tr|td|th|colgroup|col)\b/i.test(raw);
      const line = isHtml ? raw.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() : raw;
      let at = line.toLowerCase().indexOf(needle);
      if (at === -1) return;
      if (matches.length < 3) {
        // A window of the line around the match, so long lines stay readable.
        const from = Math.max(0, at - 50);
        const snippet = line.slice(from, at + needle.length + 90);
        matches.push({ line: index + 1, text: (from ? '…' : '') + snippet, at: at - from + (from ? 1 : 0), length: isHtml ? 0 : needle.length, column: isHtml ? 0 : at });
      }
      while (at !== -1) {
        count++;
        at = line.toLowerCase().indexOf(needle, at + needle.length);
      }
    });
    results.push({ path: relPath, count, matches });
  }
  return results.sort((a, b) => b.count - a.count || a.path.localeCompare(b.path)).slice(0, 60);
}

// ---------- Version history (.opal/history) ----------
//
// Snapshots of a note are plain copies in the vault's hidden .opal folder:
//   .opal/history/<note path without .md>/<YYYY-MM-DD HH-mm-ss>.md
// While editing, at most one every 10 minutes (plus one when leaving the
// note). Everything is kept for 7 days, then the last of each day for 90.

const HISTORY_GAP_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function historyDir(relPath) {
  resolveNotePath(relPath); // inside the vault, and a note
  return path.join(vaultPath, '.opal', 'history', ...relPath.replace(/\.md$/i, '').split('/'));
}

function snapshotId(date) {
  const two = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}-${two(date.getMinutes())}-${two(date.getSeconds())}`;
}

function idTime(id) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2})-(\d{2})-(\d{2})/.exec(id);
  return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : 0;
}

async function snapshotIds(relPath) {
  try {
    const names = await fs.promises.readdir(historyDir(relPath));
    return names.filter((n) => /^\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}( \d+)?\.md$/.test(n)).map((n) => n.slice(0, -3)).sort().reverse();
  } catch {
    return [];
  }
}

// Saves a snapshot. reason: 'auto' (skipped if one was made in the last 10
// minutes), 'leave' or 'restore' (always). Never saves a copy identical to the last.
async function saveSnapshot(relPath, text, reason = 'auto') {
  if (!vaultPath || typeof text !== 'string') return false;
  const dir = historyDir(relPath);
  const ids = await snapshotIds(relPath);
  if (ids.length) {
    if (reason === 'auto' && Date.now() - idTime(ids[0]) < HISTORY_GAP_MS) return false;
    try {
      if ((await fs.promises.readFile(path.join(dir, `${ids[0]}.md`), 'utf8')) === text) return false;
    } catch {
      // Unreadable: just save a new one.
    }
  }
  await fs.promises.mkdir(dir, { recursive: true });
  let id = snapshotId(new Date());
  for (let n = 2; fs.existsSync(path.join(dir, `${id}.md`)); n++) id = `${snapshotId(new Date())} ${n}`;
  await fs.promises.writeFile(path.join(dir, `${id}.md`), text, 'utf8');
  await pruneSnapshots(relPath);
  return true;
}

async function pruneSnapshots(relPath) {
  const dir = historyDir(relPath);
  const now = Date.now();
  const keptDays = new Set();
  for (const id of await snapshotIds(relPath)) { // newest first
    const age = now - idTime(id);
    let keep = age <= 7 * DAY_MS;
    if (!keep && age <= 90 * DAY_MS) {
      const day = id.slice(0, 10);
      keep = !keptDays.has(day); // the newest of each day
      keptDays.add(day);
    }
    if (!keep) await fs.promises.rm(path.join(dir, `${id}.md`), { force: true });
  }
}

async function listSnapshots(relPath) {
  const dir = historyDir(relPath);
  await pruneSnapshots(relPath);
  const out = [];
  for (const id of await snapshotIds(relPath)) {
    try {
      const { size } = await fs.promises.stat(path.join(dir, `${id}.md`));
      out.push({ id, time: idTime(id), size });
    } catch {
      // Gone meanwhile.
    }
  }
  return out;
}

async function readSnapshot(relPath, id) {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}( \d+)?$/.test(String(id))) throw new Error('No such snapshot.');
  return fs.promises.readFile(path.join(historyDir(relPath), `${id}.md`), 'utf8');
}

// A note or folder was renamed or moved: its history goes with it.
async function moveHistory(fromRel, toRel) {
  if (!vaultPath) return;
  const base = path.join(vaultPath, '.opal', 'history');
  const from = path.join(base, ...fromRel.replace(/\.md$/i, '').split('/'));
  const to = path.join(base, ...toRel.replace(/\.md$/i, '').split('/'));
  if (!fs.existsSync(from) || fs.existsSync(to)) return;
  await fs.promises.mkdir(path.dirname(to), { recursive: true });
  await fs.promises.rename(from, to);
}

// ---------- Bookmarks (.obsidian/bookmarks.json) ----------
//
// Kept in the same file, and the same format, as Obsidian's Bookmarks plugin,
// so bookmarks made in either app show in both:
//   { "items": [ { "type": "file", "ctime": 1727…, "path": "School/Essay plan.md", "title": "…" },
//                { "type": "folder", "path": "School" },
//                { "type": "group", "title": "Exams", "items": [ … ] }, … ] }
// Anything Opal doesn't show (searches, graph views…) is kept as it was.

function bookmarksFile() {
  if (!vaultPath) throw new Error('No vault is open.');
  return path.join(vaultPath, '.obsidian', 'bookmarks.json');
}

async function readBookmarks() {
  try {
    const data = JSON.parse(await fs.promises.readFile(bookmarksFile(), 'utf8'));
    return data && Array.isArray(data.items) ? data : { items: [] };
  } catch {
    return { items: [] };
  }
}

let bookmarksQueue = Promise.resolve();
function writeBookmarks(data) {
  if (!data || !Array.isArray(data.items)) return Promise.reject(new Error('Invalid bookmarks.'));
  const text = `${JSON.stringify(data, null, 2)}\n`;
  if (text.length > 2000000) return Promise.reject(new Error('Too many bookmarks to save.'));
  const run = bookmarksQueue.then(async () => {
    const full = bookmarksFile();
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    const temp = `${full}.opal-saving`;
    await fs.promises.writeFile(temp, text, 'utf8');
    await fs.promises.rename(temp, full);
  });
  bookmarksQueue = run.catch(() => {});
  return run;
}

// A note, file or folder was renamed or moved: its bookmarks (and those of
// everything inside a moved folder) follow it, as in Obsidian.
async function moveBookmarks(fromRel, toRel, isFolder) {
  if (!vaultPath || fromRel === toRel || !fs.existsSync(bookmarksFile())) return;
  const data = await readBookmarks();
  let changed = false;
  const walk = (items) => {
    for (const item of items) {
      if (item && item.type === 'group' && Array.isArray(item.items)) walk(item.items);
      if (!item || typeof item.path !== 'string') continue;
      if (item.path === fromRel) {
        item.path = toRel;
        changed = true;
      } else if (isFolder && item.path.startsWith(`${fromRel}/`)) {
        item.path = toRel + item.path.slice(fromRel.length);
        changed = true;
      }
    }
  };
  walk(data.items);
  if (changed) await writeBookmarks(data);
}

// ---------- Heatmaps from notes (Tracker blocks — see shared/tracker.js) ----------

// A tracker block's numbers: { settings, days: { 'YYYY-MM-DD': value }, notes: { day: [paths] } }.
async function trackerData(source) {
  if (!vaultPath) throw new Error('No vault is open.');
  const settings = tracker.trackerSettings(tracker.parseTracker(String(source || '').slice(0, 5000)));
  if (settings.folder.includes('..')) throw new Error('The folder must be inside the vault.');
  if (settings.folder && !fs.existsSync(path.join(vaultPath, settings.folder))) throw new Error(`There's no folder “${settings.folder}” in this vault.`);
  const days = {};
  const notes = {};
  for (const relPath of await listNotes(settings.folder)) {
    const name = path.basename(relPath, path.extname(relPath));
    let text;
    try {
      text = await fs.promises.readFile(path.join(vaultPath, relPath), 'utf8');
    } catch {
      continue;
    }
    if (/^```tracker\b/m.test(text) && !settings.dateProperty && !tracker.dateFromName(name, settings.dateFormat)) continue;
    const props = readProperties(text);
    const day = tracker.noteDate(name, props, settings);
    if (!day) continue;
    if ((settings.startDate && day < settings.startDate) || (settings.endDate && day > settings.endDate)) continue;
    const value = tracker.noteValue(text, props, settings, settings.searchType === 'fileMeta' ? countWords(text) : 0);
    if (value == null || value === 0) continue;
    days[day] = Math.round(((days[day] || 0) + value) * 100) / 100;
    (notes[day] = notes[day] || []).push(relPath);
  }
  return { settings, days, notes };
}

// Notes with a tracker block (for the home page's Heatmap widget): [{ path, title }].
async function trackerNotes() {
  const out = [];
  for (const relPath of await listNotes('')) {
    let text;
    try {
      text = await fs.promises.readFile(path.join(vaultPath, relPath), 'utf8');
    } catch {
      continue;
    }
    const m = /^```tracker[ \t]*\r?\n([\s\S]*?)^```/m.exec(text);
    if (m) out.push({ path: relPath, title: tracker.trackerSettings(tracker.parseTracker(m[1])).title, source: m[1] });
  }
  return out;
}

// ---------- Words and the Logbook's own records (.opal/logbook.md) ----------
//
// Words written per day and prep-timer sessions, as a readable note:
//   ## Words written
//   - 2026-09-29: 532
//   ## Prep sessions
//   - 2026-09-29 14:00 · 30 min · [[School/Essay plan]]
//   - 2026-09-29 15:00 · 25 min · pomodoro · [[School/Essay plan]]

function logbookFile() {
  return path.join(vaultPath, '.opal', 'logbook.md');
}

async function readLogbook() {
  const out = { words: {}, sessions: [] };
  let text = '';
  try {
    text = await fs.promises.readFile(logbookFile(), 'utf8');
  } catch {
    return out;
  }
  for (const line of text.split(/\r?\n/)) {
    let m = /^- (\d{4}-\d{2}-\d{2}): (\d+)\s*$/.exec(line);
    if (m) out.words[m[1]] = Number(m[2]);
    m = /^- (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) · (\d+) min(?: · (pomodoro))?(?: · \[\[([^\]]+)\]\])?\s*$/.exec(line);
    if (m) out.sessions.push({ day: m[1], time: m[2], minutes: Number(m[3]), kind: m[4] || null, note: m[5] || null });
  }
  return out;
}

async function writeLogbook(data) {
  const days = Object.keys(data.words).sort();
  const sessions = data.sessions.slice().sort((a, b) => `${a.day} ${a.time}`.localeCompare(`${b.day} ${b.time}`));
  const text = [
    '# Opal logbook',
    '',
    'Words written each day and timer sessions (prep and Pomodoro focus), kept by Opal.',
    '',
    '## Words written',
    ...days.map((d) => `- ${d}: ${data.words[d]}`),
    '',
    '## Prep sessions',
    ...sessions.map((s) => `- ${s.day} ${s.time} · ${s.minutes} min${s.kind === 'pomodoro' ? ' · pomodoro' : ''}${s.note ? ` · [[${s.note}]]` : ''}`),
    '',
  ].join('\n');
  await fs.promises.mkdir(path.dirname(logbookFile()), { recursive: true });
  const temp = `${logbookFile()}.opal-saving`;
  await fs.promises.writeFile(temp, text, 'utf8');
  await fs.promises.rename(temp, logbookFile());
}

let logbookQueue = Promise.resolve();
function changeLogbook(change) {
  const run = logbookQueue.then(async () => {
    const data = await readLogbook();
    change(data);
    await writeLogbook(data);
  });
  logbookQueue = run.catch(() => {});
  return run;
}

function addWords(day, count) {
  const n = Math.floor(Number(count));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day)) || !(n > 0) || n > 100000) return Promise.resolve();
  return changeLogbook((data) => { data.words[day] = (data.words[day] || 0) + n; });
}

function addSession(session) {
  const s = session || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s.day)) || !/^\d{2}:\d{2}$/.test(String(s.time))) return Promise.resolve();
  const minutes = Math.max(1, Math.min(24 * 60, Math.round(Number(s.minutes) || 0)));
  const note = typeof s.note === 'string' && s.note && !/[\]\[\n]/.test(s.note) ? s.note.replace(/\.md$/i, '') : null;
  const kind = s.kind === 'pomodoro' ? 'pomodoro' : null;
  return changeLogbook((data) => { data.sessions.push({ day: s.day, time: s.time, minutes, kind, note }); });
}

// ---------- Vault settings and open tabs (.opal/settings.json, .opal/workspace.json) ----------
//
// Settings that belong to this vault (timer lengths, …) and the tabs that were
// open, kept in the vault's hidden .opal folder — like Obsidian's
// .obsidian/workspace.json — so nothing lives outside the vault.

const OPAL_FILES = new Set(['settings.json', 'workspace.json']);

function opalFile(name) {
  if (!vaultPath) throw new Error('No vault is open.');
  if (!OPAL_FILES.has(name)) throw new Error('Unknown Opal file.');
  return path.join(vaultPath, '.opal', name);
}

async function readOpalJson(name) {
  try {
    const data = JSON.parse(await fs.promises.readFile(opalFile(name), 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

const opalJsonQueues = {};
function writeOpalJson(name, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return Promise.reject(new Error('Invalid settings.'));
  const text = `${JSON.stringify(data, null, 2)}\n`;
  if (text.length > 200000) return Promise.reject(new Error('Too much to save.'));
  const full = opalFile(name);
  const run = (opalJsonQueues[name] || Promise.resolve()).then(async () => {
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    const temp = `${full}.opal-saving`;
    await fs.promises.writeFile(temp, text, 'utf8');
    await fs.promises.rename(temp, full);
  });
  opalJsonQueues[name] = run.catch(() => {});
  return run;
}

// Total words in the notes of a folder (and the folders inside it).
async function folderWords(relFolder) {
  resolveFolderPath(relFolder || '');
  let total = 0;
  for (const notePath of await listNotes(relFolder || '')) {
    try {
      total += countWords(await noteText(notePath));
    } catch {
      // Skip unreadable notes.
    }
  }
  return total;
}

async function setFolderWordTarget(relFolder, target) {
  const n = wordTarget(target);
  await changeFolderSettings(relFolder || '', (text) => frontmatter.setProp(text, 'word-target', n ? String(n) : null));
}

// ---------- Folder databases ----------
//
// A folder shown as a database: each note in it is a row, each property a
// column. The settings (columns, views, sort, filter, group) are JSON in the
// folder's .opal.md as `opal-database`, with `opal-view: database`.

const DB_TYPES = ['text', 'number', 'date', 'checkbox', 'select', 'link'];

async function databaseRows(relFolder) {
  const folderFull = resolveFolderPath(relFolder || '');
  const folderName = relFolder ? path.posix.basename(relFolder) : path.basename(vaultPath);
  const rows = [];
  for (const entry of await fs.promises.readdir(folderFull, { withFileTypes: true })) {
    if (!entry.isFile() || isHidden(entry.name) || !isNoteFile(entry.name)) continue;
    if (entry.name.toLowerCase() === `${folderName.toLowerCase()}.md`) continue; // the folder's own note
    const relPath = joinRel(relFolder || '', entry.name);
    try {
      const stat = await fs.promises.stat(path.join(folderFull, entry.name));
      const props = readProperties(await noteText(relPath));
      for (const key of Object.keys(props)) if (key.startsWith('opal-')) delete props[key];
      rows.push({ path: relPath, name: entry.name.replace(/\.md$/i, ''), props, created: stat.birthtimeMs, modified: stat.mtimeMs });
    } catch {
      // Unreadable: leave it out this time.
    }
  }
  return rows;
}

async function setDatabaseCell(relPath, key, value, type) {
  if (typeof key !== 'string' || !/^[^:\n#][^:\n]*$/.test(key) || key.startsWith('opal-')) throw new Error('That column name can’t be a property.');
  if (!DB_TYPES.includes(type)) throw new Error('Unknown column type.');
  const text = await readNote(relPath);
  const next = writeProperty(text, key.trim(), value, type);
  if (next !== text) await writeNote(relPath, next); // the database redraws itself
  return true;
}

async function readDatabase(relFolder) {
  const text = await readFolderSettings(relFolder || '');
  let settings = null;
  try {
    settings = JSON.parse(frontmatter.getProp(text, 'opal-database') || 'null');
  } catch {
    settings = null;
  }
  return { on: frontmatter.getProp(text, 'opal-view') === 'database', settings };
}

async function writeDatabase(relFolder, on, settings) {
  const json = settings ? JSON.stringify(settings) : null;
  if (json && json.length > 200000) throw new Error('Those settings are too big.');
  await changeFolderSettings(relFolder || '', (text) => {
    let next = frontmatter.setProp(text, 'opal-view', on ? 'database' : null);
    if (settings !== undefined) next = frontmatter.setProp(next, 'opal-database', json);
    return next;
  });
}

// ---------- Flashcards (Obsidian Spaced Repetition plugin format) ----------
//
// A line "Question::Answer" is a card ("Question:::Answer" works both ways).
// Its review schedule is the plugin's hidden comment at the end of the line:
//   Capital of France::Paris <!--SR:!2026-10-04,3,250-->
// (next review date, interval in days, ease; a two-way card has two).
// Each folder is a deck; a note's tags make extra decks.

const CARD = /^(\s*(?:[-*+]\s+|\d+[.)]\s+)?)(.*?\S)\s*(:::|::)\s*(\S.*?)\s*(<!--SR:((?:![0-9-]+,\d+,\d+)+)-->)?\s*$/;

function parseCardLine(line) {
  if (!line.includes('::')) return null;
  const m = CARD.exec(line);
  if (!m) return null;
  // Not a card: "::" inside inline code, or a web address.
  if (/`[^`]*::[^`]*`/.test(line) || /\w+:\/\//.test(m[2] + m[3])) return null;
  const schedule = m[6] ? m[6].split('!').filter(Boolean).map((part) => {
    const [due, interval, ease] = part.split(',');
    return { due, interval: Number(interval), ease: Number(ease) };
  }) : [];
  return { prefix: m[1], question: m[2].trim(), answer: m[4].trim(), reversed: m[3] === ':::', schedule };
}

function tagsOf(text) {
  const tags = new Set();
  const props = readProperties(text);
  const list = props.tags || props.tag;
  for (const t of Array.isArray(list) ? list : String(list || '').split(/[,\s]+/)) if (t) tags.add(String(t).replace(/^#/, ''));
  for (const m of stripFrontmatter(text).matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu)) tags.add(m[1]);
  return [...tags].filter((t) => !/^(color|accent)\//.test(t));
}

// Every card in the vault: [{ path, line, raw, question, answer, reversed, schedule, decks }]
async function listCards() {
  if (!vaultPath) return [];
  const cards = [];
  for (const notePath of await listNotes('')) {
    let text;
    try {
      text = await noteText(notePath);
    } catch {
      continue;
    }
    if (!text.includes('::')) continue;
    const folder = notePath.includes('/') ? notePath.slice(0, notePath.lastIndexOf('/')) : '';
    const decks = [folder || path.basename(vaultPath), ...tagsOf(text).map((t) => `#${t}`)];
    for (const { index, text: line } of readableLines(text)) {
      const card = parseCardLine(line);
      if (card) cards.push({ path: notePath, line: index + 1, raw: line, ...card, decks });
    }
  }
  return cards;
}

// Writes a card's new schedule into its hidden comment (finding the line again
// if the note changed since the card was shown).
async function reviewCard(notePath, lineNumber, raw, schedule) {
  if (!Array.isArray(schedule) || !schedule.length || schedule.length > 2) throw new Error('Invalid schedule.');
  const clean = schedule.map((s) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.due)) throw new Error('Invalid date.');
    return `!${s.due},${Math.max(0, Math.round(s.interval))},${Math.max(130, Math.round(s.ease))}`;
  }).join('');
  const text = await readNote(notePath);
  const nl = /\r\n/.test(text) ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  let at = lineNumber - 1;
  if (lines[at] !== raw) at = lines.indexOf(raw);
  if (at < 0) throw new Error('That card has changed in its note.');
  lines[at] = lines[at].replace(/\s*<!--SR:[^>]*-->\s*$/, '') + ` <!--SR:${clean}-->`;
  await writeNote(notePath, lines.join(nl));
  return lines[at];
}

// ---------- Manuscripts and saving Word files ----------
//
// A folder marked as a manuscript keeps its chapter order and the notes left
// out of the compile in its .opal.md: opal-manuscript, opal-chapters,
// opal-exclude (note file names). The .docx itself is built in the window
// (src/export) and saved here, where the person picks.

function nameList(value) {
  try {
    const list = JSON.parse(value || '[]');
    return Array.isArray(list) ? list.filter((n) => typeof n === 'string' && !n.includes('/')).slice(0, 2000) : [];
  } catch {
    return [];
  }
}

async function readManuscript(relFolder) {
  const text = await readFolderSettings(relFolder || '');
  return {
    on: frontmatter.getProp(text, 'opal-manuscript') === 'true',
    chapters: nameList(frontmatter.getProp(text, 'opal-chapters')),
    exclude: nameList(frontmatter.getProp(text, 'opal-exclude')),
  };
}

async function writeManuscript(relFolder, { on, chapters, exclude }) {
  await changeFolderSettings(relFolder || '', (text) => {
    let next = frontmatter.setProp(text, 'opal-manuscript', on ? 'true' : null);
    if (chapters) next = frontmatter.setProp(next, 'opal-chapters', chapters.length ? JSON.stringify(nameList(JSON.stringify(chapters))) : null);
    if (exclude) next = frontmatter.setProp(next, 'opal-exclude', exclude.length ? JSON.stringify(nameList(JSON.stringify(exclude))) : null);
    return next;
  });
}

let lastSavedExport = null;

// Asks where to save a Word file the window made, then writes it there.
async function saveDocx(suggestedName, bytes) {
  const data = Buffer.from(bytes || []);
  if (!data.length || data.length > 200 * 1024 * 1024) throw new Error('Nothing to save.');
  const name = `${safeFileName(String(suggestedName || 'Opal export')).replace(/\.docx$/i, '')}.docx`;
  if (process.env.OPAL_EXPORT_DIR) {
    // Automated tests save without the dialog.
    const target = path.join(process.env.OPAL_EXPORT_DIR, name);
    await fs.promises.writeFile(target, data);
    lastSavedExport = target;
    return target;
  }
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Save as a Word document',
    defaultPath: path.join(app.getPath('documents'), name),
    filters: [{ name: 'Word document', extensions: ['docx'] }],
  });
  if (canceled || !filePath) return null;
  await fs.promises.writeFile(filePath, data);
  lastSavedExport = filePath;
  return filePath;
}

function revealExport() {
  if (lastSavedExport) shell.showItemInFolder(lastSavedExport);
}

// ---------- Pasted and dropped pictures ----------

const ATTACHMENTS = 'Attachments';
const PICTURE_TYPES = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp']; // the ones Opal can show

// Saves a picture pasted or dropped into a note as
// Attachments/<note name> <YYYY-MM-DD HHMMSS>.<ext> and returns its file name.
async function saveAttachment(notePath, ext, bytes) {
  if (!vaultPath) throw new Error('No vault is open.');
  const type = String(ext || '').toLowerCase().replace(/^\./, '');
  if (!PICTURE_TYPES.includes(type)) throw new Error('Only pictures can be pasted in.');
  const data = Buffer.from(bytes);
  if (!data.length || data.length > 60 * 1024 * 1024) throw new Error('That picture is empty or too big (60 MB at most).');
  const folder = resolveFolderPath(ATTACHMENTS);
  await fs.promises.mkdir(folder, { recursive: true });
  const note = safeFileName(path.posix.basename(String(notePath || 'Note')).replace(/\.md$/i, ''));
  const now = new Date();
  const two = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())} ${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
  let name = `${note} ${stamp}.${type === 'jpeg' ? 'jpg' : type}`;
  for (let n = 2; fs.existsSync(path.join(folder, name)); n++) name = `${note} ${stamp} ${n}.${type === 'jpeg' ? 'jpg' : type}`;
  await fs.promises.writeFile(path.join(folder, name), data, { flag: 'wx' });
  scheduleRefresh();
  return name;
}

// ---------- Backlinks ----------

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Lines of a note that aren't properties or code blocks: [{ index, text }].
function readableLines(text) {
  const lines = stripStickies(text).split(/\r?\n/);
  const out = [];
  let start = 0;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) start = end + 1;
  }
  let inCode = false;
  for (let i = start; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) {
      inCode = !inCode;
      continue;
    }
    if (!inCode) out.push({ index: i, text: lines[i] });
  }
  return out;
}

// Notes that link to relPath, and notes that mention its name without a link.
// → { linked: [{ path, line, text }], unlinked: [{ path, line, text, column, length }] }
async function findBacklinks(relPath) {
  if (!vaultPath || typeof relPath !== 'string') return { linked: [], unlinked: [] };
  const paths = listNotePaths(await scanFolder(''));
  const name = path.posix.basename(relPath).replace(/\.md$/i, '');
  const mention = name.length >= 3 ? new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapeRegExp(name)})(?![\\p{L}\\p{N}_])`, 'giu') : null;
  const linked = [];
  const unlinked = [];
  for (const notePath of paths) {
    if (notePath === relPath || !isNoteFile(notePath)) continue;
    let text;
    try {
      text = await noteText(notePath);
    } catch {
      continue;
    }
    const lower = text.toLowerCase();
    if (!lower.includes(name.toLowerCase()) && !lower.includes(path.posix.basename(relPath).toLowerCase())) continue;
    for (const { index, text: line } of readableLines(text)) {
      let links = false;
      for (const m of line.matchAll(/!?\[\[([^[\]\n]+?)\]\]/g)) {
        const target = m[1].split('|')[0].split('#')[0].trim();
        if (target && resolveTarget(target, paths) === relPath) links = true;
      }
      for (const m of line.matchAll(/\]\(<?([^)>\s]+)>?\)/g)) {
        let target = m[1].split('#')[0];
        try {
          target = decodeURIComponent(target);
        } catch {
          // as written
        }
        if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
        const lowerPath = relPath.toLowerCase();
        if (joinPath(folderOf(notePath), target).toLowerCase() === lowerPath || joinPath('', target).toLowerCase() === lowerPath) links = true;
      }
      if (links && linked.length < 200) linked.push({ path: notePath, line: index + 1, text: line.trim().slice(0, 240) });
      if (!mention || unlinked.length >= 200) continue;
      // Mentions outside any link on the line (the link parts are blanked out).
      const plain = line.replace(/!?\[\[[^\]]*\]\]|\[[^\]]*\]\([^)]*\)|<[^>]+>/g, (m) => ' '.repeat(m.length));
      mention.lastIndex = 0;
      const m = mention.exec(plain);
      if (m) {
        const column = m.index + m[1].length;
        unlinked.push({ path: notePath, line: index + 1, text: line.trim().slice(0, 240), column, length: m[2].length, trim: line.length - line.trimStart().length });
      }
    }
  }
  return { linked, unlinked };
}

// Turns one unlinked mention into a [[link]] to targetPath.
async function linkMention(notePath, line, column, targetPath) {
  const text = await readNote(notePath);
  const nl = /\r\n/.test(text) ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const row = lines[line - 1];
  const name = path.posix.basename(targetPath).replace(/\.md$/i, '');
  if (row == null || row.substr(column, name.length).toLowerCase() !== name.toLowerCase()) {
    throw new Error('That note has changed since the mention was found.');
  }
  const paths = listNotePaths(await scanFolder(''));
  const linkName = resolveTarget(name, paths) === targetPath ? name : targetPath.replace(/\.md$/i, '');
  const shown = row.substr(column, name.length);
  const link = shown === linkName ? `[[${linkName}]]` : `[[${linkName}|${shown}]]`;
  lines[line - 1] = row.slice(0, column) + link + row.slice(column + name.length);
  await writeNote(notePath, lines.join(nl));
  scheduleRefresh();
  return true;
}

// Unticked checklist items ("- [ ] …") in notes outside Tasks/ and the Inbox,
// for the Inbox screen. → [{ path, line (1-based), raw, text }]
async function openCheckboxes() {
  if (!vaultPath) return [];
  const found = [];
  for (const relPath of await listNotes()) {
    if (/^tasks\//i.test(relPath) || /^inbox\.md$/i.test(relPath)) continue;
    let text;
    try {
      text = await noteText(relPath);
    } catch {
      continue;
    }
    if (!text.includes('[ ]')) continue;
    text.split(/\r?\n/).forEach((raw, index) => {
      const match = /^\s*[-*+]\s\[ \]\s+(\S.*)$/.exec(raw);
      if (match && found.length < 300) found.push({ path: relPath, line: index + 1, raw, text: match[1].trim() });
    });
  }
  return found;
}

// ---------- Reminders ----------
// The window works out when reminders are due; this just shows them as Mac
// notifications. Clicking one brings Opal forward on that day or on Tasks.

const shownNotifications = new Set(); // kept so clicks still arrive later

function showNotification(payload) {
  if (!Notification.isSupported() || !payload || typeof payload !== 'object') return false;
  const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
  const open = payload.open === 'tasks' ? { kind: 'tasks' }
    : /^\d{4}-\d{2}-\d{2}$/.test(payload.day || '') ? { kind: 'calendar', day: payload.day } : null;
  const note = new Notification({ title: text(payload.title, 120) || 'Opal', body: text(payload.body, 240) });
  shownNotifications.add(note);
  note.on('click', () => {
    shownNotifications.delete(note);
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    if (open) win.webContents.send('ui:open-reminder', open);
  });
  note.on('close', () => shownNotifications.delete(note));
  note.show();
  return true;
}

ipcMain.handle('vault:checkboxes', () => openCheckboxes());
ipcMain.handle('cards:list', () => listCards());
ipcMain.handle('cards:review', (_event, notePath, line, raw, schedule) => reviewCard(notePath, line, raw, schedule));
ipcMain.handle('manuscript:read', (_event, folder) => readManuscript(folder));
ipcMain.handle('manuscript:write', (_event, folder, settings) => writeManuscript(folder, settings || {}));
ipcMain.handle('export:save-docx', (_event, name, bytes) => saveDocx(name, bytes));
ipcMain.handle('export:reveal', () => revealExport());
ipcMain.handle('db:rows', (_event, folder) => databaseRows(folder));
ipcMain.handle('db:set-cell', (_event, relPath, key, value, type) => setDatabaseCell(relPath, key, value, type));
ipcMain.handle('db:read', (_event, folder) => readDatabase(folder));
ipcMain.handle('db:write', (_event, folder, on, settings) => writeDatabase(folder, on, settings));
ipcMain.handle('logbook:read', () => readLogbook());
ipcMain.handle('bookmarks:read', () => readBookmarks());
ipcMain.handle('tracker:data', (_event, source) => trackerData(source));
ipcMain.handle('tracker:notes', () => trackerNotes());
ipcMain.handle('bookmarks:write', (_event, data) => writeBookmarks(data));
ipcMain.handle('opal-json:read', (_event, name) => readOpalJson(name));
ipcMain.handle('opal-json:write', (_event, name, data) => writeOpalJson(name, data));
ipcMain.handle('app:info', () => ({ version: app.getVersion(), vault: vaultInfo() }));
// Copies a line of text (a file path) for pasting elsewhere.
ipcMain.handle('clipboard:write', (_event, text) => {
  if (typeof text !== 'string' || text.length > 4096) throw new Error('Nothing to copy.');
  clipboard.writeText(text);
  return true;
});
ipcMain.handle('logbook:add-words', (_event, day, count) => addWords(day, count));
ipcMain.handle('logbook:add-session', (_event, session) => addSession(session));
ipcMain.handle('words:folder', (_event, folder) => folderWords(folder));
ipcMain.handle('words:set-folder-target', (_event, folder, target) => setFolderWordTarget(folder, target));
ipcMain.handle('history:save', (_event, relPath, text, reason) => saveSnapshot(relPath, text, reason));
ipcMain.handle('history:list', (_event, relPath) => listSnapshots(relPath));
ipcMain.handle('history:read', (_event, relPath, id) => readSnapshot(relPath, id));
ipcMain.handle('attachment:save', (_event, notePath, ext, bytes) => saveAttachment(notePath, ext, bytes));
ipcMain.handle('links:backlinks', (_event, relPath) => findBacklinks(relPath));
ipcMain.handle('links:link-mention', (_event, notePath, line, column, target) => linkMention(notePath, line, column, target));
ipcMain.handle('vault:search', (_event, query) => searchVault(query));
ipcMain.handle('notify:show', (_event, payload) => showNotification(payload));
ipcMain.handle('vault:get', () => vaultInfo());
ipcMain.handle('vault:choose', () => switchVault());
ipcMain.handle('vault:list', () => (vaultPath ? scanFolder('') : []));
ipcMain.handle('file:read', (_event, relPath) => readNote(relPath));
ipcMain.handle('file:write', (_event, relPath, content) => writeNote(relPath, content));
ipcMain.handle('link:resolve', (_event, target) => resolveLink(target));
ipcMain.handle('link:find', (_event, target) => resolveLink(target, false));
ipcMain.handle('link:web', (_event, url) => openWebLink(url));
ipcMain.handle('note:create', (_event, name, folder, template) => createNote(name, folder, template));
ipcMain.handle('templates:info', (_event, folder) => templateInfo(folder));
ipcMain.handle('templates:fill', (_event, templatePath, notePath) => filledTemplate(templatePath, notePath));
ipcMain.handle('templates:set-default', (_event, folder, templatePath) => setFolderTemplate(folder, templatePath));
ipcMain.handle('note:previews', (_event, paths) => notePreviews(paths));
ipcMain.handle('file:open-external', (_event, relPath) => openInDefaultApp(relPath));
ipcMain.handle('file:reveal', (_event, relPath) => revealInFinder(relPath));
ipcMain.handle('color:set', (_event, relPath, kind, color) => setColor(relPath, kind, color));
ipcMain.handle('note:rename', (_event, relPath, newName) => renameNote(relPath, newName));
ipcMain.handle('note:trash', (_event, relPath) => trashNote(relPath));
ipcMain.handle('file:rename', (_event, relPath, newName) => renameFile(relPath, newName));
ipcMain.handle('file:trash', (_event, relPath) => trashFile(relPath));
ipcMain.handle('folder:rename', (_event, relFolder, newName) => renameFolder(relFolder, newName));
ipcMain.handle('folder:trash', (_event, relFolder) => trashFolder(relFolder));
ipcMain.handle('folder:reveal', (_event, relFolder) => revealFolder(relFolder));
ipcMain.handle('folder:settings-read', (_event, relFolder) => readFolderSettings(relFolder || ''));
ipcMain.handle('folder:settings-write', (_event, relFolder, text) => writeFolderSettings(relFolder || '', text));
ipcMain.handle('description:set', (_event, relPath, kind, text) => setDescription(relPath, kind, text));
ipcMain.handle('order:set', (_event, relFolder, names) => setOrder(relFolder, names));
ipcMain.handle('item:move', (_event, relPath, kind, destFolder) => moveItem(relPath, kind, destFolder));
ipcMain.handle('file:read-bytes', (_event, relPath) => readFileBytes(relPath));
ipcMain.handle('folder:create', (_event, name, parent) => createFolder(name, parent));
ipcMain.handle('palette:get', () => getPalette());
ipcMain.handle('palette:set', (_event, name) => setPalette(name));
ipcMain.handle('look:get', () => getLook());
ipcMain.handle('look:set', (_event, look) => setLook(look));

// ---------- Window and menu ----------

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => { if (win) win.webContents.send('ui:show-palettes'); } },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Note',
          accelerator: 'CmdOrCtrl+N',
          click: () => { if (win) win.webContents.send('note:new-request'); },
        },
        {
          label: 'New Folder',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => { if (win) win.webContents.send('folder:new-request'); },
        },
        { label: 'Quick Open…', accelerator: 'CmdOrCtrl+O', click: () => { if (win) win.webContents.send('ui:search', 'open'); } },
        { label: 'Search Vault…', accelerator: 'CmdOrCtrl+Shift+F', click: () => { if (win) win.webContents.send('ui:search', 'text'); } },
        { type: 'separator' },
        { label: 'Switch Vault…', accelerator: 'CmdOrCtrl+Shift+O', click: () => switchVault() },
        { type: 'separator' },
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => { if (win) win.webContents.send('ui:tab', 'new'); } },
        { label: 'Pin or Unpin Tab', click: () => { if (win) win.webContents.send('ui:tab', 'pin'); } },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => { if (win) win.webContents.send('ui:tab', 'close'); } },
        { label: 'Close Window', accelerator: 'CmdOrCtrl+Shift+W', role: 'close' },
      ],
    },
    { role: 'editMenu' },
    {
      // No "Reload": reloading the page could drop typing that hasn't been saved yet.
      label: 'View',
      submenu: [
        { label: 'Back', accelerator: 'CmdOrCtrl+[', click: () => { if (win) win.webContents.send('ui:history', -1); } },
        { label: 'Forward', accelerator: 'CmdOrCtrl+]', click: () => { if (win) win.webContents.send('ui:history', 1); } },
        { type: 'separator' },
        { label: 'Vault Home', accelerator: 'CmdOrCtrl+Shift+H', click: () => { if (win) win.webContents.send('ui:go-home'); } },
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+\\', click: () => { if (win) win.webContents.send('ui:toggle-sidebar'); } },
        { label: 'Calendar', accelerator: 'CmdOrCtrl+Shift+D', click: () => { if (win) win.webContents.send('ui:show-calendar'); } },
        // Inbox is switched off for now: { label: 'Inbox', accelerator: 'CmdOrCtrl+Shift+I', … 'ui:show-inbox' }
        { label: 'Tasks', accelerator: 'CmdOrCtrl+Shift+T', click: () => { if (win) win.webContents.send('ui:show-tasks'); } },
        { type: 'separator' },
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
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
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
  // Swiping between pages on the trackpad goes back / forward.
  win.on('swipe', (_event, direction) => {
    if (direction === 'left') win.webContents.send('ui:history', 1);
    if (direction === 'right') win.webContents.send('ui:history', -1);
  });

  // The palette and theme go along in the address so the first paint already looks right.
  const look = getLook();
  applyNativeTheme(look);
  win.loadFile(path.join(__dirname, 'src', 'index.html'), { query: { palette: getPalette(), theme: look.theme, mode: look.mode } });
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

// Only one copy of Opal at a time: two copies editing the same notes would
// save over each other. Opening it again just brings the existing window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    protocol.handle('opal-file', serveVaultFile);
    const saved = loadSettings().vaultPath;
    if (saved && isFolder(saved)) vaultPath = path.resolve(saved);
    watchVault();
    migrateVault().catch((err) => console.error('Settings move failed:', err));
    buildMenu();
    createWindow();
  });
}

app.on('window-all-closed', () => app.quit());
