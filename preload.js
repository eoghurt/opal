// The bridge between the window and the main process.
// Only the functions listed here are available to the window, as `window.opal`.
// The window gets no direct disk or Node.js access.

const { contextBridge, ipcRenderer } = require('electron');

// Asks main for something. Errors come back with a technical prefix
// ("Error invoking remote method …"); strip it so messages read cleanly.
const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args).catch((err) => {
  throw new Error(String(err && err.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
});

contextBridge.exposeInMainWorld('opal', {
  getVault: () => call('vault:get'),
  chooseVault: () => call('vault:choose'),
  listFiles: () => call('vault:list'),
  readFile: (relPath) => call('file:read', relPath),
  writeFile: (relPath, content) => call('file:write', relPath, content),
  resolveLink: (target) => call('link:resolve', target),
  createNote: (name, folder, template) => call('note:create', name, folder, template),
  templateInfo: (folder) => call('templates:info', folder),
  fillTemplate: (templatePath, notePath) => call('templates:fill', templatePath, notePath),
  setDefaultTemplate: (folder, templatePath) => call('templates:set-default', folder, templatePath),
  createFolder: (name, parent) => call('folder:create', name, parent),
  getPreviews: (paths) => call('note:previews', paths),
  openExternal: (relPath) => call('file:open-external', relPath),
  findLink: (target) => call('link:find', target),
  openWebLink: (url) => call('link:web', url),
  revealInFinder: (relPath) => call('file:reveal', relPath),
  readBytes: (relPath) => call('file:read-bytes', relPath),
  setColor: (relPath, kind, color) => call('color:set', relPath, kind, color),
  renameNote: (relPath, newName) => call('note:rename', relPath, newName),
  renameFile: (relPath, newName) => call('file:rename', relPath, newName),
  trashFile: (relPath) => call('file:trash', relPath),
  readLedger: () => call('ledger:read'),
  writeLedger: (which, content) => call('ledger:write', which, content),
  renameFolder: (relFolder, newName) => call('folder:rename', relFolder, newName),
  trashFolder: (relFolder) => call('folder:trash', relFolder),
  revealFolder: (relFolder) => call('folder:reveal', relFolder),
  setOrder: (relFolder, names) => call('order:set', relFolder, names),
  moveItem: (relPath, kind, destFolder) => call('item:move', relPath, kind, destFolder),
  trashNote: (relPath) => call('note:trash', relPath),
  getPalette: () => call('palette:get'),
  setPalette: (name) => call('palette:set', name),
  getLook: () => call('look:get'),
  setDescription: (relPath, kind, text) => call('description:set', relPath, kind, text),
  readFolderSettings: (relFolder) => call('folder:settings-read', relFolder),
  writeFolderSettings: (relFolder, text) => call('folder:settings-write', relFolder, text),
  setLook: (look) => call('look:set', look),
  notify: (payload) => call('notify:show', payload),
  search: (query) => call('vault:search', query),
  backlinks: (relPath) => call('links:backlinks', relPath),
  listCards: () => call('cards:list'),
  reviewCard: (notePath, line, raw, schedule) => call('cards:review', notePath, line, raw, schedule),
  readManuscript: (folder) => call('manuscript:read', folder),
  writeManuscript: (folder, settings) => call('manuscript:write', folder, settings),
  saveDocx: (name, bytes) => call('export:save-docx', name, bytes),
  revealExport: () => call('export:reveal'),
  databaseRows: (folder) => call('db:rows', folder),
  setDatabaseCell: (relPath, key, value, type) => call('db:set-cell', relPath, key, value, type),
  readDatabase: (folder) => call('db:read', folder),
  writeDatabase: (folder, on, settings) => call('db:write', folder, on, settings),
  readLogbook: () => call('logbook:read'),
  readBookmarks: () => call('bookmarks:read'),
  savePdf: (name, html) => call('export:pdf', name, html),
  trackerData: (source) => call('tracker:data', source),
  trackerNotes: () => call('tracker:notes'),
  writeBookmarks: (data) => call('bookmarks:write', data),
  readOpalJson: (name) => call('opal-json:read', name),
  writeOpalJson: (name, data) => call('opal-json:write', name, data),
  appInfo: () => call('app:info'),
  copyText: (text) => call('clipboard:write', text),
  addWords: (day, count) => call('logbook:add-words', day, count),
  addSession: (session) => call('logbook:add-session', session),
  folderWords: (folder) => call('words:folder', folder),
  setFolderWordTarget: (folder, target) => call('words:set-folder-target', folder, target),
  saveSnapshot: (relPath, text, reason) => call('history:save', relPath, text, reason),
  listSnapshots: (relPath) => call('history:list', relPath),
  readSnapshot: (relPath, id) => call('history:read', relPath, id),
  saveAttachment: (notePath, ext, bytes) => call('attachment:save', notePath, ext, bytes),
  linkMention: (notePath, line, column, target) => call('links:link-mention', notePath, line, column, target),
  openCheckboxes: () => call('vault:checkboxes'),

  onVaultChanged: (callback) => ipcRenderer.on('vault:changed', (_event, vault) => callback(vault)),
  onFilesChanged: (callback) => ipcRenderer.on('vault:files-changed', () => callback()),
  onNewNoteRequest: (callback) => ipcRenderer.on('note:new-request', () => callback()),
  onNewFolderRequest: (callback) => ipcRenderer.on('folder:new-request', () => callback()),
  onGoHome: (callback) => ipcRenderer.on('ui:go-home', () => callback()),
  onHistory: (callback) => ipcRenderer.on('ui:history', (_event, step) => callback(step)),
  onTab: (callback) => ipcRenderer.on('ui:tab', (_event, action) => callback(action)),
  onShowPalettes: (callback) => ipcRenderer.on('ui:show-palettes', () => callback()),
  onToggleSidebar: (callback) => ipcRenderer.on('ui:toggle-sidebar', () => callback()),
  onShowCalendar: (callback) => ipcRenderer.on('ui:show-calendar', () => callback()),
  onShowLogbook: (callback) => ipcRenderer.on('ui:show-logbook', () => callback()),
  onShowTasks: (callback) => ipcRenderer.on('ui:show-tasks', () => callback()),
  onShowMoney: (callback) => ipcRenderer.on('ui:show-money', () => callback()),
  onShowDebate: (callback) => ipcRenderer.on('ui:show-debate', () => callback()),
  onShowInbox: (callback) => ipcRenderer.on('ui:show-inbox', () => callback()),
  onSearch: (callback) => ipcRenderer.on('ui:search', (_event, mode) => callback(mode)),
  onOpenReminder: (callback) => ipcRenderer.on('ui:open-reminder', (_event, open) => callback(open)),

  // Main asks the window to save before quitting or switching vaults.
  // `callback` returns a promise; main is told whether saving succeeded.
  onFlushRequest: (callback) => ipcRenderer.on('app:flush', async (_event, { id, closeEditor }) => {
    try {
      await callback({ closeEditor });
      ipcRenderer.send('app:flush-done', { id, ok: true });
    } catch (err) {
      ipcRenderer.send('app:flush-done', { id, ok: false, error: String(err && err.message ? err.message : err) });
    }
  }),
});
