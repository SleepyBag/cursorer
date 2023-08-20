const downloadItemPath = path.join(rootPath, '.download-items');
const cursorSchemesPath = 'HKCU\\Control Panel\\Cursors\\Schemes';
const cursorSelectionPath = 'HKCU\\Control Panel\\Cursors';
const cursorKeyNames = ["Arrow", "Help", "AppStarting", "Wait", "Crosshair", "IBeam", "NWPen", "No", "SizeNS", "SizeWE", "SizeNWSE", "SizeNESW", "SizeAll", "UpArrow", "Hand", "Person", "Pin"];

function splitIniValue(value) {
    const values = value.match(/((".*?"|[^",\s]*)(,|$))/g);
    return values.map(s => s.trim());
}

function getByPath(object, path) {
    for (const pathSection of path.split('.')) {
        object = object[pathSection];
    }
    return object;
}

export class AddRegItem {
    constructor(regPath, valueEntryName, flags, value) {
        this.regPath = regPath;
        this.valueEntryName = valueEntryName;
        this.flags = flags;
        this.value = value;
    }

    static fromIniString(raw, stringMap) {
        var [regRoot, subkey, valueEntryName, flags, value] = splitIniValue(raw);
        regRoot = resolveStringWithDoublePercentVariable(
            regRoot.substring(0, regRoot.length - 1), { stringMap: stringMap });
        subkey = resolveStringWithDoublePercentVariable(
            subkey.substring(0, subkey.length - 1), { stringMap: stringMap });
        valueEntryName = resolveStringWithDoublePercentVariable(
            valueEntryName.substring(0, valueEntryName.length - 1), { stringMap: stringMap });
        flags = resolveStringWithDoublePercentVariable(
            flags.substring(0, flags.length - 1), { stringMap: stringMap });
        value = resolveStringWithDoublePercentVariable(
            value, { stringMap: stringMap });
        return new AddRegItem(regRoot + '\\' + subkey, valueEntryName, flags, value);
    }
}

export class InstallationItem {
    constructor(infPath, infItem) {
        try {
            this.setToBeInstalled();
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
                const schemeName = cursorRegItems.find(addRegItem => addRegItem.valueEntryName === "").value;
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
                        splitIniValue(infItem.DestinationDirs[copyFileSectionName])[1], { stringMap: stringMap }));
                    for (const sourceFile in getByPath(infItem, copyFileSectionName)) {
                        this.copyFiles.push({ source: path.join(sourceDir, sourceFile), target: path.join(destination, sourceFile) });
                    }
                }
            }
        }
        catch (e) {
            this.setBroken();
            this.error = e;
            console.log(e);
        }
    }

    setToBeInstalled() {
        if (this.state !== 'broken') {
            this.state = 'to-be-installed';
        }
    }

    setInstalled() {
        this.state = 'installed';
    }

    setInstalling() {
        this.state = 'installing';
    }

    setBroken() {
        this.state = 'broken';
    }

    async initialize() {
        // match cursor paths to generate preview
        const targetCursorPaths = this.addRegItem.value.split(',');
        const getCursorFilePath = name => {
            try {
                return this.copyFiles.find(copyFile => copyFile.target === targetCursorPaths[cursorKeyNames.indexOf(name)]).source;
            } catch {
                return "";
            }
        }
        this.normalCursorPath = getCursorFilePath("Arrow");
        this.handCursorPath = getCursorFilePath("Hand");
        this.appStartingCursorPath = getCursorFilePath("AppStarting");
        this.waitCursorPath = getCursorFilePath("Wait");
    }

    async install() {
        try {
            this.setInstalling();
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
                [cursorSchemesPath]: {
                    [this.name]: {
                        value: this.addRegItem.value,
                        type: 'REG_EXPAND_SZ',
                    }
                }
            });
            this.setInstalled();
        }
        catch (e) {
            this.setToBeInstalled();
            alert(`Installation fail because of the following error: \n${e}`);
        }
    }
}

export class DownloadItem {
    constructor(downloadPath, { completed = false, extracted = false, extractedPath = undefined, isNew = false } = {}) {
        this.path = downloadPath;
        this.filename = path.basename(this.path);
        this.hash = stringHash(this.filename);
        this.isNew = isNew;
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
        }
        await this.loadInstallationItems();
    }

    async complete() {
        this.completed = true;
        await this.extract();
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
            for (const infPath of infs) {
                const infItem = ini.parse(decode(await fs.readFile(infPath), 'gbk'));
                if (infItem.Strings === undefined) {
                    infItem.Strings = {};
                }
                for (const stringName in infItem.Strings) {
                    const stringValue = infItem.Strings[stringName];
                    if (stringValue === '') {
                        infItem.Strings[stringName] = stringName;                     // work-around for mal-formatted inf
                    }
                    else {
                        infItem.Strings[stringName] = removeQuotes(stringValue);
                    }
                }
                infItem.Strings['10'] = env.systemroot;
                const item = new InstallationItem(infPath, infItem);
                await item.initialize();
                this.installationItems.push(item);
            }
        }
    }
}

export class DownloadList {
    constructor() {
        this.downloadItems = {};
        this.newCount = 0;
    }

    add(downloadPath) {
        this.downloadItems[downloadPath] = new DownloadItem(downloadPath, { isNew : true });
        this.newCount++;
    }

    updateProgress(downloadPath, progress) {
        this.downloadItems[downloadPath].updateProgress(progress);
    }

    async complete(downloadPath) {
        await this.downloadItems[downloadPath].complete();
        await this.persist();
    }

    async persist() {
        const valueToPersist = Object.values(this.downloadItems)
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

    async load() {
        const valueJson = await fs.readFile(downloadItemPath, { encoding: 'utf8' });
        const persistedValues = JSON.parse(valueJson);
        for (const v of persistedValues) {
            this.downloadItems[v.path] = new DownloadItem(v.path, { completed: true, extracted: v.extracted, extractedPath: v.extractedPath });
        }
        for (const downloadItem of Object.values(this.downloadItems)) {
            await downloadItem.initialize();
        }
    }

    async delete(downloadItem) {
        delete this.downloadItems[downloadItem.path];
        await this.persist();
    }

    [Symbol.iterator]() {
        return Object.values(this.downloadItems).toSorted((a, b) => {
            if (a.isNew !== b.isNew) {
                return b.isNew - a.isNew;
            }
            else {
                return a.filename.localeCompare(b.filename);
            }
        }).values();
    }
}