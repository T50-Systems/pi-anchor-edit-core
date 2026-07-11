# Architecture

## Modules

- `anchors.ts` parses/formats `LINE#HASH:content` references and stale-anchor suggestions.
- `hashline.ts` computes hashes, validates anchors, rejects rendered prefixes, resolves operations, and applies edits.
- `file-kind.ts` distinguishes text, binary, empty, and decodable files.
- `text.ts` owns newline/encoding normalization.
- `filesystem-client.ts` adapts the pure engine to local filesystem reads and edits.
- `runtime.ts` owns cancellation/runtime helpers.
- `types.ts` defines public client and operation contracts.
- `index.ts` is the only package export surface.

## Control flow

1. A client reads a text file and renders hashline anchors.
2. A caller submits literal edit content and copied opaque anchors.
3. The core parses references and verifies current line hashes/text hints.
4. Operations are validated for overlap, uniqueness, and invalid rendered prefixes.
5. The engine produces new content or throws a classified actionable error.
6. The filesystem adapter preserves newline behavior and writes the result.

## Invariants

- Anchors are opaque observations, never guessed line numbers.
- Stale/ambiguous/no-op edits fail rather than silently changing intent.
- Edit payloads contain literal file content, not rendered `LINE#HASH:` prefixes.
- Pure transformation code remains independent from filesystem access.
- Public exports flow through `src/index.ts` and compiled `dist` declarations.
