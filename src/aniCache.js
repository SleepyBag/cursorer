function getSubString(buffer, begin, end) {
    return String.fromCharCode.apply(String, buffer.subarray(begin, end));
}

async function extractIconFromAni(filename) {
    const bufferArray = await fs.readFile(filename);
    const bufferDataView = new DataView(bufferArray.buffer);
    // skip riff header
    var offset = 12;
    var chunkType = '';
    var chunkSize = 0;
    bufferDataView.buffer.slice()
    while (offset < bufferDataView.byteLength) {
        chunkType = getSubString(bufferArray, offset, offset + 4);
        offset += 4;
        chunkSize = bufferDataView.getUint32(offset, true);
        offset += 4;
        if (chunkType == 'LIST') {
            // skip "fram"
            var innerOffset = offset + 4;
            var innerChunkType = '';
            var innerChunkSize = 0;
            while (innerOffset < offset + chunkSize) {
                innerChunkType = getSubString(bufferArray, innerOffset, innerOffset + 4);
                if (innerChunkType == 'icon') {
                    innerChunkSize = bufferDataView.getUint32(innerOffset + 4, true);
                    return bufferArray.subarray(innerOffset + 8, innerOffset + 8 + innerChunkSize);
                } else {
                    innerChunkSize = bufferDataView.getUint32(innerOffset + 4, true);
                    innerOffset += 8 + innerChunkSize;
                }
            }
        }
        offset += chunkSize;
    }
}

async function checkFileExists(file) {
  return await fs.access(file, fs.constants.F_OK)
           .then(() => true)
           .catch(() => false)
}

export class AniCacher {
    constructor(rootPath) {
        this.rootPath = rootPath;
        this.cachePath = path.join(rootPath, 'cache');
    }

    async getIconPathOfAni(aniPath) {
        const icoPath = path.join(this.cachePath, stringHash(aniPath) + '.ico');
        if (!await checkFileExists(icoPath)) {
            await fs.mkdir(path.dirname(icoPath), { recursive: true });
            console.log(`Extracting ico from .ani file ${aniPath}`);
            const iconContent = await extractIconFromAni(aniPath);
            await fs.writeFile(icoPath, iconContent);
            console.log(`Extracted ico from .ani file ${aniPath}`);
        }
        return icoPath;
    }
}