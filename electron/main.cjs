const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  const isDev = !app.isPackaged;
  
  // Get primary display work area
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;
  
  const initialWidth = screenWidth;
  const initialHeight = 650;
  const initialX = 0;
  const initialY = 0;

  mainWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    x: initialX,
    y: initialY,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Keep window always on top, above normal windows
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  // Avoid showing in taskbar
  mainWindow.setSkipTaskbar(true);

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:3000');
    // Open DevTools only when manually requested (e.g., F12 key)
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' && input.type === 'keyDown') {
        mainWindow.webContents.toggleDevTools();
        event.preventDefault();
      }
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.on('resize-window', (event, size) => {
  if (mainWindow) {
    const { width, height } = size;
    const currentDisplay = screen.getDisplayMatching(mainWindow.getBounds());
    const { width: screenWidth } = currentDisplay.workAreaSize;
    const newX = Math.round((screenWidth - width) / 2);
    const newY = 0;

    mainWindow.setBounds({
      width: Math.round(width),
      height: Math.round(height),
      x: newX,
      y: newY
    });
  }
});

ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setIgnoreMouseEvents(ignore, options);
  }
});

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
