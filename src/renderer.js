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
const cursorKeyNames = ["Arrow", "Help", "AppStarting", "Wait", "Crosshair", "IBeam", "NWPen", "No", "SizeNS", "SizeWE", "SizeNWSE", "SizeNESW", "SizeAll", "UpArrow", "Hand", "Person", "Pin"];
const cursorSelectionPath = 'HKCU\\Control Panel\\Cursors';

async function getAllCursorSchemes() {
  return (await regedit.list(cursorSchemesPath))[cursorSchemesPath].values;
}

async function applyCursorScheme(schemeName) {
  console.log(`Setting cursor scheme to "${schemeName}"`);
  const schemeValue = (await getAllCursorSchemes())[schemeName];
  const cursorPaths = schemeValue.value.split(',');
  const valuesToPut = {};
  for (let i = 0; i < cursorPaths.length; i++) {
    const path = cursorPaths[i];
    if (path.length > 0) {
      const keyName = cursorKeyNames[i];
      valuesToPut[keyName] = { value: path, type: 'REG_EXPAND_SZ' };
    }
  }
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
  const cursorSchemeItems = await getAllCursorSchemes();
  const schemeListElement = document.getElementById('cursorSchemeList');
  const cursorSchemeTemplateElement = document.getElementById('cursorSchemeItemTemplate');
  schemeListElement.removeChild(cursorSchemeTemplateElement);
  for (const schemeName in cursorSchemeItems) {
    const schemeElement = cursorSchemeTemplateElement.cloneNode(true);
    schemeElement.childNodes.forEach((element, key, parent) => {
      if (element.nodeType == element.ELEMENT_NODE) {
        switch (element.getAttribute('tag')) {
          case 'cursor-scheme-name':
            element.textContent = schemeName;
            break;
          case 'cursor-scheme-apply-button':
            element.onclick = () => applyCursorScheme(schemeName);
            break;
          default:
            break;
        }
      }
    });
    // schemeElement.textContent = schemeName;
    schemeListElement.appendChild(schemeElement);
  }
}

listCursorSchemes();