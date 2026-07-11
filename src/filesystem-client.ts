import { chmod, mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { formatAnchors } from './anchors.js';
import { loadFileKindAndText } from './file-kind.js';
import { applyHashlineEdits, resolveEditAnchors, type HashlineToolEdit } from './hashline.js';
import { detectLineEnding, normalizeToLF, restoreLineEndings } from './text.js';
import type { EditParams, PiClient, ReadParams } from './types.js';

function splitLines(text: string): string[] {
  return text.length === 0 ? [] : text.split(/\r?\n/);
}

type LoadedText = { text: string; mode?: number };

async function loadText(path: string): Promise<LoadedText> {
  try {
    const loaded = await loadFileKindAndText(path);
    switch (loaded.kind) {
      case 'text':
        if (loaded.hadUtf8DecodeErrors) {
          throw new Error(`[E_DECODE_LOSS] Refusing to rewrite ${path}: invalid UTF-8 would be replaced.`);
        }
        return { text: loaded.text, mode: (await stat(path)).mode & 0o7777 };
      case 'directory':
        throw new Error(`[E_UNSUPPORTED_FILE] Refusing to read directory: ${path}`);
      case 'symlink':
        throw new Error(`[E_UNSUPPORTED_FILE] Refusing to follow symbolic link: ${path}`);
      case 'image':
        throw new Error(`[E_BINARY_FILE] Refusing to read image (${loaded.mimeType}): ${path}`);
      case 'binary':
        throw new Error(`[E_BINARY_FILE] Refusing to read binary file (${loaded.description}): ${path}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { text: '' };
    }
    throw error;
  }
}


export class FilesystemPiClient implements PiClient {
  protected async replaceTemporaryFile(temporaryPath: string, destinationPath: string): Promise<void> {
    await rename(temporaryPath, destinationPath);
  }

  private async atomicWrite(path: string, content: string, mode?: number): Promise<void> {
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
    const { text: raw, mode } = await loadText(path);
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

    await this.atomicWrite(path, restoreLineEndings(normalized, ending), mode);
    return formatAnchors(splitLines(normalized));
  }
}
