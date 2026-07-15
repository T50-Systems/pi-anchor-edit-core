import { chmod, lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { formatAnchors } from './anchors.js';
import { loadFileKindAndText } from './file-kind.js';
import { applyHashlineEdits, resolveEditAnchors, type HashlineToolEdit } from './hashline.js';
import { detectLineEnding, normalizeToLF, restoreLineEndings } from './text.js';
import type { EditParams, PiClient, ReadParams } from './types.js';

function splitLines(text: string): string[] {
  return text.length === 0 ? [] : text.split(/\r?\n/);
}

type DestinationObservation =
  | { state: 'missing' }
  | { state: 'present'; dev: bigint; ino: bigint; size: bigint; digest: string }
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

function sameObservation(left: DestinationObservation, right: DestinationObservation): boolean {
  if (left.state !== right.state) return false;
  if (left.state !== 'present' || right.state !== 'present') return left.state === 'missing';
  return (
    sameIdentity(left, right)
    && left.size === right.size
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
      return {
        text: loaded.text,
        mode: Number(verified.mode & 0o7777n),
        observation: {
          state: 'present',
          dev: verified.dev,
          ino: verified.ino,
          size: verified.size,
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


export class FilesystemPiClient implements PiClient {
  protected async beforeDestinationRevalidation(_destinationPath: string): Promise<void> {}

  protected async replaceTemporaryFile(temporaryPath: string, destinationPath: string): Promise<void> {
    await rename(temporaryPath, destinationPath);
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
        || openedAfter.size !== BigInt(bytes.length)
      ) {
        return { state: 'unstable' };
      }

      return {
        state: 'present',
        dev: pathAfter.dev,
        ino: pathAfter.ino,
        size: pathAfter.size,
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
    let handle: Awaited<ReturnType<typeof open>> | undefined;

    try {
      handle = await open(temporaryPath, 'wx', mode ?? 0o666);
      await handle.writeFile(content, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      if (mode !== undefined) await chmod(temporaryPath, mode);
      await this.beforeDestinationRevalidation(path);
      const currentObservation = await this.observeDestination(path);
      if (!sameObservation(observation, currentObservation)) throw concurrentDestinationError(path);
      // Best-effort only: the destination can still change after this check and before rename.
      await this.replaceTemporaryFile(temporaryPath, path);
    } finally {
      await handle?.close().catch(() => undefined);
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
