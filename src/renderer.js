class DownloadingItem {
  constructor(downloadPath) {
    this.path = downloadPath;
    this.filename = path.basename(this.path);
    this.progress = 0;
  }

  updateProgress(progress) {
    this.progress = Math.round(progress * 100);
  }
}

const downloadingItems = Vue.reactive([]);
onStartDownload((downloadPath) => {
  downloadingItems.push(new DownloadingItem(downloadPath));
});
onUpdateDownload((downloadPath, progress) => {
  console.log(`download update: ${downloadPath}: ${progress}`);
  downloadingItems[0].updateProgress(progress);
});

import { AniCacher } from './aniCache.js'

const aniCacher = new AniCacher(rootPath);

const cursorKeyNames = ["Arrow", "Help", "AppStarting", "Wait", "Crosshair", "IBeam", "NWPen", "No", "SizeNS", "SizeWE", "SizeNWSE", "SizeNESW", "SizeAll", "UpArrow", "Hand", "Person", "Pin"];

function resolveEnvVar(string) {
  while (string.includes('%') && string.indexOf('%') != string.lastIndexOf('%')) {
    string = string.replace(/%.*%/, v => process.env[v.substring(0, v.length - 2)]);
  }
  return string;
}

class Link {
  constructor(name, url) {
    this.name = name;
    this.url = url;
  }
}

const links = [
  new Link("Zhutix", "https://zhutix.com/tag/cursors/"),
  new Link("Deviant Art", "https://www.deviantart.com/tag/cursors"),
  new Link("VS Themes", "https://vsthemes.org/en/cursors/"),
];

class CursorScheme {
  constructor(name, paths) {
    this.name = name;
    paths = paths.split(',');
    this.paths = {};
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      const keyName = cursorKeyNames[i];
      this.paths[keyName] = path;
    }

    this.normalCursorPath = Vue.ref(null);
    this.handCursorPath = Vue.ref(null);
    this.appStartingCursorPath = Vue.ref(null);
    this.waitCursorPath = Vue.ref(null);

    this.constructCursorPaths();
  }

  toRegValue() {
    const valuesToPut = {};
    for (const keyName in this.paths) {
      const path = this.paths[keyName];
      if (path.length > 0) {
        valuesToPut[keyName] = { value: path, type: 'REG_EXPAND_SZ' };
      }
    }
    return valuesToPut;
  }

  async constructCursorPath(path) {
    path = resolveEnvVar(path);
    if (path.endsWith('.cur')) {
      return path;
    } if (path.endsWith('.ani')) {
      return await aniCacher.getIconPathOfAni(path);
    }
  }

  async constructCursorPaths() {
    this.normalCursorPath.value = await this.constructCursorPath(this.paths.Arrow);
    this.handCursorPath.value = await this.constructCursorPath(this.paths.Hand);
    this.appStartingCursorPath.value = await this.constructCursorPath(this.paths.AppStarting)
    this.waitCursorPath.value = await this.constructCursorPath(this.paths.Wait)
  }
}

// link to websites
const buttons = document.getElementsByTagName("button");
for (let i = 0; i < buttons.length; i++) {
    const button = buttons[i];
    button.onclick = () => openWebsiteInNewWindow(button.getAttribute("target"));
}

function openWebsiteInNewWindow(url) {
  // Create the browser window.
  const newWindow = window.open(url, '', 'height=768,width=1024');
}

const cursorSchemesPath = 'HKCU\\Control Panel\\Cursors\\Schemes';
const cursorSelectionPath = 'HKCU\\Control Panel\\Cursors';

async function applyCursorScheme(cursorScheme) {
  console.log(`Setting cursor scheme to "${cursorScheme.name}"`);
  const valuesToPut = cursorScheme.toRegValue();
  console.log(valuesToPut);
  regedit.putValue({ [cursorSelectionPath] : valuesToPut }, error => {
    if (error !== undefined) {
      console.log(`Error when setting cursor scheme: ${error}`);
    } else {
      console.log(`Successfully set cursor scheme to ${cursorScheme.name}`);
      exec(`.\\utils\\RefreshCursor.exe`, {encoding: "utf8"}, (error, stdout, stderr) => {
        console.log("RefreshCursor finished");
        console.log(`Error: ${error}`);
        console.log(`Stdout: ${stdout}`);
        console.log(`Stderr: ${stderr}`);
      });
    }
  });
}

async function deleteCursorScheme(cursorScheme) {
  if (confirm(`Deleting cursor scheme ${cursorScheme.name}?`)) {
    console.log(`Deleting cursor scheme to "${cursorScheme.name}"`);
    regedit.deleteValue(cursorSchemesPath + '\\' + cursorScheme.name, error => {
      if (error !== undefined) {
        console.log(`Error when deleting cursor scheme: ${error}`);
      } else {
        console.log(`Successfully deleted cursor scheme ${cursorScheme.name}.`);
      }
    });
  }
}

async function listCursorSchemes() {
  const schemesInReg = (await regedit.list(cursorSchemesPath))[cursorSchemesPath].values;
  const schemes = [];
  for (const schemeName in schemesInReg) {
    schemes.push(new CursorScheme(schemeName, schemesInReg[schemeName].value));
  }
  return schemes;
}

var cursorSchemes = await listCursorSchemes();

const vueApp = Vue.createApp({
  data() {
    return {
      links: links,
      cursorSchemes: cursorSchemes,
      applyCursorScheme: applyCursorScheme,
      deleteCursorScheme: deleteCursorScheme,
      openWebsiteInNewWindow: openWebsiteInNewWindow,
      downloadingItems: downloadingItems,
    }
  }
})

vueApp.mount('#app')