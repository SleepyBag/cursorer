const cursorKeyNames = ["Arrow", "Help", "AppStarting", "Wait", "Crosshair", "IBeam", "NWPen", "No", "SizeNS", "SizeWE", "SizeNWSE", "SizeNESW", "SizeAll", "UpArrow", "Hand", "Person", "Pin"];
const cursorSelectionPath = 'HKCU\\Control Panel\\Cursors';
const cursorSchemesPath = 'HKCU\\Control Panel\\Cursors\\Schemes';

class CursorScheme {
    constructor(name, paths, isNew) {
        this.name = name;
        this.isNew = isNew;
        this.newCount = 0;
        this.setToBeApplied();

        paths = paths.split(',');
        this.paths = {};
        for (let i = 0; i < paths.length; i++) {
            const path = paths[i];
            const keyName = cursorKeyNames[i];
            this.paths[keyName] = path;
        }

        this.normalCursorPath = this.paths.Arrow;
        this.handCursorPath = this.paths.Hand;
        this.appStartingCursorPath = this.paths.AppStarting;
        this.waitCursorPath = this.paths.Wait;
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

    setToBeApplied() {
        this.state = 'to-be-applied';
    }

    setApplying() {
        this.state = 'applying';
    }

    setApplied() {
        this.state = 'applied';
    }
}

export class CursorSchemeList {
    constructor() {
        this.cursorSchemes = {};
        this.initialized = false;
    }

    isInstalled(cursorSchemeName) {
        return this.cursorSchemes[cursorSchemeName] !== undefined;
    }

    get(cursorSchemeName) {
        const cursorScheme = this.cursorSchemes[cursorSchemeName];
        if (cursorScheme === undefined) {
            throw new Error(`${cursorSchemeName} not found!`);
        }
        return cursorScheme;
    }

    async apply(cursorSchemeName) {
        const cursorScheme = this.get(cursorSchemeName);
        cursorScheme.setApplying();
        console.log(`Setting cursor scheme to "${cursorScheme.name}"`);
        const valuesToPut = cursorScheme.toRegValue();
        regedit.putValue({ [cursorSelectionPath]: valuesToPut }, error => {
            if (error !== undefined) {
                console.log(`Error when setting cursor scheme: ${error}`);
            } else {
                console.log(`Successfully set cursor scheme to ${cursorScheme.name}`);
                exec(`.\\utils\\RefreshCursor.exe`, { encoding: "utf8" }, (error, stdout, stderr) => {
                    console.log("RefreshCursor finished");
                    console.log(`Error: ${error}`);
                    console.log(`Stdout: ${stdout}`);
                    console.log(`Stderr: ${stderr}`);
                    for (const cs of this) {
                        cs.setToBeApplied();
                    }
                    cursorScheme.setApplied();
                });
            }
        });
    }

    async delete(cursorSchemeName) {
        const cursorScheme = this.get(cursorSchemeName);
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
        await this.refresh();
    }

    async refresh() {
        const schemesInReg = (await regedit.list(cursorSchemesPath))[cursorSchemesPath].values;
        for (const schemeName in this.cursorSchemes) {
            if (schemesInReg[schemeName] === undefined) {
                delete this.cursorSchemes[schemeName];
            }
        }
        for (const schemeName in schemesInReg) {
            const cursorScheme = this.cursorSchemes[schemeName];
            const isNew = (cursorScheme === undefined || cursorScheme.isNew) && this.initialized;
            this.cursorSchemes[schemeName] = new CursorScheme(schemeName, schemesInReg[schemeName].value, isNew);
        }
        this.newCount = Object.values(this.cursorSchemes).reduce((a, b) => a + b.isNew, 0);
        this.initialized = true;
    }

    [Symbol.iterator]() {
        return Object.values(this.cursorSchemes)
                     .toSorted((a, b) => { 
                        if (a.isNew !== b.isNew) {
                            return b.isNew - a.isNew;
                        }
                        return a.name.localeCompare(b.name);
                     })
                     .values();
    }
}
