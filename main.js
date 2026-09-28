// Main process: the only part of Opal that touches the disk.
// The window (renderer) asks for things through IPC; see preload.js.

const { app, BrowserWindow } = require('electron');
const path = require('path');

app.setName('Opal');

let win = null;

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
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
