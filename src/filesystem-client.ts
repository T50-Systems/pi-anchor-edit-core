import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { formatAnchors, makeAnchor, parseAnchorLine } from './anchors.js';
import { applyHashlineEdits, resolveEditAnchors, type HashlineToolEdit } from './hashline.js';
import { detectLineEnding, normalizeToLF, restoreLineEndings } from './text.js';
import type { EditParams, PiClient, ReadParams, ReplaceLikeEditOp } from './types.js';

function splitLines(text: string): string[] {
  return text.length === 0 ? [] : text.split(/\r?\n/);
}

async function loadText(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

function ensureAnchorMatches(lines: string[], anchorRaw: string): { ok: true; index: number } | { ok: false; message: string } {
  const anchor = parseAnchorLine(anchorRaw);
  if (!anchor) {
    return { ok: false, message: `[E_INVALID_PATCH] Invalid anchor: ${anchorRaw}` };
  }

  const index = anchor.lineNumber - 1;
  const currentLine = lines[index];
  if (currentLine === undefined) {
    return {
      ok: false,
      message: `[E_STALE_ANCHOR] Anchor no longer exists.\n>>> ${makeAnchor(Math.max(anchor.lineNumber, 1), '').raw}`,
    };
  }

  const currentAnchor = makeAnchor(anchor.lineNumber, currentLine);
  if (currentAnchor.raw !== anchorRaw) {
    return {
      ok: false,
      message: `[E_STALE_ANCHOR] Anchor changed.\n>>> ${currentAnchor.raw}`,
    };
  }

  return { ok: true, index };
}

function applyReplaceText(text: string, oldText: string, newText: string): string {
  const parts = text.split(oldText);
  if (parts.length !== 2) {
    return '[E_INVALID_PATCH] replace_text requires one unique exact occurrence';
  }
  return parts.join(newText);
}

function applySimpleFallback(lines: string[], edit: ReplaceLikeEditOp): string[] | string {
  const next = [...lines];
  const payload = edit.lines ?? [];

  if (edit.op === 'append' && !edit.pos) return [...next, ...payload];
  if (edit.op === 'prepend' && !edit.pos) return [...payload, ...next];
  if (!edit.pos) return `[E_INVALID_PATCH] ${edit.op} requires pos unless appending/prepending at file boundary`;

  const start = ensureAnchorMatches(next, edit.pos);
  if (!start.ok) return start.message;

  if (edit.op === 'append') {
    next.splice(start.index + 1, 0, ...payload);
    return next;
  }

  if (edit.op === 'prepend') {
    next.splice(start.index, 0, ...payload);
    return next;
  }

  if (edit.end) {
    const end = ensureAnchorMatches(next, edit.end);
    if (!end.ok) return end.message;
    next.splice(start.index, end.index - start.index + 1, ...payload);
    return next;
  }

  next.splice(start.index, 1, ...payload);
  return next;
}

export class FilesystemPiClient implements PiClient {
  async read({ path, offset = 1, limit = 2000 }: ReadParams): Promise<string> {
    const content = await loadText(path);
    const normalized = normalizeToLF(content);
    const lines = splitLines(normalized);
    const slice = lines.slice(offset - 1, offset - 1 + limit);
    return formatAnchors(slice, offset);
  }

  async edit({ path, edits }: EditParams): Promise<string> {
    const raw = await loadText(path);
    const ending = detectLineEnding(raw);
    let normalized = normalizeToLF(raw);

    for (const edit of edits) {
      if (edit.op === 'replace_text') {
        const replaced = applyReplaceText(normalized, edit.oldText, edit.newText);
        if (replaced.startsWith('[E_INVALID_PATCH]')) return replaced;
        normalized = replaced;
        continue;
      }

      try {
        const result = applyHashlineEdits(normalized, resolveEditAnchors([edit as HashlineToolEdit]));
        normalized = result.content;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith('[E_STALE_ANCHOR]') || message.startsWith('[E_BAD_REF]') || message.startsWith('[E_RANGE_OOB]') || message.startsWith('[E_BAD_OP]') || message.startsWith('[E_EDIT_CONFLICT]') || message.startsWith('[E_NO_MATCH]') || message.startsWith('[E_MULTI_MATCH]') || message.startsWith('[E_WOULD_EMPTY]') || message.startsWith('[E_INVALID_PATCH]')) {
          return message;
        }

        const fallback = applySimpleFallback(splitLines(normalized), edit);
        if (typeof fallback === 'string') return fallback;
        normalized = fallback.join('\n');
      }
    }

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, restoreLineEndings(normalized, ending), 'utf8');
    return formatAnchors(splitLines(normalized));
  }
}
