// Main process: the only part of Opal that touches the disk.
// The window (renderer) asks for things through IPC; see preload.js.

const { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell, Notification, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const FILE_TYPES = require('./file-types.json');
const frontmatter = require('./shared/frontmatter.js');
const { stripStickies } = require('./shared/stickies.js');
const { relinkText } = require('./shared/relink.js');

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
        folders.push({ type: 'folder', name: entry.name, path: relPath, children: inside.nodes, color: inside.color, description: inside.description });
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

  // The folder's own note (School/School.md; the vault's is named after the
  // vault) holds the folder's colour and the colours of its non-note files.
  const folderName = relFolder ? path.posix.basename(relFolder) : path.basename(vaultPath);
  const folderNote = files.find((f) => f.name.toLowerCase() === `${folderName.toLowerCase()}.md`);
  const map = folderNote ? folderNote.fileColors || {} : {};
  const order = folderNote ? folderNote.order || [] : [];
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
    color: folderNote ? folderNote.color : null,
    description: folderNote ? folderNote.description : '',
  };
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
    // Nothing but Opal's own settings (colours, stickies) in it?
    settingsOnly: head.length < 4096 && !stripStickies(frontmatter.stripFrontmatter(head)).trim(),
  };
  propsCache.set(full, { mtimeMs, props });
  return props;
}

// ---------- Colours ----------

// Sets the colour of a folder or file (null = back to the default).
// Notes keep it in their own properties; folders in their folder note
// (created if needed); other files in their folder's note.
async function setColor(relPath, kind, color) {
  if (color !== null && !frontmatter.validColor(color)) throw new Error('Unknown colour.');
  let notePath;
  let change;
  if (kind === 'folder') {
    resolveFolderPath(relPath);
    const name = relPath ? path.posix.basename(relPath) : path.basename(vaultPath);
    notePath = joinRel(relPath, `${name}.md`);
    change = (text) => frontmatter.setProp(text, 'opal-color', color);
  } else if (isNoteFile(relPath)) {
    notePath = relPath;
    change = (text) => frontmatter.setProp(text, 'opal-color', color);
  } else {
    resolveVaultFile(relPath);
    const folder = relPath.includes('/') ? relPath.slice(0, relPath.lastIndexOf('/')) : '';
    const name = folder ? path.posix.basename(folder) : path.basename(vaultPath);
    notePath = joinRel(folder, `${name}.md`);
    change = (text) => frontmatter.setFileColor(text, path.posix.basename(relPath), color);
  }
  let text = '';
  try {
    text = await readNote(notePath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  await writeNote(notePath, change(text));
  scheduleRefresh(); // Opal's own save isn't picked up by the watcher
  return notePath;
}

// The line under a note's or folder's title (empty = none). Folders keep it
// in their folder note, created if needed, like their colour.
async function setDescription(relPath, kind, text) {
  if (typeof text !== 'string') throw new Error('Invalid description.');
  let notePath = relPath;
  if (kind === 'folder') {
    resolveFolderPath(relPath);
    const name = relPath ? path.posix.basename(relPath) : path.basename(vaultPath);
    notePath = joinRel(relPath, `${name}.md`);
  } else if (!isNoteFile(relPath)) {
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

// ---------- Rearranging ----------

// Saves a folder's own order for its items (names, in order) in its folder note.
async function setOrder(relFolder, names) {
  if (!Array.isArray(names) || names.some((n) => typeof n !== 'string')) throw new Error('Invalid order.');
  resolveFolderPath(relFolder);
  const name = relFolder ? path.posix.basename(relFolder) : path.basename(vaultPath);
  const notePath = joinRel(relFolder, `${name}.md`);
  let text = '';
  try {
    text = await readNote(notePath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  await writeNote(notePath, frontmatter.setItemOrder(text, names.slice(0, 500)));
  scheduleRefresh();
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

// Creates an empty note in a folder (default: the vault root) and returns its path.
// If a note with that name is already there, it is left untouched ('wx' never overwrites).
async function createNote(rawName, relFolder = '') {
  const folderFull = resolveFolderPath(relFolder);
  const fileName = `${safeFileName(String(rawName).replace(/\.md$/i, ''))}.md`;
  const relPath = joinRel(relFolder, fileName);
  // macOS ignores case, so "idea" and "Idea" are the same file: reuse the real spelling.
  const wanted = normalizeName(fileName);
  const existing = (await fs.promises.readdir(folderFull)).find((n) => isNoteFile(n) && normalizeName(n) === wanted);
  if (existing) return joinRel(relFolder, existing);
  try {
    await fs.promises.writeFile(resolveNotePath(relPath), '', { flag: 'wx' });
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
    const lower = text.toLowerCase();
    if (!lower.includes(needle)) continue;
    const lines = text.split(/\r?\n/);
    const matches = [];
    let count = 0;
    lines.forEach((line, index) => {
      let at = line.toLowerCase().indexOf(needle);
      if (at === -1) return;
      if (matches.length < 3) {
        // A window of the line around the match, so long lines stay readable.
        const from = Math.max(0, at - 50);
        const snippet = line.slice(from, at + needle.length + 90);
        matches.push({ line: index + 1, text: (from ? '…' : '') + snippet, at: at - from + (from ? 1 : 0), length: needle.length, column: at });
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
ipcMain.handle('note:create', (_event, name, folder) => createNote(name, folder));
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
    { role: 'appMenu' },
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
        { role: 'close' },
      ],
    },
    { role: 'editMenu' },
    {
      // No "Reload": reloading the page could drop typing that hasn't been saved yet.
      label: 'View',
      submenu: [
        { label: 'Vault Home', accelerator: 'CmdOrCtrl+Shift+H', click: () => { if (win) win.webContents.send('ui:go-home'); } },
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+\\', click: () => { if (win) win.webContents.send('ui:toggle-sidebar'); } },
        { label: 'Theme & Palettes…', click: () => { if (win) win.webContents.send('ui:show-palettes'); } },
        { label: 'Calendar', accelerator: 'CmdOrCtrl+Shift+D', click: () => { if (win) win.webContents.send('ui:show-calendar'); } },
        { label: 'Logbook', accelerator: 'CmdOrCtrl+Shift+L', click: () => { if (win) win.webContents.send('ui:show-logbook'); } },
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
    buildMenu();
    createWindow();
  });
}

app.on('window-all-closed', () => app.quit());
