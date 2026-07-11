import { performance } from 'node:perf_hooks';
import { computeLineHash } from '../dist/src/index.js';

const samples = [];
const rounds = 100;
const operationsPerRound = 10_000;

for (let round = 0; round < rounds; round += 1) {
  const start = performance.now();
  for (let index = 0; index < operationsPerRound; index += 1) {
    computeLineHash(index + 1, `const value${index} = ${index};`);
  }
  samples.push((performance.now() - start) / operationsPerRound);
}

samples.sort((a, b) => a - b);
const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
const p99 = samples[Math.ceil(samples.length * 0.99) - 1];

console.log(
  JSON.stringify(
    {
      operation: 'computeLineHash',
      rounds,
      operationsPerRound,
      meanMilliseconds: mean,
      p99Milliseconds: p99,
    },
    null,
    2,
  ),
);
