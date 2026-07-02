/**
 * Hashline engine — hash-anchored line editing.
 *
 * Vendored & adapted from oh-my-pi (MIT, github.com/can1357/oh-my-pi).
 */
export type Anchor = {
    line: number;
    hash: string;
    textHint?: string;
};
export type HashlineEdit = {
    op: "replace";
    pos: Anchor;
    end?: Anchor;
    lines: string[];
} | {
    op: "append";
    pos?: Anchor;
    lines: string[];
} | {
    op: "prepend";
    pos?: Anchor;
    lines: string[];
} | {
    op: "replace_text";
    oldText: string;
    newText: string;
};
interface NoopEdit {
    editIndex: number;
    loc: string;
    currentContent: string;
}
export declare function computeLineHash(idx: number, line: string): string;
export declare function resolveEditAnchors(edits: HashlineToolEdit[]): HashlineEdit[];
/** Schema-level edit as received from the tool layer (pos/end are tag strings, lines is canonicalized to an array). */
export type HashlineToolEdit = {
    op: string;
    pos?: string;
    end?: string;
    lines?: string[];
    oldText?: string;
    newText?: string;
};
/**
 * Apply hashline-anchored edits to file content.
 *
 * Three-phase pipeline:
 *   1. validateAnchorEdits — check hash matches, collect warnings + mismatches
 *   2. resolveEditSpans   — map edits to character spans, dedup, conflict-detect, sort
 *   3. assembleEditResult — apply spans back-to-front, compute changed range
 */
export declare function applyHashlineEdits(content: string, edits: HashlineEdit[], signal?: AbortSignal): {
    content: string;
    firstChangedLine: number | undefined;
    lastChangedLine: number | undefined;
    warnings?: string[];
    noopEdits?: NoopEdit[];
};
/**
 * Compute the post-edit line range covering changed lines plus context.
 * Uses `firstChangedLine` and `lastChangedLine` from the edit result for
 * precise bounds. Returns null if the range (with context) exceeds the
 * output budget, signalling that the LLM should re-read instead.
 */
export declare function computeAffectedLineRange(params: {
    firstChangedLine: number | undefined;
    lastChangedLine: number | undefined;
    resultLineCount: number;
    contextLines?: number;
    maxOutputLines?: number;
}): {
    start: number;
    end: number;
} | null;
export declare function formatHashlineRegion(lines: string[], startLine: number): string;
/**
 * Compute first/last changed line numbers between two document versions.
 * Uses character-level diff to locate the changed span, then maps to line
 * numbers in the result document so downstream anchor chaining works.
 */
export declare function computeChangedLineRange(original: string, result: string): {
    firstChangedLine: number;
    lastChangedLine: number;
} | null;
export {};
