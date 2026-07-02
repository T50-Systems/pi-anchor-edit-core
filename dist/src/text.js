export function detectLineEnding(content) {
    const crlfIdx = content.indexOf('\r\n');
    const lfIdx = content.indexOf('\n');
    if (lfIdx === -1 || crlfIdx === -1)
        return '\n';
    return crlfIdx < lfIdx ? '\r\n' : '\n';
}
export function normalizeToLF(text) {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}
export function restoreLineEndings(text, ending) {
    return ending === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
}
export function stripBom(content) {
    return content.startsWith('\uFEFF')
        ? { bom: '\uFEFF', text: content.slice(1) }
        : { bom: '', text: content };
}
