// The bridge between the window and the main process.
// Only the functions listed here are available to the window, as `window.opal`.
// The window gets no direct disk or Node.js access.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('opal', {
  getVault: () => ipcRenderer.invoke('vault:get'),
  chooseVault: () => ipcRenderer.invoke('vault:choose'),
  onVaultChanged: (callback) => ipcRenderer.on('vault:changed', (_event, vault) => callback(vault)),
});
