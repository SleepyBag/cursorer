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

class AddRegItem {
    constructor(raw, stringMap) {
        const values = raw.match(/((".*?"|[^",\s]*)(,|$))/g);
        const [regRoot, subkey, valueEntryName, flags, value] = values;
        this.regRoot = resolveStringWithDoublePercentVariable(
            regRoot.substring(0, regRoot.length - 1), stringMap);
        this.subkey = resolveStringWithDoublePercentVariable(
            subkey.substring(0, subkey.length - 1), stringMap);
        this.valueEntryName = resolveStringWithDoublePercentVariable(
            valueEntryName.substring(0, valueEntryName.length - 1), stringMap);
        this.flags = resolveStringWithDoublePercentVariable(
            flags.substring(0, flags.length - 1), stringMap);
        this.value = resolveStringWithDoublePercentVariable(
            value, stringMap);
        this.regPath = this.regRoot + '\\' + this.subkey;
    }
}

class InstallationItem {
  constructor(infPath, infItem) {
    this.filename = infPath;
    this.copyFiles = infItem.DefaultInstall.CopyFiles.split(',');
    const addRegItems = [];
    for (const addRegSectionName of infItem.DefaultInstall.AddReg.split(',')) {
        if (addRegSectionName.length > 0) {
            const addRegSectionPath = addRegSectionName.split('.');
            var addRegSection = infItem;
            for (const path of addRegSectionPath) {
                addRegSection = addRegSection[path];
            }
            for (const addRegItemValue in addRegSection) {
                addRegItems.push(new AddRegItem(addRegItemValue, infItem.Strings));
            }
        }
    }
    this.addRegItem = addRegItems.filter(addRegItem => addRegItem.regPath === cursorSchemesPath)[0];
    this.name = this.addRegItem.valueEntryName;
  }

  static async from(infPath) {
    const infItem = ini.parse(await fs.readFile(infPath, 'utf8'));
    if (infItem.Strings === undefined) {
        infItem.Strings = {};
    }
    for (const stringName in infItem.Strings) {
        infItem.Strings[stringName] = removeQuotes(infItem.Strings[stringName]);
    }
    infItem.Strings['10'] = env["SystemRoot"];
    const item = new InstallationItem(infPath, infItem);
    return item;
  }

  async install() {
    await installInf(this.filename);
  }
}

const downloadingItems = Vue.reactive([]);
const installationItems = Vue.reactive([]);
onStartDownload((downloadPath) => {
  downloadingItems.push(new DownloadingItem(downloadPath));
});
onUpdateDownload((downloadPath, progress) => {
  console.log(`download update: ${downloadPath}: ${progress}`);
  downloadingItems[0].updateProgress(progress);
});
onFinishDownload(async (downloadPath, state) => {
  if (state === 'completed') {
    console.log(`Download successfully to ${downloadPath}`);
    const extractedPath = await extractArchive(downloadPath);
    const filenames = await getAllFiles(extractedPath);
    const infs = filenames.filter(filename => filename.endsWith(".inf"));
    for (const inf of infs) {
      installationItems.push(await InstallationItem.from(inf));
    }
    // exec("rundll32.exe shell32.dll,Control_RunDLL main.cpl,,1")
  } else {
    console.log(`Download failed: ${state}`)
  }
});

import { AniCacher } from './aniCache.js'

const aniCacher = new AniCacher(rootPath);

const cursorKeyNames = ["Arrow", "Help", "AppStarting", "Wait", "Crosshair", "IBeam", "NWPen", "No", "SizeNS", "SizeWE", "SizeNWSE", "SizeNESW", "SizeAll", "UpArrow", "Hand", "Person", "Pin"];

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
    path = resolveStringWithDoublePercentVariable(path);
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
      installationItems: installationItems,
    }
  }
})

vueApp.mount('#app')