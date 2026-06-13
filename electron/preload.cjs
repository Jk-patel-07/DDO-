const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  resizeWindow: (size) => ipcRenderer.send('resize-window', size),
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  openCompanyLogin: () => ipcRenderer.send('open-company-login'),
  companyLoginSuccess: (payload) => ipcRenderer.send('company-login-success', payload),
  onCompanyLoginSuccess: (callback) => {
    const subscription = (event, payload) => callback(payload);
    ipcRenderer.on('company-login-success', subscription);
    return () => ipcRenderer.removeListener('company-login-success', subscription);
  },
  updateVisibility: (visible) => ipcRenderer.send('update-visibility', visible),
  onShowToolbar: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('show-toolbar', subscription);
    return () => ipcRenderer.removeListener('show-toolbar', subscription);
  },
  openUpdateWindow: (updateInfo) => ipcRenderer.send('open-update-window', updateInfo),
  startUpdateDownload: (downloadUrl) => ipcRenderer.send('start-update-download', downloadUrl),
  onUpdateData: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('update-data', subscription);
    return () => ipcRenderer.removeListener('update-data', subscription);
  },
  onUpdateStatus: (callback) => {
    const subscription = (event, status) => callback(status);
    ipcRenderer.on('update-status', subscription);
    return () => ipcRenderer.removeListener('update-status', subscription);
  },
});
