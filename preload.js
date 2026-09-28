// The bridge between the window and the main process.
// Only the functions listed here are available to the window, as `window.opal`.
// The window gets no direct disk or Node.js access.

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('opal', {});
