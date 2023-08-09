const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require("fs");
const unrar = require('node-unrar-js');
const decompress = require('decompress')
const { exec } = require('child_process');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const getAllFiles = function(dirPath, arrayOfFiles) {
  files = fs.readdirSync(dirPath)

  arrayOfFiles = arrayOfFiles || []

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      arrayOfFiles.push(path.join(dirPath, "/", file));
    }
  })

  return arrayOfFiles
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 100,
    height: 150,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true
    },
  });

  mainWindow.loadFile('src/index.html');

  mainWindow.webContents.session.on('will-download', (event, item, webContents) => {
    // Set the save path, making Electron not to prompt a save dialog.
    const downloadDirectory = path.join(app.getAppPath(), "downloads");
    const downloadPath = path.join(downloadDirectory, item.getFilename())
    console.log(`Downloading to ${downloadPath}`)
    item.setSavePath(downloadPath)

    item.once('done', async (event, state) => {
      if (state === 'completed') {
        console.log(`Download successfully to ${downloadPath}`)
        var extractedPath = null;
        if (downloadPath.endsWith(".rar")) {
          extractedPath = downloadPath.substring(0, downloadPath.length - 4);
          const extractor = await unrar.createExtractorFromFile({ filepath: downloadPath, targetPath: extractedPath });
          const extracted = extractor.extract({});
          for (const file of extracted.files) {
            console.log(`Extracted ${file.fileHeader.name}`);
          }
        }
        else if (downloadPath.endsWith(".zip")) {
          extractedPath = downloadPath.substring(0, downloadPath.length - 4);
          await decompress(downloadPath, extractedPath);
          console.log(`Extracted files to ${extractedPath}`);
        }
        const filenames = getAllFiles(extractedPath);
        const infs = filenames.filter(filename => filename.endsWith(".inf"));
        infs.forEach(inf => {
          const filename = inf;
          console.log(`Installing ${filename}`);
          exec(`RUNDLL32.EXE SETUPAPI.DLL,InstallHinfSection DefaultInstall 132 ${filename}`, {encoding: "utf8"});
        });
      } else {
        console.log(`Download failed: ${state}`)
      }
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
