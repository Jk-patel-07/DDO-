const { app, BrowserWindow, screen, ipcMain, Tray, Menu, globalShortcut, shell } = require('electron');
const path = require('path');

let mainWindow = null;
let loginWindow = null;
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
      devTools: true, // Enable DevTools for debugging support!
      backgroundThrottling: true // Enable background throttling
    },
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[RENDERER LOG] [level ${level}] ${message} (from ${sourceId}:${line})`);
  });

  // Keep window always on top, above normal windows

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  // Avoid showing in taskbar
  mainWindow.setSkipTaskbar(true);

  // Keyboard shortcuts (Inspect, Reload, Emergency Exit)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      const isInspect = (input.key === 'F12') || (input.control && input.shift && input.key.toLowerCase() === 'i');
      if (isInspect) {
        if (mainWindow.webContents.isDevToolsOpened()) {
          mainWindow.webContents.closeDevTools();
        } else {
          mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
        event.preventDefault();
      }

      if (input.control && input.key.toLowerCase() === 'r') {
        mainWindow.webContents.reloadIgnoringCache();
        event.preventDefault();
      }

      if (input.control && input.shift && input.key.toLowerCase() === 'q') {
        app.isQuitting = true;
        app.quit();
        event.preventDefault();
      }
    }
  });

  // Right-click context menu (Inspect, Reload, Exit)
  mainWindow.webContents.on('context-menu', (event, params) => {
    const menu = Menu.buildFromTemplate([
      {
        label: 'Inspect',
        click: () => {
          if (mainWindow.webContents.isDevToolsOpened()) {
            mainWindow.webContents.closeDevTools();
          } else {
            mainWindow.webContents.openDevTools({ mode: 'detach' });
          }
        }
      },
      {
        label: 'Reload Toolbar',
        click: () => {
          mainWindow.webContents.reloadIgnoringCache();
        }
      },
      { type: 'separator' },
      {
        label: 'Exit DDO',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);
    menu.popup(mainWindow);
  });

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:3000/toolbar');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'toolbar' });
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

ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});

ipcMain.on('open-company-login', () => {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return;
  }

  const isDev = !app.isPackaged;

  loginWindow = new BrowserWindow({
    width: 900,
    height: 650,
    frame: true,
    transparent: false,
    resizable: true,
    backgroundColor: '#050c09',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true,
    },
  });

  if (isDev) {
    loginWindow.loadURL('http://127.0.0.1:3000/#company-login');
  } else {
    loginWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'company-login' });
  }

  loginWindow.on('closed', () => {
    loginWindow = null;
  });
});

ipcMain.on('company-login-success', (event, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('company-login-success', payload);
    mainWindow.show();
    mainWindow.focus();
  }

  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.close();
  }
});

let isToolbarVisible = true;
let visibilityPollInterval = null;

function startVisibilityPolling() {
  if (visibilityPollInterval) return;

  visibilityPollInterval = setInterval(() => {
    if (isToolbarVisible) return;

    const cursor = screen.getCursorScreenPoint();
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.bounds;

    const triggerWidth = 360;
    const leftBound = (screenWidth - triggerWidth) / 2;
    const rightBound = (screenWidth + triggerWidth) / 2;

    if (cursor.y <= 2 && cursor.x >= leftBound && cursor.x <= rightBound) {
      isToolbarVisible = true;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('show-toolbar');
        mainWindow.setIgnoreMouseEvents(false);
      }
      stopVisibilityPolling();
    }
  }, 200);
}

function stopVisibilityPolling() {
  if (visibilityPollInterval) {
    clearInterval(visibilityPollInterval);
    visibilityPollInterval = null;
  }
}

ipcMain.on('update-visibility', (event, visible) => {
  isToolbarVisible = visible;
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (visible) {
      mainWindow.setIgnoreMouseEvents(false);
      stopVisibilityPolling();
    } else {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
      startVisibilityPolling();
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
  stopVisibilityPolling();
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
