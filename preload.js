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
  createNote: (name, folder) => call('note:create', name, folder),
  createFolder: (name, parent) => call('folder:create', name, parent),
  getPreviews: (paths) => call('note:previews', paths),
  openExternal: (relPath) => call('file:open-external', relPath),
  revealInFinder: (relPath) => call('file:reveal', relPath),
  readBytes: (relPath) => call('file:read-bytes', relPath),
  getPalette: () => call('palette:get'),
  setPalette: (name) => call('palette:set', name),

  onVaultChanged: (callback) => ipcRenderer.on('vault:changed', (_event, vault) => callback(vault)),
  onFilesChanged: (callback) => ipcRenderer.on('vault:files-changed', () => callback()),
  onNewNoteRequest: (callback) => ipcRenderer.on('note:new-request', () => callback()),
  onNewFolderRequest: (callback) => ipcRenderer.on('folder:new-request', () => callback()),
  onGoHome: (callback) => ipcRenderer.on('ui:go-home', () => callback()),
  onShowPalettes: (callback) => ipcRenderer.on('ui:show-palettes', () => callback()),

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
