import { computeLineHash } from './hashline.js';
const ANCHOR_RE = /^(\d+)#([^:]+):(.*)$/;
export function makeAnchor(lineNumber, content) {
    const hash = computeLineHash(lineNumber, content);
    const raw = `${lineNumber}#${hash}:${content}`;
    return { lineNumber, hash, content, raw };
}
export function parseAnchorLine(line) {
    const match = line.match(ANCHOR_RE);
    if (!match)
        return null;
    return {
        lineNumber: Number(match[1]),
        hash: match[2],
        content: match[3],
        raw: line,
    };
}
export function parseReadAnchors(text) {
    return text
        .split(/\r?\n/)
        .map(parseAnchorLine)
        .filter((v) => Boolean(v));
}
export function formatAnchors(lines, offset = 1) {
    return lines.map((line, idx) => makeAnchor(offset + idx, line).raw).join('\n');
}
export function parseStaleAnchorError(text) {
    const suggested = text
        .split(/\r?\n/)
        .map((line) => line.replace(/^>>>\s*/, ''))
        .map(parseAnchorLine)
        .filter((v) => Boolean(v));
    return {
        stale: text.includes('[E_STALE_ANCHOR]'),
        suggested,
        raw: text,
    };
}
export function findAnchorByContent(anchors, content) {
    return anchors.find((a) => a.content === content);
}
