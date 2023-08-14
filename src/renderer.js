import { AniCacher } from './aniCache.js'

const downloadItems = Vue.reactive({});
const cursorSchemes = Vue.reactive({});

const aniCacher = new AniCacher(rootPath);

const cursorKeyNames = ["Arrow", "Help", "AppStarting", "Wait", "Crosshair", "IBeam", "NWPen", "No", "SizeNS", "SizeWE", "SizeNWSE", "SizeNESW", "SizeAll", "UpArrow", "Hand", "Person", "Pin"];
const downloadItemPath = path.join(rootPath, '.download-items');
const cursorSchemesPath = 'HKCU\\Control Panel\\Cursors\\Schemes';
const cursorSelectionPath = 'HKCU\\Control Panel\\Cursors';

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
      this.installed = false;
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
      console.log(e);
    }
  }

  static async from(infPath) {
    const infItem = ini.parse(decode(await fs.readFile(infPath), 'gbk'));
    console.log(infItem);
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

    item.installed = cursorSchemes[item.name] !== undefined;
    return item;
  }

  async install() {
    try {
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
      this.installed = true;
    }
    catch (e) {
      alert(`Installation fail because of the following error: \n${e}`);
    }
    refreshCursorSchemes();
  }
}

class DownloadItem {
  constructor(downloadPath, completed = false, extracted = false, extractedPath = undefined) {
    this.path = downloadPath;
    this.filename = path.basename(this.path);
    this.progress = 0;
    this.completed = completed;
    this.extracted = extracted;
    this.extractedPath = extractedPath;
    this.installationItems = [];
  }

  updateProgress(progress) {
    this.progress = Math.round(progress * 100);
  }

  async initialize() {
    if (!this.extracted) {
      await this.extract();
      await persistDownloadItems();
    }
    await this.loadInstallationItems();
  }

  async complete() {
    this.completed = true;
    await persistDownloadItems();
    await this.extract();
    await persistDownloadItems();
    await this.loadInstallationItems();
  }

  async extract() {
    this.extractedPath = await extractArchive(this.path);
    this.extracted = true;
  }

  async loadInstallationItems() {
    if (this.extractedPath !== undefined) {
      const filenames = await getAllFiles(this.extractedPath);
      const infs = filenames.filter(filename => filename.endsWith(".inf"));
      console.log(infs);
      for (const inf of infs) {
        const installationItem = await InstallationItem.from(inf);
        this.installationItems.push(installationItem);
        console.log(installationItem);
      }
    }
  }
}

async function persistDownloadItems() {
  const valueToPersist = Object.values(downloadItems)
    .filter(di => di.completed)       // just drop incompleted items
    .map(di => {
      return {
        path: di.path,
        extracted: di.extracted,
        extractedPath: di.extractedPath
      }
    });
  const valueJson = JSON.stringify(valueToPersist);
  await writeFileAtomic(downloadItemPath, valueJson);
}

async function loadDownloadItems() {
  const valueJson = await fs.readFile(downloadItemPath, { encoding: 'utf8' });
  const persistedValues = JSON.parse(valueJson);
  for (const v of persistedValues) {
    downloadItems[v.path] = new DownloadItem(v.path, true, v.extracted, v.extractedPath);
  }
  for (const downloadItem of Object.values(downloadItems)) {
    await downloadItem.initialize();
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

onStartDownload((downloadPath) => {
  downloadItems[downloadPath] = new DownloadItem(downloadPath);
});
onUpdateDownload((downloadPath, progress) => {
  console.log(`download update: ${downloadPath}: ${progress}`);
  downloadItems[downloadPath].updateProgress(progress);
});
onFinishDownload(async (downloadPath, state) => {
  if (state === 'completed') {
    console.log(`Download successfully to ${downloadPath}`);
    downloadItems[downloadPath].complete();
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

    scheme.normalCursorPath = await getCursorPath(scheme.paths.Arrow);
    scheme.handCursorPath = await getCursorPath(scheme.paths.Hand);
    scheme.appStartingCursorPath = await getCursorPath(scheme.paths.AppStarting)
    scheme.waitCursorPath = await getCursorPath(scheme.paths.Wait)
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
}

async function refreshCursorSchemes() {
  const schemesInReg = (await regedit.list(cursorSchemesPath))[cursorSchemesPath].values;
  for (const schemeName in schemesInReg) {
    cursorSchemes[schemeName] = await CursorScheme.from(schemeName, schemesInReg[schemeName].value);
  }
}

await refreshCursorSchemes(cursorSchemes);
await loadDownloadItems();

async function deleteDownloadItem(downloadItem) {
  delete downloadItems[downloadItem.path];
  persistDownloadItems();
}

const vueApp = Vue.createApp({
  data() {
    return {
      links: links,
      cursorSchemes: cursorSchemes,
      applyCursorScheme: applyCursorScheme,
      deleteCursorScheme: deleteCursorScheme,
      openWebsiteInNewWindow: openWebsiteInNewWindow,
      refreshCursorSchemes: refreshCursorSchemes,
      deleteDownloadItem: deleteDownloadItem,
      downloadItems: downloadItems,
    }
  }
})

vueApp.mount('#app')