# pi-anchor-edit-core

Shared anchor-based editing primitives for Pi packages that need reliable line-addressed file edits.

`pi-anchor-edit-core` is the reusable TypeScript library behind higher-level T50 Pi editing packages such as [`pi-hashline-edit-plus`](https://github.com/T50-Systems/pi-hashline-edit-plus) and [`pi-smart-edit`](https://github.com/T50-Systems/pi-smart-edit). It packages the common hashline, file-kind, text-normalization, runtime, and local-filesystem client behavior so those packages do not each carry their own edit engine.

## What it provides

- Anchor parsing and formatting for `LINE#HASH:content` read output.
- Hashline edit resolution for `replace`, `append`, `prepend`, and exact `replace_text` operations.
- Stale-anchor error parsing helpers for retry loops.
- File-kind and text-loading helpers for text/binary/empty-file handling.
- Text normalization utilities used by cross-platform edit tools.
- A small local filesystem Pi-style client for test harnesses and retry-oriented tooling.
- TypeScript declarations and ESM output under `dist/`.

## Package shape

```text
src/
  anchors.ts            anchor parsing and stale-anchor helpers
  file-kind.ts          text/binary/empty-file detection
  filesystem-client.ts  local Pi-shaped read/edit client
  hashline.ts           core hashline edit application
  runtime.ts            runtime utilities
  text.ts               text normalization helpers
  types.ts              shared edit/read types
test/                   node:test coverage for core behavior
dist/                   published build output
```

## Install

Use from GitHub or as a dependency of another T50 Pi package:

```bash
npm install git+https://github.com/T50-Systems/pi-anchor-edit-core.git
```

For local development:

```bash
git clone https://github.com/T50-Systems/pi-anchor-edit-core
cd pi-anchor-edit-core
npm install
```

## Basic usage

```ts
import {
  applyHashlineEdits,
  createFilesystemClient,
  parseAnchorLine,
} from "pi-anchor-edit-core";

const anchor = parseAnchorLine("12#AB:const value = 1;");

const client = createFilesystemClient({ cwd: process.cwd() });
const readResult = await client.read({ path: "src/file.ts" });
```

Higher-level packages normally call these primitives rather than exposing this library directly to Pi users.

## Development

```bash
npm install
npm run build
npm run check
npm test
```

`npm test` builds first through `pretest` and then runs the compiled `node:test` suite in `dist/test`.

## Release notes

- Package type: ESM.
- Public entrypoint: `dist/src/index.js` with matching TypeScript declarations.
- Published files: `dist`, `README.md`, and `LICENSE`.

## License

MIT
