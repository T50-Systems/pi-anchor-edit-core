import { chmod, lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { formatAnchors } from './anchors.js';
import { loadFileKindAndText } from './file-kind.js';
import { applyHashlineEdits, resolveEditAnchors, type HashlineToolEdit } from './hashline.js';
import { detectLineEnding, normalizeToLF, restoreLineEndings } from './text.js';
import type { EditParams, PiClient, ReadParams } from './types.js';

export const FILESYSTEM_DURABILITY_LEVELS = {
  NONE: 'none',
  FILE: 'file',
  FILE_AND_PARENT_DIRECTORY: 'file-and-parent-directory',
} as const;

export type FilesystemDurability =
  typeof FILESYSTEM_DURABILITY_LEVELS[keyof typeof FILESYSTEM_DURABILITY_LEVELS];

export const DEFAULT_FILESYSTEM_DURABILITY: FilesystemDurability =
  FILESYSTEM_DURABILITY_LEVELS.FILE;

export const UNSUPPORTED_DIRECTORY_SYNC_BEHAVIORS = {
  DEGRADE: 'degrade',
  STRICT: 'strict',
} as const;

export type UnsupportedDirectorySyncBehavior =
  typeof UNSUPPORTED_DIRECTORY_SYNC_BEHAVIORS[keyof typeof UNSUPPORTED_DIRECTORY_SYNC_BEHAVIORS];

export const DEFAULT_UNSUPPORTED_DIRECTORY_SYNC_BEHAVIOR: UnsupportedDirectorySyncBehavior =
  UNSUPPORTED_DIRECTORY_SYNC_BEHAVIORS.DEGRADE;

export type FilesystemPiClientConfig = {
  durability?: FilesystemDurability;
  unsupportedDirectorySync?: UnsupportedDirectorySyncBehavior;
};

export type FilesystemDurabilityErrorCode =
  | 'E_DIRECTORY_SYNC_UNSUPPORTED'
  | 'E_DURABILITY_UNCONFIRMED';

export class FilesystemDurabilityError extends Error {
  constructor(
    readonly code: FilesystemDurabilityErrorCode,
    readonly destinationPath: string,
    readonly durability: FilesystemDurability,
    readonly destinationVisible: boolean,
    cause: unknown,
  ) {
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
    this.name = 'FilesystemDurabilityError';
  }
}

function splitLines(text: string): string[] {
  return text.length === 0 ? [] : text.split(/\r?\n/);
}

type DestinationObservation =
  | { state: 'missing' }
  | { state: 'present'; dev: bigint; ino: bigint; size: bigint; mode: number; digest: string }
  | { state: 'unstable' };

type LoadedText = { text: string; mode?: number; observation: DestinationObservation };

const CONCURRENT_DESTINATION_ERROR = 'E_CONCURRENT_DESTINATION';

function digestBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function sameIdentity(
  left: { dev: bigint; ino: bigint },
  right: { dev: bigint; ino: bigint },
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function permissionMode(stats: { mode: bigint }): number {
  return Number(stats.mode & 0o7777n);
}

function sameObservation(left: DestinationObservation, right: DestinationObservation): boolean {
  if (left.state !== right.state) return false;
  if (left.state !== 'present' || right.state !== 'present') return left.state === 'missing';
  return (
    sameIdentity(left, right)
    && left.size === right.size
    && left.mode === right.mode
    && left.digest === right.digest
  );
}

function concurrentDestinationError(path: string): Error {
  return new Error(
    `[${CONCURRENT_DESTINATION_ERROR}] Refusing to replace ${path}: destination changed after it was loaded. Re-read and retry with current anchors.`,
  );
}

async function loadText(path: string): Promise<LoadedText> {
  let before: Awaited<ReturnType<typeof lstat>>;
  try {
    before = await lstat(path, { bigint: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { text: '', observation: { state: 'missing' } };
    }
    throw error;
  }

  let loaded: Awaited<ReturnType<typeof loadFileKindAndText>>;
  try {
    loaded = await loadFileKindAndText(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw concurrentDestinationError(path);
    throw error;
  }

  let after: Awaited<ReturnType<typeof lstat>>;
  try {
    after = await lstat(path, { bigint: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw concurrentDestinationError(path);
    throw error;
  }

  if (!sameIdentity(before, after)) throw concurrentDestinationError(path);

  switch (loaded.kind) {
    case 'text': {
      if (loaded.hadUtf8DecodeErrors) {
        throw new Error(`[E_DECODE_LOSS] Refusing to rewrite ${path}: invalid UTF-8 would be replaced.`);
      }
      let bytes: Buffer;
      let verified: Awaited<ReturnType<typeof lstat>>;
      try {
        bytes = await readFile(path);
        verified = await lstat(path, { bigint: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw concurrentDestinationError(path);
        throw error;
      }
      const decodedBytes = Buffer.from(loaded.text, 'utf8');
      if (
        !sameIdentity(after, verified)
        || verified.size !== BigInt(bytes.length)
        || !bytes.equals(decodedBytes)
      ) {
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

function isUnsupportedDirectorySyncError(error: unknown): boolean {
  const { code, syscall } = (error as NodeJS.ErrnoException | undefined) ?? {};
  return (typeof code === 'string' && UNSUPPORTED_DIRECTORY_SYNC_CODES.has(code))
    || (process.platform === 'win32' && code === 'EPERM' && syscall === 'fsync');
}

function isFilesystemDurability(value: unknown): value is FilesystemDurability {
  return Object.values(FILESYSTEM_DURABILITY_LEVELS).includes(value as FilesystemDurability);
}

function isUnsupportedDirectorySyncBehavior(value: unknown): value is UnsupportedDirectorySyncBehavior {
  return Object.values(UNSUPPORTED_DIRECTORY_SYNC_BEHAVIORS)
    .includes(value as UnsupportedDirectorySyncBehavior);
}

export class FilesystemPiClient implements PiClient {
  private readonly durability: FilesystemDurability;
  private readonly unsupportedDirectorySync: UnsupportedDirectorySyncBehavior;

  constructor(config: FilesystemPiClientConfig = {}) {
    const durability = config.durability ?? DEFAULT_FILESYSTEM_DURABILITY;
    const unsupportedDirectorySync = config.unsupportedDirectorySync
      ?? DEFAULT_UNSUPPORTED_DIRECTORY_SYNC_BEHAVIOR;
    if (!isFilesystemDurability(durability)) {
      throw new TypeError(`Unsupported filesystem durability level: ${String(durability)}`);
    }
    if (!isUnsupportedDirectorySyncBehavior(unsupportedDirectorySync)) {
      throw new TypeError(
        `Unsupported directory-sync behavior: ${String(unsupportedDirectorySync)}`,
      );
    }
    this.durability = durability;
    this.unsupportedDirectorySync = unsupportedDirectorySync;
  }

  protected async beforeDestinationRevalidation(_destinationPath: string): Promise<void> {}

  protected async applyTemporaryFileMode(temporaryPath: string, mode: number): Promise<void> {
    await chmod(temporaryPath, mode);
  }

  protected async synchronizeTemporaryFile(handle: FileHandle): Promise<void> {
    await handle.sync();
  }

  protected async replaceTemporaryFile(temporaryPath: string, destinationPath: string): Promise<void> {
    await rename(temporaryPath, destinationPath);
  }

  protected async openParentDirectoryForSync(parentPath: string): Promise<FileHandle> {
    return open(parentPath, 'r');
  }

  protected async synchronizeParentDirectory(
    handle: FileHandle,
    _parentPath: string,
  ): Promise<void> {
    await handle.sync();
  }

  private handleDirectorySyncFailure(
    error: unknown,
    destinationPath: string,
    destinationVisible: boolean,
  ): void {
    const unsupported = isUnsupportedDirectorySyncError(error);
    if (unsupported && this.unsupportedDirectorySync === UNSUPPORTED_DIRECTORY_SYNC_BEHAVIORS.DEGRADE) {
      return;
    }
    throw new FilesystemDurabilityError(
      unsupported ? 'E_DIRECTORY_SYNC_UNSUPPORTED' : 'E_DURABILITY_UNCONFIRMED',
      destinationPath,
      this.durability,
      destinationVisible,
      error,
    );
  }

  private async openParentBeforeRename(
    parentPath: string,
    destinationPath: string,
  ): Promise<FileHandle | undefined> {
    try {
      return await this.openParentDirectoryForSync(parentPath);
    } catch (error) {
      this.handleDirectorySyncFailure(error, destinationPath, false);
      return undefined;
    }
  }

  private async synchronizeParentAfterRename(
    handle: FileHandle,
    parentPath: string,
    destinationPath: string,
  ): Promise<void> {
    try {
      await this.synchronizeParentDirectory(handle, parentPath);
    } catch (error) {
      this.handleDirectorySyncFailure(error, destinationPath, true);
    }
  }

  private async observeDestination(path: string): Promise<DestinationObservation> {
    let pathBefore: Awaited<ReturnType<typeof lstat>>;
    try {
      pathBefore = await lstat(path, { bigint: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { state: 'missing' };
      throw error;
    }

    if (!pathBefore.isFile()) return { state: 'unstable' };

    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(path, 'r');
      const openedBefore = await handle.stat({ bigint: true });
      const bytes = await handle.readFile();
      const openedAfter = await handle.stat({ bigint: true });
      const pathAfter = await lstat(path, { bigint: true });

      if (
        !pathAfter.isFile()
        || !sameIdentity(pathBefore, openedBefore)
        || !sameIdentity(openedBefore, openedAfter)
        || !sameIdentity(openedAfter, pathAfter)
        || permissionMode(pathBefore) !== permissionMode(openedBefore)
        || permissionMode(openedBefore) !== permissionMode(openedAfter)
        || permissionMode(openedAfter) !== permissionMode(pathAfter)
        || openedAfter.size !== BigInt(bytes.length)
      ) {
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
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { state: 'missing' };
      throw error;
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }

  private async atomicWrite(
    path: string,
    content: string,
    mode: number | undefined,
    observation: DestinationObservation,
  ): Promise<void> {
    const parent = dirname(path);
    await mkdir(parent, { recursive: true });
    const temporaryPath = join(parent, `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
    let handle: FileHandle | undefined;
    let parentHandle: FileHandle | undefined;

    try {
      handle = await open(temporaryPath, 'wx', mode ?? 0o666);
      await handle.writeFile(content, 'utf8');
      if (mode !== undefined) await this.applyTemporaryFileMode(temporaryPath, mode);
      if (this.durability !== FILESYSTEM_DURABILITY_LEVELS.NONE) {
        await this.synchronizeTemporaryFile(handle);
      }
      await handle.close();
      handle = undefined;
      if (this.durability === FILESYSTEM_DURABILITY_LEVELS.FILE_AND_PARENT_DIRECTORY) {
        parentHandle = await this.openParentBeforeRename(parent, path);
      }
      await this.beforeDestinationRevalidation(path);
      const currentObservation = await this.observeDestination(path);
      if (!sameObservation(observation, currentObservation)) throw concurrentDestinationError(path);
      // Best-effort only: the destination can still change after this check and before rename.
      await this.replaceTemporaryFile(temporaryPath, path);
      if (parentHandle !== undefined) {
        await this.synchronizeParentAfterRename(parentHandle, parent, path);
      }
    } finally {
      await handle?.close().catch(() => undefined);
      await parentHandle?.close().catch(() => undefined);
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }

  async read({ path, offset = 1, limit = 2000 }: ReadParams): Promise<string> {
    const { text: content } = await loadText(path);
    const normalized = normalizeToLF(content);
    const lines = splitLines(normalized);
    const slice = lines.slice(offset - 1, offset - 1 + limit);
    return formatAnchors(slice, offset);
  }

  async edit({ path, edits }: EditParams): Promise<string> {
    let loaded: LoadedText;
    try {
      loaded = await loadText(path);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith(`[${CONCURRENT_DESTINATION_ERROR}]`)) return message;
      throw error;
    }
    const { text: raw, mode, observation } = loaded;
    const ending = detectLineEnding(raw);
    let normalized = normalizeToLF(raw);

    try {
      const result = applyHashlineEdits(
        normalized,
        resolveEditAnchors(edits as HashlineToolEdit[]),
      );
      normalized = result.content;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith('[E_')) return message;
      throw error;
    }

    try {
      await this.atomicWrite(path, restoreLineEndings(normalized, ending), mode, observation);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith(`[${CONCURRENT_DESTINATION_ERROR}]`)) return message;
      throw error;
    }
    return formatAnchors(splitLines(normalized));
  }
}
