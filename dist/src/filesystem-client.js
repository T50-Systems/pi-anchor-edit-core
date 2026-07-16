import { chmod, lstat, mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { formatAnchors } from './anchors.js';
import { loadFileKindAndText } from './file-kind.js';
import { applyHashlineEdits, resolveEditAnchors } from './hashline.js';
import { detectLineEnding, normalizeToLF, restoreLineEndings } from './text.js';
export const FILESYSTEM_DURABILITY_LEVELS = {
    NONE: 'none',
    FILE: 'file',
    FILE_AND_PARENT_DIRECTORY: 'file-and-parent-directory',
};
export const DEFAULT_FILESYSTEM_DURABILITY = FILESYSTEM_DURABILITY_LEVELS.FILE;
export const UNSUPPORTED_DIRECTORY_SYNC_BEHAVIORS = {
    DEGRADE: 'degrade',
    STRICT: 'strict',
};
export const DEFAULT_UNSUPPORTED_DIRECTORY_SYNC_BEHAVIOR = UNSUPPORTED_DIRECTORY_SYNC_BEHAVIORS.DEGRADE;
export class FilesystemDurabilityError extends Error {
    code;
    destinationPath;
    durability;
    destinationVisible;
    constructor(code, destinationPath, durability, destinationVisible, cause) {
        const detail = code === 'E_DIRECTORY_SYNC_UNSUPPORTED'
            ? 'parent-directory synchronization is unsupported'
            : 'parent-directory synchronization failed';
        const boundary = destinationVisible
            ? `${destinationPath} was replaced and is visible`
            : `${destinationPath} was not replaced`;
        const recovery = destinationVisible
            ? 'Crash durability is not confirmed. Re-read before retrying.'
            : 'The original destination is unchanged.';
        super(`[${code}] ${boundary}, but ${detail}. ${recovery}`, { cause });
        this.code = code;
        this.destinationPath = destinationPath;
        this.durability = durability;
        this.destinationVisible = destinationVisible;
        this.name = 'FilesystemDurabilityError';
    }
}
function splitLines(text) {
    return text.length === 0 ? [] : text.split(/\r?\n/);
}
const CONCURRENT_DESTINATION_ERROR = 'E_CONCURRENT_DESTINATION';
function digestBytes(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}
function sameIdentity(left, right) {
    return left.dev === right.dev && left.ino === right.ino;
}
function permissionMode(stats) {
    return Number(stats.mode & 4095n);
}
function sameObservation(left, right) {
    if (left.state !== right.state)
        return false;
    if (left.state !== 'present' || right.state !== 'present')
        return left.state === 'missing';
    return (sameIdentity(left, right)
        && left.size === right.size
        && left.mode === right.mode
        && left.digest === right.digest);
}
function concurrentDestinationError(path) {
    return new Error(`[${CONCURRENT_DESTINATION_ERROR}] Refusing to replace ${path}: destination changed after it was loaded. Re-read and retry with current anchors.`);
}
async function loadText(path) {
    let before;
    try {
        before = await lstat(path, { bigint: true });
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return { text: '', observation: { state: 'missing' } };
        }
        throw error;
    }
    let loaded;
    try {
        loaded = await loadFileKindAndText(path);
    }
    catch (error) {
        if (error.code === 'ENOENT')
            throw concurrentDestinationError(path);
        throw error;
    }
    let after;
    try {
        after = await lstat(path, { bigint: true });
    }
    catch (error) {
        if (error.code === 'ENOENT')
            throw concurrentDestinationError(path);
        throw error;
    }
    if (!sameIdentity(before, after))
        throw concurrentDestinationError(path);
    switch (loaded.kind) {
        case 'text': {
            if (loaded.hadUtf8DecodeErrors) {
                throw new Error(`[E_DECODE_LOSS] Refusing to rewrite ${path}: invalid UTF-8 would be replaced.`);
            }
            let bytes;
            let verified;
            try {
                bytes = await readFile(path);
                verified = await lstat(path, { bigint: true });
            }
            catch (error) {
                if (error.code === 'ENOENT')
                    throw concurrentDestinationError(path);
                throw error;
            }
            const decodedBytes = Buffer.from(loaded.text, 'utf8');
            if (!sameIdentity(after, verified)
                || verified.size !== BigInt(bytes.length)
                || !bytes.equals(decodedBytes)) {
                throw concurrentDestinationError(path);
            }
            const mode = permissionMode(verified);
            return {
                text: loaded.text,
                mode,
                observation: {
                    state: 'present',
                    dev: verified.dev,
                    ino: verified.ino,
                    size: verified.size,
                    mode,
                    digest: digestBytes(bytes),
                },
            };
        }
        case 'directory':
            throw new Error(`[E_UNSUPPORTED_FILE] Refusing to read directory: ${path}`);
        case 'symlink':
            throw new Error(`[E_UNSUPPORTED_FILE] Refusing to follow symbolic link: ${path}`);
        case 'image':
            throw new Error(`[E_BINARY_FILE] Refusing to read image (${loaded.mimeType}): ${path}`);
        case 'binary':
            throw new Error(`[E_BINARY_FILE] Refusing to read binary file (${loaded.description}): ${path}`);
    }
}
const UNSUPPORTED_DIRECTORY_SYNC_CODES = new Set([
    'EBADF',
    'EISDIR',
    'EINVAL',
    'ENOSYS',
    'ENOTSUP',
    'EOPNOTSUPP',
]);
function isUnsupportedDirectorySyncError(error) {
    const { code, syscall } = error ?? {};
    return (typeof code === 'string' && UNSUPPORTED_DIRECTORY_SYNC_CODES.has(code))
        || (process.platform === 'win32' && code === 'EPERM' && syscall === 'fsync');
}
function isFilesystemDurability(value) {
    return Object.values(FILESYSTEM_DURABILITY_LEVELS).includes(value);
}
function isUnsupportedDirectorySyncBehavior(value) {
    return Object.values(UNSUPPORTED_DIRECTORY_SYNC_BEHAVIORS)
        .includes(value);
}
export class FilesystemPiClient {
    durability;
    unsupportedDirectorySync;
    constructor(config = {}) {
        const durability = config.durability ?? DEFAULT_FILESYSTEM_DURABILITY;
        const unsupportedDirectorySync = config.unsupportedDirectorySync
            ?? DEFAULT_UNSUPPORTED_DIRECTORY_SYNC_BEHAVIOR;
        if (!isFilesystemDurability(durability)) {
            throw new TypeError(`Unsupported filesystem durability level: ${String(durability)}`);
        }
        if (!isUnsupportedDirectorySyncBehavior(unsupportedDirectorySync)) {
            throw new TypeError(`Unsupported directory-sync behavior: ${String(unsupportedDirectorySync)}`);
        }
        this.durability = durability;
        this.unsupportedDirectorySync = unsupportedDirectorySync;
    }
    async beforeDestinationRevalidation(_destinationPath) { }
    async applyTemporaryFileMode(temporaryPath, mode) {
        await chmod(temporaryPath, mode);
    }
    async synchronizeTemporaryFile(handle) {
        await handle.sync();
    }
    async replaceTemporaryFile(temporaryPath, destinationPath) {
        await rename(temporaryPath, destinationPath);
    }
    async openParentDirectoryForSync(parentPath) {
        return open(parentPath, 'r');
    }
    async synchronizeParentDirectory(handle, _parentPath) {
        await handle.sync();
    }
    handleDirectorySyncFailure(error, destinationPath, destinationVisible) {
        const unsupported = isUnsupportedDirectorySyncError(error);
        if (unsupported && this.unsupportedDirectorySync === UNSUPPORTED_DIRECTORY_SYNC_BEHAVIORS.DEGRADE) {
            return;
        }
        throw new FilesystemDurabilityError(unsupported ? 'E_DIRECTORY_SYNC_UNSUPPORTED' : 'E_DURABILITY_UNCONFIRMED', destinationPath, this.durability, destinationVisible, error);
    }
    async openParentBeforeRename(parentPath, destinationPath) {
        let handle;
        try {
            handle = await this.openParentDirectoryForSync(parentPath);
            const stats = await handle.stat({ bigint: true });
            if (!stats.isDirectory()) {
                const error = new Error(`Parent path is no longer a directory: ${parentPath}`);
                error.code = 'E_PARENT_DIRECTORY_CHANGED';
                throw error;
            }
            return { handle, dev: stats.dev, ino: stats.ino };
        }
        catch (error) {
            await handle?.close().catch(() => undefined);
            this.handleDirectorySyncFailure(error, destinationPath, false);
            return undefined;
        }
    }
    async verifyPinnedParent(parentSync, parentPath, destinationPath, destinationVisible) {
        let cause;
        try {
            const stats = await stat(parentPath, { bigint: true });
            if (stats.isDirectory() && sameIdentity(parentSync, stats))
                return;
            cause = new Error(`Parent directory changed during replacement: ${parentPath}`);
        }
        catch (error) {
            cause = error;
        }
        throw new FilesystemDurabilityError('E_DURABILITY_UNCONFIRMED', destinationPath, this.durability, destinationVisible, cause);
    }
    async synchronizeParentAfterRename(parentSync, parentPath, destinationPath) {
        try {
            await this.synchronizeParentDirectory(parentSync.handle, parentPath);
        }
        catch (error) {
            this.handleDirectorySyncFailure(error, destinationPath, true);
        }
    }
    async observeDestination(path) {
        let pathBefore;
        try {
            pathBefore = await lstat(path, { bigint: true });
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return { state: 'missing' };
            throw error;
        }
        if (!pathBefore.isFile())
            return { state: 'unstable' };
        let handle;
        try {
            handle = await open(path, 'r');
            const openedBefore = await handle.stat({ bigint: true });
            const bytes = await handle.readFile();
            const openedAfter = await handle.stat({ bigint: true });
            const pathAfter = await lstat(path, { bigint: true });
            if (!pathAfter.isFile()
                || !sameIdentity(pathBefore, openedBefore)
                || !sameIdentity(openedBefore, openedAfter)
                || !sameIdentity(openedAfter, pathAfter)
                || permissionMode(pathBefore) !== permissionMode(openedBefore)
                || permissionMode(openedBefore) !== permissionMode(openedAfter)
                || permissionMode(openedAfter) !== permissionMode(pathAfter)
                || openedAfter.size !== BigInt(bytes.length)) {
                return { state: 'unstable' };
            }
            return {
                state: 'present',
                dev: pathAfter.dev,
                ino: pathAfter.ino,
                size: pathAfter.size,
                mode: permissionMode(pathAfter),
                digest: digestBytes(bytes),
            };
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return { state: 'missing' };
            throw error;
        }
        finally {
            await handle?.close().catch(() => undefined);
        }
    }
    async atomicWrite(path, content, mode, observation) {
        const parent = dirname(path);
        await mkdir(parent, { recursive: true });
        const temporaryPath = join(parent, `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
        let handle;
        let parentSync;
        try {
            handle = await open(temporaryPath, 'wx', mode ?? 0o666);
            await handle.writeFile(content, 'utf8');
            if (mode !== undefined)
                await this.applyTemporaryFileMode(temporaryPath, mode);
            if (this.durability !== FILESYSTEM_DURABILITY_LEVELS.NONE) {
                await this.synchronizeTemporaryFile(handle);
            }
            await handle.close();
            handle = undefined;
            if (this.durability === FILESYSTEM_DURABILITY_LEVELS.FILE_AND_PARENT_DIRECTORY) {
                parentSync = await this.openParentBeforeRename(parent, path);
            }
            await this.beforeDestinationRevalidation(path);
            const currentObservation = await this.observeDestination(path);
            if (!sameObservation(observation, currentObservation))
                throw concurrentDestinationError(path);
            if (parentSync !== undefined) {
                await this.verifyPinnedParent(parentSync, parent, path, false);
            }
            // Best-effort only: the destination or parent can still change during rename.
            await this.replaceTemporaryFile(temporaryPath, path);
            if (parentSync !== undefined) {
                await this.verifyPinnedParent(parentSync, parent, path, true);
                await this.synchronizeParentAfterRename(parentSync, parent, path);
            }
        }
        finally {
            await handle?.close().catch(() => undefined);
            await parentSync?.handle.close().catch(() => undefined);
            await rm(temporaryPath, { force: true }).catch(() => undefined);
        }
    }
    async read({ path, offset = 1, limit = 2000 }) {
        const { text: content } = await loadText(path);
        const normalized = normalizeToLF(content);
        const lines = splitLines(normalized);
        const slice = lines.slice(offset - 1, offset - 1 + limit);
        return formatAnchors(slice, offset);
    }
    async edit({ path, edits }) {
        let loaded;
        try {
            loaded = await loadText(path);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.startsWith(`[${CONCURRENT_DESTINATION_ERROR}]`))
                return message;
            throw error;
        }
        const { text: raw, mode, observation } = loaded;
        const ending = detectLineEnding(raw);
        let normalized = normalizeToLF(raw);
        try {
            const result = applyHashlineEdits(normalized, resolveEditAnchors(edits));
            normalized = result.content;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.startsWith('[E_'))
                return message;
            throw error;
        }
        try {
            await this.atomicWrite(path, restoreLineEndings(normalized, ending), mode, observation);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.startsWith(`[${CONCURRENT_DESTINATION_ERROR}]`))
                return message;
            throw error;
        }
        return formatAnchors(splitLines(normalized));
    }
}
