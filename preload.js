// The bridge between the window and the main process.
// Only the functions listed here are available to the window, as `window.opal`.
// The window gets no direct disk or Node.js access.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('opal', {
  getVault: () => ipcRenderer.invoke('vault:get'),
  chooseVault: () => ipcRenderer.invoke('vault:choose'),
  listFiles: () => ipcRenderer.invoke('vault:list'),
  readFile: (relPath) => ipcRenderer.invoke('file:read', relPath),
  writeFile: (relPath, content) => ipcRenderer.invoke('file:write', relPath, content),
  resolveLink: (target) => ipcRenderer.invoke('link:resolve', target),
  createNote: (name) => ipcRenderer.invoke('note:create', name),

  onVaultChanged: (callback) => ipcRenderer.on('vault:changed', (_event, vault) => callback(vault)),
  onFilesChanged: (callback) => ipcRenderer.on('vault:files-changed', () => callback()),
  onNewNoteRequest: (callback) => ipcRenderer.on('note:new-request', () => callback()),

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
