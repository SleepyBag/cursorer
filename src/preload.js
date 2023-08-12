// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge } = require('electron');
const { rootPath } = require('electron-root-path');
const regedit = require('regedit').promisified;
const { exec } = require('child_process');
const fs = require('fs/promises');
const stringHash = require('string-hash');
const path = require('path');

contextBridge.exposeInMainWorld('regedit', regedit);
contextBridge.exposeInMainWorld('exec', exec);
contextBridge.exposeInMainWorld('fs', fs);
contextBridge.exposeInMainWorld('stringHash', stringHash);
contextBridge.exposeInMainWorld('path', path);
contextBridge.exposeInMainWorld('rootPath', rootPath);