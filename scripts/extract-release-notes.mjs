import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const changelog = (await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
const version = packageJson.version;
const lines = changelog.split('\n');
const headingIndex = lines.findIndex((line) => line === `## ${version}` || line === `## [${version}]`);
assert.notEqual(headingIndex, -1, `CHANGELOG.md must contain a level-two section for ${version}`);
const nextHeadingOffset = lines.slice(headingIndex + 1).findIndex((line) => line.startsWith('## '));
const end = nextHeadingOffset === -1 ? lines.length : headingIndex + 1 + nextHeadingOffset;
const notes = lines.slice(headingIndex + 1, end).join('\n').trim();
assert.ok(notes.length > 0, `CHANGELOG.md section ${version} must contain release notes`);
process.stdout.write(`${notes}\n`);
