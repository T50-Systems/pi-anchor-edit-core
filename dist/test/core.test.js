import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FilesystemPiClient, applyHashlineEdits, computeLineHash, parseStaleAnchorError, resolveEditAnchors, } from '../src/index.js';
test('parse stale anchor suggestions', () => {
    const info = parseStaleAnchorError(`
[E_STALE_ANCHOR] nope
>>> 12#ABCD1234:hello
>>> 13#EEEE9999:world
`.trim());
    assert.equal(info.stale, true);
    assert.equal(info.suggested.length, 2);
    assert.equal(info.suggested[0]?.content, 'hello');
});
test('apply hashline edits replaces anchored line', () => {
    const result = applyHashlineEdits('alpha\nbeta', resolveEditAnchors([{ op: 'replace', pos: `2#${computeLineHash(2, 'beta')}:beta`, lines: ['patched'] }]));
    assert.equal(result.content, 'alpha\npatched');
});
test('filesystem client preserves CRLF on write', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pi-anchor-edit-core-'));
    const path = join(dir, 'a.txt');
    await writeFile(path, 'one\r\ntwo', 'utf8');
    const client = new FilesystemPiClient();
    const preview = await client.read({ path });
    const pos = preview.split(/\r?\n/)[1];
    await client.edit({ path, edits: [{ op: 'replace', pos, lines: ['patched'] }] });
    const text = await readFile(path, 'utf8');
    assert.equal(text, 'one\r\npatched');
});
