import type { AnchorLine, StaleAnchorInfo } from './types.js';
export declare function makeAnchor(lineNumber: number, content: string): AnchorLine;
export declare function parseAnchorLine(line: string): AnchorLine | null;
export declare function parseReadAnchors(text: string): AnchorLine[];
export declare function formatAnchors(lines: string[], offset?: number): string;
export declare function parseStaleAnchorError(text: string): StaleAnchorInfo;
export declare function findAnchorByContent(anchors: AnchorLine[], content: string): AnchorLine | undefined;
