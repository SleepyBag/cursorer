const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require("fs");
const unrar = require('node-unrar-js');
const sevenBin = require('7zip-bin');
const { extractFull } = require('node-7z');
const { exec } = require('child_process');
const bsplit = require('buffer-split');

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
    width: 1000,
    height: 1000,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      webviewTag: true,
      sandbox: false
    },
  });

  mainWindow.loadFile('src/index.html');

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
      if (state === 'completed') {
        console.log(`Download successfully to ${downloadPath}`)
        const extractedPath = downloadPath.substring(0, downloadPath.lastIndexOf('.'));
        if (downloadPath.endsWith(".rar")) {
          const extractor = await unrar.createExtractorFromFile({ filepath: downloadPath, targetPath: extractedPath });
          const extracted = extractor.extract({});
          for (const file of extracted.files) {
            console.log(`Extracted ${file.fileHeader.name}`);
          }
        }
        else if (downloadPath.endsWith(".zip")) {
          var extractionStream = extractFull(downloadPath, extractedPath, { $bin: sevenBin.path7za });
          await new Promise((resolve, reject) => {
            extractionStream.on('end', () => {
              console.log(`Extracted files to ${extractedPath}`);
              resolve();  
            }).on('error', err => {
              reject(err);
            });
          });
          console.log(`Extracted files to ${extractedPath}`);
        }
        const filenames = getAllFiles(extractedPath);
        const infs = filenames.filter(filename => filename.endsWith(".inf"));
        infs.forEach(inf => {
          // TODO: Add a counter call after installation, and monitor the counter to open settings when all done
          // remove rundll32 call which opens mouse pointer selection window from the install inf
          const lines = bsplit(fs.readFileSync(inf), Buffer.from('\n'))
                        .filter(line => !line.toString().toLowerCase().includes('rundll32'));
          const newInf = path.join(path.dirname(inf), `new.${path.basename(inf)}`);
          const filtered = lines.reduce((prev, b) => Buffer.concat([prev, Buffer.from('\n'), b]));
          fs.writeFileSync(newInf, filtered);

          const filename = newInf;
          console.log(`Installing ${filename}`);
          exec(`RUNDLL32.EXE SETUPAPI.DLL,InstallHinfSection DefaultInstall 132 ${filename}`, {encoding: "utf8"});
        });
        // exec("rundll32.exe shell32.dll,Control_RunDLL main.cpl,,1")
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
