import assert from 'node:assert/strict';
import test from 'node:test';
import { applyHashlineEdits, computeLineHash, formatAnchors, parseAnchorLine, parseReadAnchors, resolveEditAnchors, } from '../src/index.js';
function ref(line, content) {
    return `${line}#${computeLineHash(line, content)}:${content}`;
}
test('formats and parses anchored read output', () => {
    const formatted = formatAnchors(['alpha', 'beta'], 10);
    const anchors = parseReadAnchors(formatted);
    assert.equal(anchors.length, 2);
    assert.equal(anchors[0]?.lineNumber, 10);
    assert.equal(anchors[1]?.content, 'beta');
    assert.equal(parseAnchorLine('not-an-anchor'), null);
});
test('applies append and prepend edits around anchors', () => {
    const result = applyHashlineEdits('alpha\nbeta', resolveEditAnchors([
        { op: 'prepend', pos: ref(1, 'alpha'), lines: ['before'] },
        { op: 'append', pos: ref(2, 'beta'), lines: ['after'] },
    ]));
    assert.equal(result.content, 'before\nalpha\nbeta\nafter');
});
test('applies a unique exact text replacement', () => {
    const result = applyHashlineEdits('const value = 1;\nconsole.log(value);', resolveEditAnchors([
        { op: 'replace_text', oldText: 'value = 1', newText: 'value = 2' },
    ]));
    assert.equal(result.content, 'const value = 2;\nconsole.log(value);');
});
test('rejects a stale anchor with retry context', () => {
    assert.throws(() => applyHashlineEdits('alpha\nbeta', resolveEditAnchors([
        { op: 'replace', pos: '2#ZZ:beta', lines: ['patched'] },
    ])), /E_STALE_ANCHOR/);
});
