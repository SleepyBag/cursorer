const settingsPath = 'settings.json';

export class Settings {
    randomCursorInterval = 3600;
    randomSchemeCandidates = {};

    async load() {
        try {
            const valueJson = await fs.readFile(settingsPath, { encoding: 'utf8' });
            const jsonSettings = JSON.parse(valueJson);
            this.randomCursorInterval = jsonSettings.randomCursorInterval;
            for (const schemeName of jsonSettings.randomSchemeCandidates) {
                this.randomSchemeCandidates[schemeName] = true;
            }
        }
        catch {
            console.log(`Settings path ${settingsPath} doesn't exists or crashed, skip loading.`);
        }
    }

    async persist() {
        const valueJson = JSON.stringify({
            randomCursorInterval: this.randomCursorInterval,
            randomSchemeCandidates: Object.keys(this.randomSchemeCandidates).filter(schemeName => this.randomSchemeCandidates[schemeName])
        });
        await writeFileAtomic(settingsPath, valueJson);
    }
}