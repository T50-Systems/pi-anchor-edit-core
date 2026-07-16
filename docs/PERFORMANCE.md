# Performance Baseline

Build and run both the pure hash and end-to-end durability benchmarks:

```bash
npm run benchmark
```

The benchmark prints machine-readable JSON. The hash fixture runs `computeLineHash` over deterministic TypeScript-like lines. The filesystem fixture performs 25 measured edits per durability level after three warmups and includes loading, classification, transformation, same-directory temporary-file write, selected syncs, destination revalidation, and rename. `file-and-parent-directory` uses `unsupportedDirectorySync: 'degrade'` so the same command runs on Windows and filesystems without directory fsync.

## Local result

Measured 2026-07-16 on Windows x64 with Node 24.18.0. Values are milliseconds per operation and are a local comparison, not a cross-host SLO.

| Operation / durability | Mean | p95 | p99 |
|---|---:|---:|---:|
| `computeLineHash` (100 × 10,000 operations) | 0.001060 | 0.001160 | 0.001401 |
| Filesystem edit: `none` | 2.659 | 3.466 | 3.596 |
| Filesystem edit: `file` (default) | 5.236 | 6.284 | 6.640 |
| Filesystem edit: `file-and-parent-directory` | 5.954 | 7.000 | 7.517 |

On this Windows host, file sync added about 2.58 ms mean latency over `none`. Parent-handle open plus the identity checks and unsupported sync attempt added about 0.72 ms over `file`; Windows returned the classified unsupported `EPERM`, so the configured degrade policy completed at file durability. This does **not** measure the cost of a successful directory fsync. Linux/macOS and different filesystems/storage can differ substantially.

The pure hash result remains comfortably below the 0.1 ms target in [`PRODUCT.md`](PRODUCT.md). No end-to-end edit budget is enforced yet. When publishing updated results, record Node version, OS/filesystem, rounds, selected unsupported-directory policy, whether parent sync succeeded or degraded, and the complete JSON output.
