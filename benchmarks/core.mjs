import { performance } from 'node:perf_hooks';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FILESYSTEM_DURABILITY_LEVELS,
  FilesystemPiClient,
  computeLineHash,
} from '../dist/src/index.js';

function summarize(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    meanMilliseconds: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p95Milliseconds: sorted[Math.ceil(sorted.length * 0.95) - 1],
    p99Milliseconds: sorted[Math.ceil(sorted.length * 0.99) - 1],
  };
}

const hashSamples = [];
const hashRounds = 100;
const operationsPerHashRound = 10_000;

for (let round = 0; round < hashRounds; round += 1) {
  const start = performance.now();
  for (let index = 0; index < operationsPerHashRound; index += 1) {
    computeLineHash(index + 1, `const value${index} = ${index};`);
  }
  hashSamples.push((performance.now() - start) / operationsPerHashRound);
}

const directory = await mkdtemp(join(tmpdir(), 'pi-anchor-edit-core-benchmark-'));
const editRounds = 25;
const durability = {};

try {
  for (const level of Object.values(FILESYSTEM_DURABILITY_LEVELS)) {
    const path = join(directory, `${level}.txt`);
    await writeFile(path, 'value-a');
    const client = new FilesystemPiClient({
      durability: level,
      unsupportedDirectorySync: 'degrade',
    });
    let from = 'value-a';
    let to = 'value-b';
    const samples = [];

    for (let round = 0; round < editRounds + 3; round += 1) {
      const start = performance.now();
      await client.edit({
        path,
        edits: [{ op: 'replace_text', oldText: from, newText: to }],
      });
      const elapsed = performance.now() - start;
      [from, to] = [to, from];
      if (round >= 3) samples.push(elapsed);
    }

    durability[level] = summarize(samples);
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log(
  JSON.stringify(
    {
      runtime: { node: process.version, platform: process.platform, arch: process.arch },
      computeLineHash: {
        rounds: hashRounds,
        operationsPerRound: operationsPerHashRound,
        ...summarize(hashSamples),
      },
      filesystemAtomicEdit: {
        roundsPerLevel: editRounds,
        includes: 'load, classify, transform, temp write, selected syncs, revalidation, and rename',
        unsupportedDirectorySync: 'degrade',
        durability,
      },
    },
    null,
    2,
  ),
);
