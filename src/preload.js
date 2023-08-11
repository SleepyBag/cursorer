// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge } = require('electron');
const regedit = require('regedit').promisified;
const { exec } = require('child_process');

contextBridge.exposeInMainWorld('regedit', regedit);
contextBridge.exposeInMainWorld('exec', exec);