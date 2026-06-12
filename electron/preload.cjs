const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  resizeWindow: (size) => ipcRenderer.send('resize-window', size),
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
});
