import assert from 'node:assert/strict';
import test from 'node:test';
import { chmod, link, lstat, mkdtemp, readFile, readdir, rename, rm, stat, symlink, utimes, writeFile, } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { FilesystemPiClient, loadFileKindAndText } from '../src/index.js';
async function fixture(name = 'file.txt') {
    const dir = await mkdtemp(join(tmpdir(), 'pi-anchor-edit-core-'));
    return { dir, path: join(dir, name) };
}
function secondAnchor(preview) {
    const anchor = preview.split('\n')[1];
    assert.ok(anchor, 'expected a second anchor');
    return anchor;
}
class FailingReplacementClient extends FilesystemPiClient {
    async replaceTemporaryFile() {
        throw new Error('simulated replacement failure');
    }
}
class RevalidationRaceClient extends FilesystemPiClient {
    race;
    constructor(race) {
        super();
        this.race = race;
    }
    async beforeDestinationRevalidation(destinationPath) {
        await this.race(destinationPath);
    }
}
function expectedConcurrentDestinationError(path) {
    return `[E_CONCURRENT_DESTINATION] Refusing to replace ${path}: destination changed after it was loaded. Re-read and retry with current anchors.`;
}
async function assertNoTemporaryFiles(dir) {
    assert.deepEqual((await readdir(dir)).filter((entry) => entry.includes('.tmp')), []);
}
test('classifies empty and ordinary UTF-8 text', async () => {
    const { path } = await fixture();
    await writeFile(path, '');
    assert.deepEqual(await loadFileKindAndText(path), { kind: 'text', text: '' });
    await writeFile(path, 'plain text');
    assert.deepEqual(await loadFileKindAndText(path), { kind: 'text', text: 'plain text' });
});
test('classifies directories, images, null bytes, and invalid UTF-8', async () => {
    const { dir, path } = await fixture();
    assert.deepEqual(await loadFileKindAndText(dir), { kind: 'directory' });
    await writeFile(path, Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
    assert.deepEqual(await loadFileKindAndText(path), { kind: 'image', mimeType: 'image/png' });
    await writeFile(path, Buffer.from([0x61, 0, 0x62]));
    assert.deepEqual(await loadFileKindAndText(path), { kind: 'binary', description: 'null bytes detected' });
    await writeFile(path, Buffer.from([0x61, 0xc3, 0x28]));
    const decoded = await loadFileKindAndText(path);
    assert.equal(decoded.kind, 'text');
    assert.equal(decoded.kind === 'text' && decoded.hadUtf8DecodeErrors, true);
});
test('rejects unsafe classifications without writing', async () => {
    const client = new FilesystemPiClient();
    const { dir, path } = await fixture();
    await assert.rejects(() => client.read({ path: dir }), /E_UNSUPPORTED_FILE/);
    for (const bytes of [Buffer.from([0x61, 0, 0x62]), Buffer.from([0x61, 0xc3, 0x28])]) {
        await writeFile(path, bytes);
        await assert.rejects(() => client.edit({ path, edits: [{ op: 'prepend', lines: ['unsafe'] }] }), /E_(?:BINARY_FILE|DECODE_LOSS)/);
        assert.deepEqual(await readFile(path), bytes);
    }
});
test('creates a missing text file atomically', async () => {
    const client = new FilesystemPiClient();
    const { path } = await fixture('nested/new.txt');
    assert.equal(await client.read({ path }), '');
    await client.edit({ path, edits: [{ op: 'prepend', lines: ['created'] }] });
    assert.equal(await readFile(path, 'utf8'), 'created');
});
test('preserves CRLF, UTF-8 BOM, and an existing permission mode', async (t) => {
    const client = new FilesystemPiClient();
    const { path } = await fixture();
    await writeFile(path, '\uFEFFone\r\ntwo');
    const canAssertMode = process.platform !== 'win32';
    if (canAssertMode)
        await chmod(path, 0o640);
    const preview = await client.read({ path });
    await client.edit({ path, edits: [{ op: 'replace', pos: secondAnchor(preview), lines: ['patched'] }] });
    assert.equal(await readFile(path, 'utf8'), '\uFEFFone\r\npatched');
    if (canAssertMode) {
        assert.equal((await stat(path)).mode & 0o777, 0o640);
    }
    else {
        t.diagnostic('permission-bit assertion unavailable on Windows; CRLF/BOM assertions still ran');
    }
});
test('replacement failure leaves the original intact and removes the temporary file', async () => {
    const client = new FailingReplacementClient();
    const { dir, path } = await fixture();
    await writeFile(path, 'one\ntwo');
    const preview = await client.read({ path });
    await assert.rejects(() => client.edit({ path, edits: [{ op: 'replace', pos: secondAnchor(preview), lines: ['patched'] }] }), /simulated replacement failure/);
    assert.equal(await readFile(path, 'utf8'), 'one\ntwo');
    assert.deepEqual((await readdir(dir)).filter((entry) => entry.includes('.tmp')), []);
});
test('successful replacement leaves no temporary file', async () => {
    const client = new FilesystemPiClient();
    const { dir, path } = await fixture();
    await writeFile(path, 'one\ntwo');
    const preview = await client.read({ path });
    await client.edit({ path, edits: [{ op: 'replace', pos: secondAnchor(preview), lines: ['patched'] }] });
    assert.deepEqual((await readdir(dir)).filter((entry) => entry.includes('.tmp')), []);
});
test('detects a same-size content change even when timestamps are restored', async () => {
    const { dir, path } = await fixture();
    await writeFile(path, 'one\ntwo');
    const preview = await new FilesystemPiClient().read({ path });
    const before = await stat(path);
    const concurrentContent = 'red\nblu';
    assert.equal(Buffer.byteLength(concurrentContent), Buffer.byteLength('one\ntwo'));
    const client = new RevalidationRaceClient(async (destinationPath) => {
        await writeFile(destinationPath, concurrentContent);
        await utimes(destinationPath, before.atime, before.mtime);
    });
    const result = await client.edit({
        path,
        edits: [{ op: 'replace', pos: secondAnchor(preview), lines: ['patched'] }],
    });
    assert.equal(result, expectedConcurrentDestinationError(path));
    assert.equal(await readFile(path, 'utf8'), concurrentContent);
    await assertNoTemporaryFiles(dir);
});
test('detects a same-content destination replacement by inode', async () => {
    const { dir, path } = await fixture();
    const replacementPath = join(dir, 'replacement.txt');
    const originalContent = 'one\ntwo';
    await writeFile(path, originalContent);
    const before = await lstat(path);
    const preview = await new FilesystemPiClient().read({ path });
    const client = new RevalidationRaceClient(async (destinationPath) => {
        await writeFile(replacementPath, originalContent);
        await rename(replacementPath, destinationPath);
    });
    const result = await client.edit({
        path,
        edits: [{ op: 'replace', pos: secondAnchor(preview), lines: ['patched'] }],
    });
    assert.equal(result, expectedConcurrentDestinationError(path));
    assert.equal(await readFile(path, 'utf8'), originalContent);
    assert.notEqual((await lstat(path)).ino, before.ino);
    await assertNoTemporaryFiles(dir);
});
test('detects destination deletion and does not recreate it', async () => {
    const { dir, path } = await fixture();
    await writeFile(path, 'one\ntwo');
    const preview = await new FilesystemPiClient().read({ path });
    const client = new RevalidationRaceClient(async (destinationPath) => {
        await rm(destinationPath);
    });
    const result = await client.edit({
        path,
        edits: [{ op: 'replace', pos: secondAnchor(preview), lines: ['patched'] }],
    });
    assert.equal(result, expectedConcurrentDestinationError(path));
    await assert.rejects(() => readFile(path), { code: 'ENOENT' });
    await assertNoTemporaryFiles(dir);
});
test('detects a missing destination created before replacement', async () => {
    const { dir, path } = await fixture('nested/new.txt');
    const concurrentContent = 'created by another writer';
    const client = new RevalidationRaceClient(async (destinationPath) => {
        await writeFile(destinationPath, concurrentContent);
    });
    const result = await client.edit({ path, edits: [{ op: 'prepend', lines: ['ours'] }] });
    assert.equal(result, expectedConcurrentDestinationError(path));
    assert.equal(await readFile(path, 'utf8'), concurrentContent);
    await assertNoTemporaryFiles(join(dir, 'nested'));
});
test('filesystem client supports every edit operation and returns classified failures', async () => {
    const client = new FilesystemPiClient();
    const { path } = await fixture();
    await writeFile(path, 'one\ntwo\nthree');
    const page = await client.read({ path, offset: 2, limit: 1 });
    assert.match(page, /^2#/);
    let preview = await client.read({ path });
    await client.edit({ path, edits: [{ op: 'append', pos: preview.split('\n')[0], lines: ['after-one'] }] });
    preview = await client.read({ path });
    await client.edit({ path, edits: [{ op: 'prepend', pos: preview.split('\n')[3], lines: ['before-three'] }] });
    await client.edit({ path, edits: [{ op: 'replace_text', oldText: 'after-one', newText: 'replaced' }] });
    assert.equal(await readFile(path, 'utf8'), 'one\nreplaced\ntwo\nbefore-three\nthree');
    assert.match(await client.edit({ path, edits: [{ op: 'replace_text', oldText: 'missing', newText: 'x' }] }), /^\[E_NO_MATCH\]/);
    assert.match(await client.edit({ path, edits: [{ op: 'replace', pos: '1#ZZ:stale', lines: ['x'] }] }), /^\[E_STALE_ANCHOR\]/);
});
test('filesystem client rejects detected images without writing', async () => {
    const client = new FilesystemPiClient();
    const { path } = await fixture();
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    await writeFile(path, png);
    await assert.rejects(() => client.read({ path }), /E_BINARY_FILE.*image\/png/);
    assert.deepEqual(await readFile(path), png);
});
test('symbolic links are rejected when the platform permits creating one', async (t) => {
    const client = new FilesystemPiClient();
    const { dir, path: target } = await fixture('target.txt');
    const symbolicPath = join(dir, 'symbolic.txt');
    await writeFile(target, 'target');
    try {
        await symlink(target, symbolicPath, 'file');
    }
    catch (error) {
        const code = error.code;
        if (code === 'EPERM' || code === 'EACCES' || code === 'ENOSYS') {
            t.skip(`symbolic-link capability unavailable: ${code}`);
            return;
        }
        throw error;
    }
    assert.deepEqual(await loadFileKindAndText(symbolicPath), { kind: 'symlink' });
    await assert.rejects(() => client.read({ path: symbolicPath }), /E_UNSUPPORTED_FILE.*symbolic link/);
    assert.equal(await readFile(target, 'utf8'), 'target');
});
test('atomic editing breaks only the selected hard link', async (t) => {
    const client = new FilesystemPiClient();
    const { dir, path } = await fixture();
    const alias = join(dir, 'alias.txt');
    await writeFile(path, 'one\ntwo');
    try {
        await link(path, alias);
    }
    catch (error) {
        const code = error.code;
        if (code === 'EPERM' || code === 'EACCES' || code === 'ENOSYS' || code === 'EXDEV') {
            t.skip(`hard-link capability unavailable: ${code}`);
            return;
        }
        throw error;
    }
    const before = await lstat(path);
    assert.equal(before.nlink >= 2, true);
    const preview = await client.read({ path });
    await client.edit({ path, edits: [{ op: 'replace', pos: secondAnchor(preview), lines: ['patched'] }] });
    assert.equal(await readFile(path, 'utf8'), 'one\npatched');
    assert.equal(await readFile(alias, 'utf8'), 'one\ntwo');
    assert.notEqual((await lstat(path)).ino, (await lstat(alias)).ino);
    assert.equal(basename(path), 'file.txt');
});
