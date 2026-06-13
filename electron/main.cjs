const { app, BrowserWindow, screen, ipcMain, Tray, Menu, globalShortcut } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;

function createWindow() {
  const isDev = !app.isPackaged;
  
  // Get primary display work area
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;
  
  const initialWidth = screenWidth;
  const initialHeight = 42; // Set standard height to 42px on startup!
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
      devTools: isDev, // Disable DevTools in normal/production use
      backgroundThrottling: true // Enable background throttling
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

  // Handle renderer crash
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer process gone:', details);
    app.quit();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, '../src-tauri/icons/icon.ico');
    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
      { label: 'DDO Toolbar', enabled: false },
      { type: 'separator' },
      {
        label: 'Focus Toolbar',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      {
        label: 'Exit DDO',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);
    tray.setToolTip('DDO Toolbar');
    tray.setContextMenu(contextMenu);
  } catch (err) {
    console.error('Failed to create tray:', err);
  }
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
    if (ignore) {
      win.setIgnoreMouseEvents(true, { forward: true });
    } else {
      win.setIgnoreMouseEvents(false);
    }
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
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Temporarily disable start-with-Windows until toolbar is stable
    app.setLoginItemSettings({
      openAtLogin: false
    });

    createWindow();
    createTray();

    // Register safe-exit keyboard shortcut Ctrl+Shift+Q
    globalShortcut.register('CommandOrControl+Shift+Q', () => {
      app.isQuitting = true;
      app.quit();
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
