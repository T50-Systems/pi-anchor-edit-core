# pi-anchor-edit-core

Shared anchor-based editing primitives for Pi packages that need reliable line-addressed file edits.

`pi-anchor-edit-core` is the reusable TypeScript library behind [`pi-hashline-edit-plus`](https://github.com/T50-Systems/pi-hashline-edit-plus) and [`pi-smart-edit`](https://github.com/T50-Systems/pi-smart-edit). It centralizes hashline, file-kind, text-normalization, runtime, and filesystem-client behavior so packages do not carry divergent edit engines.

## Product vision

Provide one dependable cross-platform edit core where every edit applies to the exact observed content or fails with actionable retry information. See [`docs/PRODUCT.md`](docs/PRODUCT.md).

## What it provides

- Anchor parsing and formatting for `LINE#HASH:content` read output.
- Hashline edit resolution for `replace`, `append`, `prepend`, and exact `replace_text` operations.
- Stale-anchor error parsing helpers for retry loops.
- File-kind and text-loading helpers for text/binary/empty-file handling.
- Text and newline normalization used by cross-platform edit tools.
- A local filesystem Pi-style client for tests and retry-oriented tooling.
- TypeScript declarations and ESM output under `dist/`.

## Quickstart

### 1. Install

```bash
npm install git+https://github.com/T50-Systems/pi-anchor-edit-core.git
```

### 2. Import the public API

```ts
import {
  FilesystemPiClient,
  applyHashlineEdits,
  parseStaleAnchorError,
  resolveEditAnchors,
} from 'pi-anchor-edit-core';
```

### 3. Read before editing

```ts
const client = new FilesystemPiClient();
const rendered = await client.read({ path: 'src/file.ts' });
```

Copy anchors verbatim from `rendered`; they are opaque observations.

### 4. Apply a verified edit

```ts
const result = applyHashlineEdits(
  'alpha\nbeta',
  resolveEditAnchors([
    { op: 'replace', pos: '2#<copied-hash>:beta', lines: ['patched'] },
  ]),
);
```

## Package shape

```text
src/         core TypeScript modules
test/        node:test regression suite
benchmarks/  reproducible local benchmark
docs/        product, architecture, examples, and performance guidance
dist/        compiled ESM and declarations
```

## Troubleshooting

### `[E_STALE_ANCHOR]`

The file changed after the anchor was observed. Parse the error with `parseStaleAnchorError` and retry using the exact `>>> LINE#HASH:content` suggestions. Do not resend the stale request.

### `[E_INVALID_PATCH]`

Edit `lines` must contain literal file content. Remove copied `LINE#HASH:` prefixes, diff markers, or duplicated boundary lines.

### Exact replacement is ambiguous

`replace_text` requires one unique occurrence. Narrow `oldText` or use anchored line edits.

### Newlines changed unexpectedly

Use the filesystem adapter, which detects and preserves newline style. Include a CRLF regression test for adapter changes.

The adapter refuses directories, symbolic links, special files, images, null-byte/binary data, and invalid UTF-8 that would decode with replacement characters. Successful edits use a same-directory temporary file and atomic replacement, preserve UTF-8 BOMs and existing permission bits, and clean up temporary files after success or handled failure. Atomic replacement intentionally breaks the edited path out of a hard-link set; other hard links continue to reference the unchanged original inode.

## Development

```bash
git clone https://github.com/T50-Systems/pi-anchor-edit-core
cd pi-anchor-edit-core
npm install
npm run build
npm run check
npm test
npm run test:coverage
npm run benchmark
```

### Supported matrix

CI runs Node.js 22 on Ubuntu, Windows, and macOS, plus the Node.js 24 compatibility job on Ubuntu. Capability-sensitive symlink and permission assertions report a specific diagnostic when the host cannot provide that feature; unrelated filesystem and CRLF assertions continue to run. The thresholded coverage command enforces at least 85% line coverage and 75% branch coverage.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — components, control flow, and invariants.
- [`docs/EXAMPLES.md`](docs/EXAMPLES.md) — parsing, editing, recovery, and adapter examples.
- [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md) — reproducible hash baseline.
- [`docs/PRODUCT.md`](docs/PRODUCT.md) — vision and success metrics.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contributor workflow.
- [`CHANGELOG.md`](CHANGELOG.md) — release history.

## Release workflow

Update `package.json` and `CHANGELOG.md`, merge validated changes, and create a matching `vX.Y.Z` tag. The release workflow verifies build/check/tests, dependency audit, and tag/version consistency.

## License

MIT
