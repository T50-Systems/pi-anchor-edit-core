import { lstat as fsLstat, open as fsOpen } from 'node:fs/promises';
import { fileTypeFromBuffer } from 'file-type';
const IMAGE_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
]);
const TEXT_LIKE_MIME_TYPES = new Set([
    'application/rtf',
    'application/xml',
    'application/x-ms-regedit',
]);
function isTextLikeMimeType(mimeType) {
    return mimeType.startsWith('text/') || TEXT_LIKE_MIME_TYPES.has(mimeType);
}
const FILE_TYPE_SNIFF_BYTES = 8192;
function hasNullByte(buffer) {
    return buffer.includes(0);
}
export async function loadFileKindAndText(filePath) {
    const pathStat = await fsLstat(filePath);
    if (pathStat.isSymbolicLink()) {
        return { kind: 'symlink' };
    }
    if (pathStat.isDirectory()) {
        return { kind: 'directory' };
    }
    if (!pathStat.isFile()) {
        return { kind: 'binary', description: 'unsupported file type' };
    }
    const fileHandle = await fsOpen(filePath, 'r');
    try {
        const buffer = Buffer.alloc(FILE_TYPE_SNIFF_BYTES);
        const { bytesRead } = await fileHandle.read(buffer, 0, FILE_TYPE_SNIFF_BYTES, 0);
        if (bytesRead === 0) {
            return { kind: 'text', text: '' };
        }
        const sample = buffer.subarray(0, bytesRead);
        const detectedMimeType = (await fileTypeFromBuffer(sample))?.mime;
        if (detectedMimeType !== undefined && !isTextLikeMimeType(detectedMimeType)) {
            if (IMAGE_MIME_TYPES.has(detectedMimeType)) {
                return { kind: 'image', mimeType: detectedMimeType };
            }
            return { kind: 'binary', description: detectedMimeType };
        }
        if (hasNullByte(sample)) {
            return { kind: 'binary', description: 'null bytes detected' };
        }
        // Preserve a UTF-8 BOM as content so a read/edit round trip is byte-safe.
        const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
        const fatalDecoder = new TextDecoder('utf-8', { fatal: true });
        let hadUtf8DecodeErrors = false;
        const noteUtf8DecodeErrors = (chunk) => {
            if (hadUtf8DecodeErrors)
                return;
            try {
                fatalDecoder.decode(chunk, { stream: chunk !== undefined });
            }
            catch (error) {
                if (error instanceof TypeError) {
                    hadUtf8DecodeErrors = true;
                    return;
                }
                throw error;
            }
        };
        noteUtf8DecodeErrors(sample);
        const parts = [decoder.decode(sample, { stream: true })];
        let position = bytesRead;
        while (true) {
            const { bytesRead: chunkBytesRead } = await fileHandle.read(buffer, 0, FILE_TYPE_SNIFF_BYTES, position);
            if (chunkBytesRead === 0)
                break;
            const chunk = buffer.subarray(0, chunkBytesRead);
            if (hasNullByte(chunk)) {
                return { kind: 'binary', description: 'null bytes detected' };
            }
            noteUtf8DecodeErrors(chunk);
            parts.push(decoder.decode(chunk, { stream: true }));
            position += chunkBytesRead;
        }
        noteUtf8DecodeErrors();
        parts.push(decoder.decode());
        return {
            kind: 'text',
            text: parts.join(''),
            ...(hadUtf8DecodeErrors ? { hadUtf8DecodeErrors: true } : {}),
        };
    }
    finally {
        await fileHandle.close();
    }
}
