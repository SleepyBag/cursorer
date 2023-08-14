class DownloadingItem {
  constructor(downloadPath) {
    this.path = downloadPath;
    this.filename = path.basename(this.path);
    this.progress = 0;
    this.installationItems = [];
  }

  updateProgress(progress) {
    this.progress = Math.round(progress * 100);
  }
}

function splitIniValue(value) {
  const values = value.match(/((".*?"|[^",\s]*)(,|$))/g);
  return values.map(s => s.trim());
}

function getByPath(object, path) {
  for (const pathSection of path.split('.')) {
      object = object[pathSection];
  }
  return object
}

class AddRegItem {
  constructor(regPath, valueEntryName, flags, value) {
    this.regPath = regPath;
    this.valueEntryName = valueEntryName;
    this.flags = flags;
    this.value = value;
  }

  static fromIniString(raw, stringMap) {
    var [regRoot, subkey, valueEntryName, flags, value] = splitIniValue(raw);
    regRoot = resolveStringWithDoublePercentVariable(
        regRoot.substring(0, regRoot.length - 1), stringMap);
    subkey = resolveStringWithDoublePercentVariable(
        subkey.substring(0, subkey.length - 1), stringMap);
    valueEntryName = resolveStringWithDoublePercentVariable(
        valueEntryName.substring(0, valueEntryName.length - 1), stringMap);
    flags = resolveStringWithDoublePercentVariable(
        flags.substring(0, flags.length - 1), stringMap);
    value = resolveStringWithDoublePercentVariable(
        value, stringMap);
    return new AddRegItem(regRoot + '\\' + subkey, valueEntryName, flags, value);
  }
}

class InstallationItem {
  constructor(infPath, infItem) {
    this.broken = false;
    try {
      this.filename = infPath;
      const stringMap = {};
      for (const stringDefinition in infItem.Strings) {
        stringMap[stringDefinition.toLowerCase()] = infItem.Strings[stringDefinition];
      }
      // parse registry part
      const addRegItems = [];
      for (const addRegSectionName of infItem.DefaultInstall.AddReg.split(',')) {
        if (addRegSectionName.length > 0) {
          const addRegSection = getByPath(infItem, addRegSectionName);
          for (const addRegItemValue in addRegSection) {
            try {
              const addRegItem = AddRegItem.fromIniString(addRegItemValue, stringMap);
              addRegItems.push(addRegItem);
            }
            catch {
            }
          }
        }
      }
      const schemeRegItem = addRegItems.filter(addRegItem => addRegItem.regPath === cursorSchemesPath)[0];
      if (schemeRegItem !== undefined) {
        this.addRegItem = schemeRegItem;
      }
      else {
        // For some cursor packs, the scheme definition is actually broken. 
        // The correct behavior of them relies on the cursor selection registry values.
        const cursorRegItems = addRegItems.filter(addRegItem => addRegItem.regPath === cursorSelectionPath);
        console.log(cursorRegItems);
        const schemeName = cursorRegItems.find(addRegItem => addRegItem.valueEntryName === "").value;
        console.log(schemeName);
        const cursorPaths = [];
        for (const cursorKeyName of cursorKeyNames) {
          const cursorRegValue = cursorRegItems.find(addRegItem => addRegItem.valueEntryName === cursorKeyName);
          // some cursor may be missing
          if (cursorRegValue !== undefined) {
            cursorPaths.push(cursorRegValue.value);
          }
          else {
            cursorPaths.push("");
          }
        }
        const cursorSchemeRegValue = cursorPaths.join(',');
        this.addRegItem = new AddRegItem(cursorSchemesPath, schemeName, "", cursorSchemeRegValue);
      }
      this.name = this.addRegItem.valueEntryName;

      // parse file copy part
      const sourceDir = path.dirname(infPath);
      this.copyFiles = [];
      for (const copyFileSectionName of infItem.DefaultInstall.CopyFiles.split(',')) {
        if (infItem.DestinationDirs[copyFileSectionName] !== undefined) {
          const destination = path.join(env.systemroot, resolveStringWithDoublePercentVariable(
            splitIniValue(infItem.DestinationDirs[copyFileSectionName])[1], stringMap));
          for (const sourceFile in getByPath(infItem, copyFileSectionName)) {
            this.copyFiles.push({ source: path.join(sourceDir, sourceFile), target: path.join(destination, sourceFile) });
          }
        }
      }
    }
    catch (e) {
      this.broken = true;
      this.error = e;
    }
  }

  static async from(infPath) {
    const infItem = ini.parse(decode(await fs.readFile(infPath), 'gbk'));
    if (infItem.Strings === undefined) {
        infItem.Strings = {};
    }
    for (const stringName in infItem.Strings) {
        infItem.Strings[stringName] = removeQuotes(infItem.Strings[stringName]);
    }
    infItem.Strings['10'] = env.systemroot;
    const item = new InstallationItem(infPath, infItem);

    // match cursor paths to generate preview
    const targetCursorPaths = item.addRegItem.value.split(',');
    item.normalCursorPath = await getCursorPath(item.copyFiles.find(copyFile => copyFile.target === targetCursorPaths[cursorKeyNames.indexOf("Arrow")]).source);
    item.handCursorPath = await getCursorPath(item.copyFiles.find(copyFile => copyFile.target === targetCursorPaths[cursorKeyNames.indexOf("Hand")]).source);
    item.appStartingCursorPath = await getCursorPath(item.copyFiles.find(copyFile => copyFile.target === targetCursorPaths[cursorKeyNames.indexOf("AppStarting")]).source);
    item.waitCursorPath = await getCursorPath(item.copyFiles.find(copyFile => copyFile.target === targetCursorPaths[cursorKeyNames.indexOf("Wait")]).source);
    return item;
  }

  async install() {
    this.progress = 0;
    var finished = 0;
    const total = this.copyFiles.length + 1;
    for (const copyFile of this.copyFiles) {
      await fs.mkdir(path.dirname(copyFile.target), { recursive: true });
      await fs.copyFile(copyFile.source, copyFile.target);
      finished++;
      this.progress = Math.round(finished / total);
    }
    regedit.putValue({ 
      [cursorSchemesPath] : {
        [this.name]: {
          value: this.addRegItem.value,
          type: 'REG_EXPAND_SZ',
        }
      }
    });
  }
}

const downloadingItems = Vue.reactive([]);
onStartDownload((downloadPath) => {
  downloadingItems.push(new DownloadingItem(downloadPath));
});
onUpdateDownload((downloadPath, progress) => {
  console.log(`download update: ${downloadPath}: ${progress}`);
  downloadingItems.find(item => item.path === downloadPath)
                  .updateProgress(progress);
});
onFinishDownload(async (downloadPath, state) => {
  if (state === 'completed') {
    console.log(`Download successfully to ${downloadPath}`);
    const extractedPath = await extractArchive(downloadPath);
    const filenames = await getAllFiles(extractedPath);
    const infs = filenames.filter(filename => filename.endsWith(".inf"));
    const downloadingItem = downloadingItems.find(item => item.path === downloadPath);
    for (const inf of infs) {
      downloadingItem.installationItems.push(await InstallationItem.from(inf));
    }
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

async function getCursorPath(path) {
  path = resolveStringWithDoublePercentVariable(path);
  if (path.endsWith('.cur')) {
    return path;
  } if (path.endsWith('.ani')) {
    return await aniCacher.getIconPathOfAni(path);
  }
}

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

  async constructCursorPaths() {
    this.normalCursorPath.value = await getCursorPath(this.paths.Arrow);
    this.handCursorPath.value = await getCursorPath(this.paths.Hand);
    this.appStartingCursorPath.value = await getCursorPath(this.paths.AppStarting)
    this.waitCursorPath.value = await getCursorPath(this.paths.Wait)
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