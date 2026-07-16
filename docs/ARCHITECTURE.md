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
6. The filesystem adapter classifies the path before decoding, captures destination existence, file identity, byte length, permission mode, and a SHA-256 digest, and preserves newline/BOM/mode behavior.
7. The adapter writes a same-directory temporary file, applies preserved mode, and performs the configured file sync unless `none` was selected.
8. Immediately before atomic replacement, it re-observes the destination and aborts with `[E_CONCURRENT_DESTINATION]` if existence, identity, length, permission mode, or digest differs; otherwise it renames the temporary file.
9. `file-and-parent-directory` synchronizes the destination's direct parent after rename, degrading only classified unsupported capability under the configured policy.

## Invariants

- Anchors are opaque observations, never guessed line numbers.
- Stale/ambiguous/no-op edits fail rather than silently changing intent.
- Edit payloads contain literal file content, not rendered `LINE#HASH:` prefixes.
- Pure transformation code remains independent from filesystem access.
- Public exports flow through `src/index.ts` and compiled `dist` declarations.
- Symbolic links are rejected rather than followed. Atomic replacement of a hard-linked path changes only that path; sibling links retain the prior inode and content.
- Binary, image, special-file, null-byte, and decode-loss inputs are rejected before any write.
- Temporary files are created beside the destination so replacement stays on the same filesystem, and are removed after success or handled failure.
- Revalidation uses permission-mode and byte-digest evidence rather than size or timestamps alone, so permission-only changes, same-size content changes, and changes hidden by coarse timestamp resolution are detected.
- The concurrency guard is optimistic and best-effort, not compare-and-swap: a destination can still change in the residual interval after revalidation and before `rename`. The library makes no false CAS guarantee.
- Atomic visibility and crash durability are separate: `none` performs no explicit sync, `file` syncs the temporary file and remains the default, and `file-and-parent-directory` additionally syncs the direct parent after rename.
- Preserved mode is applied before the selected final file sync. Parent synchronization never precedes rename.
- A parent-sync error is post-commit: the destination is visible and is not rolled back. `FilesystemDurabilityError.destinationVisible` records this recovery boundary.
- Parent sync covers only the direct parent. Recursively created ancestors are not included in the durability claim.

## Architecture decisions

- [`ADR 0001: Filesystem crash-durability levels`](adr/0001-filesystem-crash-durability.md) defines the exported levels/default, ordering, unsupported capability behavior, post-rename failures, and created-directory scope.
