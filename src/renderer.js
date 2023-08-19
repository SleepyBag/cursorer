import { AniCacher } from './aniCache.js'
import { DownloadList } from './download.js'

const cursorSchemes = Vue.reactive({});
const aniCacher = Vue.reactive(new AniCacher(rootPath));

const cursorKeyNames = ["Arrow", "Help", "AppStarting", "Wait", "Crosshair", "IBeam", "NWPen", "No", "SizeNS", "SizeWE", "SizeNWSE", "SizeNESW", "SizeAll", "UpArrow", "Hand", "Person", "Pin"];
const cursorSchemesPath = 'HKCU\\Control Panel\\Cursors\\Schemes';
const cursorSelectionPath = 'HKCU\\Control Panel\\Cursors';

const downloadItems = Vue.reactive(new DownloadList());
await downloadItems.load();

onStartDownload((downloadPath) => {
  downloadItems.add(downloadPath);
});
onUpdateDownload((downloadPath, progress) => {
  console.log(`download update: ${downloadPath}: ${progress}`);
  downloadItems.updateProgress(downloadPath, progress);
});
onFinishDownload(async (downloadPath, state) => {
  if (state === 'completed') {
    console.log(`Download successfully to ${downloadPath}`);
    await downloadItems.complete(downloadPath);
  } else {
    console.log(`Download failed: ${state}`)
  }
});

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
  new Link("Pling", "https://www.pling.com/browse?cat=107"),
];

class CursorScheme {
  constructor(name) {
    this.name = name;
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

  static async from(name, paths) {
    const scheme = new CursorScheme(name);
    scheme.name = name;
    paths = paths.split(',');
    scheme.paths = {};
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      const keyName = cursorKeyNames[i];
      scheme.paths[keyName] = path;
    }

    scheme.normalCursorPath = scheme.paths.Arrow;
    scheme.handCursorPath = scheme.paths.Hand;
    scheme.appStartingCursorPath = scheme.paths.AppStarting;
    scheme.waitCursorPath = scheme.paths.Wait;
    return scheme
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

async function applyCursorScheme(cursorScheme) {
  console.log(`Setting cursor scheme to "${cursorScheme.name}"`);
  const valuesToPut = cursorScheme.toRegValue();
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
  await refresh();
}

async function refreshCursorSchemes() {
  const schemesInReg = (await regedit.list(cursorSchemesPath))[cursorSchemesPath].values;
  for (const schemeName in schemesInReg) {
    cursorSchemes[schemeName] = await CursorScheme.from(schemeName, schemesInReg[schemeName].value);
  }
}

async function refresh() {
  await refreshCursorSchemes(cursorSchemes);
  for (const cursorSchemeName in cursorSchemes) {
    const cursorScheme = cursorSchemes[cursorSchemeName];
    await aniCacher.initializeCursorPath(cursorScheme.normalCursorPath);
    await aniCacher.initializeCursorPath(cursorScheme.handCursorPath);
    await aniCacher.initializeCursorPath(cursorScheme.appStartingCursorPath);
    await aniCacher.initializeCursorPath(cursorScheme.waitCursorPath);
  }
  for (const downloadItem of downloadItems) {
    for (const installationItem of downloadItem.installationItems) {
      await aniCacher.initializeCursorPath(installationItem.normalCursorPath);
      await aniCacher.initializeCursorPath(installationItem.handCursorPath);
      await aniCacher.initializeCursorPath(installationItem.appStartingCursorPath);
      await aniCacher.initializeCursorPath(installationItem.waitCursorPath);
    }
  }
}

await refresh();

async function getCursorSize() {
  return (await regedit.list(cursorSelectionPath))[cursorSelectionPath].values.CursorBaseSize.value;
}

async function setCursorSize(newCursorSize) {
  exec(`.\\utils\\RefreshCursor.exe setSize ${newCursorSize}`, {encoding: "utf8"}, (error, stdout, stderr) => {
    console.log("Set cursor size finished");
    console.log(`Error: ${error}`);
    console.log(`Stdout: ${stdout}`);
    console.log(`Stderr: ${stderr}`);
  });
}

function isInstalled(installationItem) {
  return Object.values(cursorSchemes).some(scheme => scheme.name === installationItem.name);
}

var cursorSize = await getCursorSize();

const vueApp = Vue.createApp({
  data() {
    return {
      links: links,
      cursorSchemes: cursorSchemes,
      downloadItems: downloadItems,
      aniCacher: aniCacher,
      isInstalled: isInstalled,
      applyCursorScheme: applyCursorScheme,
      deleteCursorScheme: deleteCursorScheme,
      openWebsiteInNewWindow: openWebsiteInNewWindow,
      cursorSize: cursorSize,
      setCursorSize: setCursorSize,
    }
  }
})

vueApp.mount('#app')