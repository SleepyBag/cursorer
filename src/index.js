const { app, BrowserWindow, Tray, Menu } = require('electron');
const path = require('path');
const fs = require("fs");

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    icon: "cursorer.ico",
    width: 1000,
    height: 1000,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      webviewTag: true,
      sandbox: false
    },
  });

  // minimize to tray
  mainWindow.on('minimize', function (event) {
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('close', function (event) {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });

  const tray = new Tray("cursorer.ico");
  tray.on('double-click', function (e) {
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
    }
  });
  const trayContextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App', click: function () {
        mainWindow.show();
      }
    },
    {
      label: 'Quit', click: function () {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);
  tray.setToolTip('Cursorer');
  tray.setContextMenu(trayContextMenu);

  // load app page
  mainWindow.loadFile('src/index.html');

  // handle downloading
  mainWindow.webContents.session.on('will-download', (event, item, webContents) => {
    const downloadDirectory = path.join(app.getAppPath(), "downloads");
    const downloadPath = path.join(downloadDirectory, item.getFilename())
    console.log(`Downloading to ${downloadPath}`)
    item.setSavePath(downloadPath)
    mainWindow.webContents.send('start-download', downloadPath);

    item.on('updated', (event, state) => {
      console.log(`download update: ${state}`);
      if (state === 'interrupted') {
        console.log('Download is interrupted but can be resumed');
      } else if (state === 'progressing') {
        if (item.isPaused()) {
          console.log('Download is paused');
        } else {
          mainWindow.webContents.send('update-download', downloadPath, item.getReceivedBytes() / item.getTotalBytes());
        }
      }
    });

    item.once('done', async (event, state) => {
      mainWindow.webContents.send('finish-download', downloadPath, state);
    })
  })
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
