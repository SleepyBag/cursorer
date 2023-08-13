// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');
const { rootPath } = require('electron-root-path');
const regedit = require('regedit').promisified;
const { exec } = require('child_process');
const fs = require('fs/promises');
const stringHash = require('string-hash');
const path = require('path');
const unrar = require('node-unrar-js');
const sevenBin = require('7zip-bin');
const { extractFull } = require('node-7z');
const bsplit = require('buffer-split');
const ini = require('ini');

async function extractArchive(archivePath) {
    const extractedPath = archivePath.substring(0, archivePath.lastIndexOf('.'));
    if (archivePath.endsWith(".rar")) {
        const extractor = await unrar.createExtractorFromFile({ filepath: archivePath, targetPath: extractedPath });
        const extracted = extractor.extract({});
        for (const file of extracted.files) {
            console.log(`Extracted ${file.fileHeader.name}`);
        }
    }
    else if (archivePath.endsWith(".zip")) {
        var extractionStream = extractFull(archivePath, extractedPath, { $bin: sevenBin.path7za });
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
    else {
        return false;
    }
    return extractedPath;
}

async function getAllFiles(dirPath, arrayOfFiles) {
    files = await fs.readdir(dirPath);

    arrayOfFiles = arrayOfFiles || [];

    for (const file of files) {
        if ((await fs.stat(dirPath + "/" + file)).isDirectory()) {
            arrayOfFiles = await getAllFiles(dirPath + "/" + file, arrayOfFiles);
        } else {
            arrayOfFiles.push(path.join(dirPath, "/", file));
        }
    }

    return arrayOfFiles
}

async function installInf(inf) {
    // TODO: Add a counter call after installation, and monitor the counter to open settings when all done
    // remove rundll32 call which opens mouse pointer selection window from the install inf
    const lines = bsplit(await fs.readFile(inf), Buffer.from('\n'))
                .filter(line => !line.toString().toLowerCase().includes('rundll32'));
    const newInf = path.join(path.dirname(inf), `new.${path.basename(inf)}`);
    const filtered = lines.reduce((prev, b) => Buffer.concat([prev, Buffer.from('\n'), b]));
    await fs.writeFile(newInf, filtered);

    const filename = newInf;
    console.log(`Installing ${filename}`);
    exec(`RUNDLL32.EXE SETUPAPI.DLL,InstallHinfSection DefaultInstall 132 ${filename}`, {encoding: "utf8"});
}

function removeQuotes(string) {
    if (string.startsWith('"') && string.endsWith('"')) {
        string = string.substring(1, string.length - 1);
    }
    return string;
}

function resolveStringWithDoublePercentVariable(raw, stringMap = process.env) {
    raw = removeQuotes(raw);
    while (raw.includes('%') && raw.indexOf('%') != raw.lastIndexOf('%')) {
        raw = raw.replace(/%[^%]*%/, v => {
            return stringMap[v.substring(1, v.length - 1)]});
    }
    return raw;
}

contextBridge.exposeInMainWorld('regedit', regedit);
contextBridge.exposeInMainWorld('exec', exec);
contextBridge.exposeInMainWorld('fs', fs);
contextBridge.exposeInMainWorld('ini', ini);
contextBridge.exposeInMainWorld('stringHash', stringHash);
contextBridge.exposeInMainWorld('path', path);
contextBridge.exposeInMainWorld('env', { "SystemRoot": process.env.SystemRoot });
contextBridge.exposeInMainWorld('rootPath', rootPath);
contextBridge.exposeInMainWorld('extractArchive', extractArchive);
contextBridge.exposeInMainWorld('getAllFiles', getAllFiles);
contextBridge.exposeInMainWorld('installInf', installInf);
contextBridge.exposeInMainWorld('resolveStringWithDoublePercentVariable', resolveStringWithDoublePercentVariable);
contextBridge.exposeInMainWorld('removeQuotes', removeQuotes);
contextBridge.exposeInMainWorld('onStartDownload', (handler) => ipcRenderer.on('start-download', (event, ...args) => handler(...args)));
contextBridge.exposeInMainWorld('onUpdateDownload', (handler) => ipcRenderer.on('update-download', (event, ...args) => handler(...args)));
contextBridge.exposeInMainWorld('onFinishDownload', (handler) => ipcRenderer.on('finish-download', (event, ...args) => handler(...args)));