# Performance Baseline

Build and run the hash benchmark:

```bash
npm run benchmark
```

The fixture runs `computeLineHash` over deterministic TypeScript-like lines and reports mean and p99 milliseconds per operation. It excludes filesystem I/O and higher-level Pi tool serialization.

## Initial local result

Measured 2026-07-11 on Windows with Node 24.18.0:

- rounds: 100
- operations per round: 10,000
- mean: 0.001019 ms per line
- p99: 0.001282 ms per line

The result is comfortably below the 0.1 ms target. This is a local pure-hash baseline, not an end-to-end filesystem edit SLO.

The initial target in [`PRODUCT.md`](PRODUCT.md) is p99 below 0.1 ms per line. Record Node, OS, rounds, and operations per round when publishing updated results.
