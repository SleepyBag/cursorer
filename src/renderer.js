import { AniCacher } from './aniCache.js'
import { DownloadList } from './download.js'
import { CursorSchemeList } from './cursorScheme.js'

const cursorSchemes = Vue.reactive(new CursorSchemeList());
const aniCacher = Vue.reactive(new AniCacher(rootPath));

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

function openWebsiteInNewWindow(url) {
  // Create the browser window.
  const newWindow = window.open(url, '', 'height=768,width=1024');
}

async function loadIcons() {
  for (const cursorScheme of cursorSchemes) {
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
      if (cursorSchemes.isInstalled(installationItem.name)) {
        installationItem.setInstalled();
      }
    }
  }
}

async function refresh() {
  await cursorSchemes.refresh();
  await loadIcons();
}

async function install(installationItem) {
  await installationItem.install();
  await refresh();
}

async function deleteCursorScheme(cursorScheme) {
  await cursorSchemes.delete(cursorScheme.name);
  await refresh();
}

async function applyCursorScheme(cursorScheme) {
  await cursorSchemes.apply(cursorScheme.name);
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

var cursorSize = await getCursorSize();

const vueApp = Vue.createApp({
  data() {
    return {
      links: links,
      cursorSchemes: cursorSchemes,
      downloadItems: downloadItems,
      aniCacher: aniCacher,
      openWebsiteInNewWindow: openWebsiteInNewWindow,
      cursorSize: cursorSize,
      setCursorSize: setCursorSize,
      refresh: refresh,
      install: install,
      deleteCursorScheme: deleteCursorScheme,
      applyCursorScheme: applyCursorScheme,
    }
  }
})

vueApp.mount('#app')