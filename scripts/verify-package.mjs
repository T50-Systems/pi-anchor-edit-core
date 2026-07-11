import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const canonicalLicense = `MIT License

Copyright (c) 2026 T50 Systems

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const license = await readFile(new URL('../LICENSE', import.meta.url), 'utf8');
assert.equal(license.replaceAll('\r\n', '\n'), canonicalLicense, 'LICENSE must match the canonical MIT text and copyright line');

assert.equal(packageJson.license, 'MIT');
assert.deepEqual(packageJson.repository, {
  type: 'git',
  url: 'git+https://github.com/T50-Systems/pi-anchor-edit-core.git',
});
assert.equal(packageJson.homepage, 'https://github.com/T50-Systems/pi-anchor-edit-core#readme');
assert.deepEqual(packageJson.bugs, { url: 'https://github.com/T50-Systems/pi-anchor-edit-core/issues' });
assert.ok(Array.isArray(packageJson.keywords) && packageJson.keywords.length >= 3, 'package keywords are required');
assert.equal(packageJson.engines?.node, '>=22');

const releaseTag = process.env.RELEASE_TAG;
if (releaseTag !== undefined) {
  assert.equal(releaseTag, `v${packageJson.version}`, `tag ${releaseTag} must match package version v${packageJson.version}`);
}

const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'npm_execpath is required; run verification through npm run verify:package');
const packed = spawnSync(process.execPath, [npmCli, 'pack', '--dry-run', '--json'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
});
if (packed.status !== 0) {
  throw new Error(`npm pack --dry-run failed:\n${packed.stderr || packed.stdout}`);
}
const report = JSON.parse(packed.stdout);
const files = new Set(report[0]?.files?.map(({ path }) => path));
for (const required of ['LICENSE', 'README.md', 'package.json', 'dist/src/index.js', 'dist/src/index.d.ts']) {
  assert.ok(files.has(required), `package tarball is missing ${required}`);
}
for (const path of files) {
  assert.ok(!path.startsWith('test/') && !path.startsWith('dist/test/'), `package tarball must exclude tests: ${path}`);
  assert.ok(!/(^|\/)(?:\.env|auth\.json|credentials?)(?:\.|$)/i.test(path), `package tarball contains sensitive local file: ${path}`);
}

console.log(`Verified package metadata, canonical MIT license, and ${files.size} packed files.`);
