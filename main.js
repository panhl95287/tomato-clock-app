const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 520,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: true,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile('index.html');
}

function createTray() {
  const iconPath = path.join(__dirname, 'public/tray-icon.bmp');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) trayIcon = nativeImage.createEmpty();
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示', click: () => mainWindow?.show() },
    { label: '退出', click: () => app.quit() },
  ]);

  tray.setToolTip('小番茄闹钟');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
    }
  });
}

// IPC: 窗口控制
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-close', () => mainWindow?.hide());

// IPC: 获取配置
ipcMain.handle('get-config', () => {
  return {
    workDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    cyclesBeforeLongBreak: 4,
    playSound: true,
    autoStartBreak: true,
    autoStartWork: true,
  };
});

// IPC: 保存配置
ipcMain.handle('save-config', (_, config) => {
  if (mainWindow) {
    mainWindow.webContents.executeJavaScript(
      `localStorage.setItem('tomato-config', JSON.stringify(${JSON.stringify(config)})); true`
    );
  }
  return true;
});

// IPC: 发送通知
ipcMain.on('show-notification', (_, data) => {
  new Notification({
    title: '小番茄闹钟',
    body: data.body,
  }).show();
});

app.whenReady().then(() => {
  createMainWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  tray = null;
});

// 处理强制退出
const originalQuit = app.quit;
app.quit = () => {
  app.isQuitting = true;
  originalQuit.call(app);
};
