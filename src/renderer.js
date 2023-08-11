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
      console.log(`Successfully set cursor scheme: ${error}`);
      exec(`.\\utils\\RefreshCursor.exe`, {encoding: "utf8"}, (error, stdout, stderr) => {
        console.log("RefreshCursor finished");
        console.log(`Error: ${error}`);
        console.log(`Stdout: ${stdout}`);
        console.log(`Stderr: ${stderr}`);
      });
    }
  });
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

const app = Vue.createApp({
  data() {
    return {
      links: links,
      cursorSchemes: cursorSchemes,
      applyCursorScheme: applyCursorScheme,
      openWebsiteInNewWindow: openWebsiteInNewWindow,
    }
  }
})

app.mount('#app')