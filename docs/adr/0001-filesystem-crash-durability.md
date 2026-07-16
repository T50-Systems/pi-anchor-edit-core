# ADR 0001: Filesystem crash-durability levels

## Status

Accepted

## Date

2026-07-16

## Context

`FilesystemPiClient` already writes through a same-directory temporary file, calls `fsync` on that file, and atomically renames it over the destination. This provides atomic visibility and a useful file-data durability step, but it does not make the rename durable because the parent directory is not synchronized. Directory synchronization support also varies by operating system and filesystem: for example, the Node.js `fsync` operation on an opened directory reports `EPERM` on Windows.

Atomic visibility and crash durability are separate guarantees. The public API needs to let callers trade durability for latency without silently changing the behavior existing callers receive.

## Decision

### Public levels and defaults

The package exports three `FilesystemDurability` levels through `FILESYSTEM_DURABILITY_LEVELS`:

- `none`: write and atomically rename without an explicit sync;
- `file`: sync the temporary file before rename;
- `file-and-parent-directory`: sync the temporary file before rename, then sync the destination's direct parent directory after rename.

`DEFAULT_FILESYSTEM_DURABILITY` is `file`, preserving the behavior existing `new FilesystemPiClient()` callers receive today.

`FilesystemPiClientConfig` selects the durability level. It also selects `unsupportedDirectorySync` as either `degrade` or `strict`; the default is `degrade`.

### Ordering

The write sequence is:

1. create and write the same-directory temporary file;
2. apply the preserved destination mode to the temporary file, when one exists;
3. perform the selected final temporary-file sync (`file` and `file-and-parent-directory` only);
4. close the temporary-file handle;
5. revalidate the destination and atomically rename;
6. for `file-and-parent-directory`, sync the destination's direct parent directory.

Applying mode before the final file sync includes the mode metadata in the best available file durability boundary.

### Unsupported parent-directory synchronization

Capability is detected from the actual open/sync operation on the destination's parent rather than from an operating-system allowlist. Known unsupported-operation error codes are classified explicitly. Windows `EPERM` from directory sync is also classified as unsupported; permission errors not identified as an unsupported capability remain real failures.

- `degrade`: a classified unsupported directory-sync result completes successfully at file durability. The caller chose best-effort parent-directory durability and must not interpret success as confirmation that the rename survived a crash on that filesystem.
- `strict`: the same classified result throws an explicit durability error.
- Any unclassified directory open/sync failure throws regardless of policy.

No parent-directory capability result is cached globally because different paths can reside on filesystems with different behavior.

### Post-rename failures

Parent-directory sync occurs after rename, so any failure from that step happens after the destination has been committed and is visible. The operation throws a `FilesystemDurabilityError` with `destinationVisible: true`; it does not roll back, delete, or restore the visible destination. Retrying the original edit blindly is unsafe. Callers must inspect/re-read the destination and decide whether another durability attempt or edit is appropriate.

In `degrade` mode, only a classified unsupported-capability result is absorbed. Other post-rename failures still throw `FilesystemDurabilityError` and carry the original error as `cause`.

### Created-directory scope

`file-and-parent-directory` synchronizes exactly the destination's direct parent once. If recursive directory creation was needed, the level does not claim to synchronize every newly created ancestor or the ancestor entries that make the new path reachable. Callers requiring crash-durable directory-tree creation must provision and synchronize that hierarchy separately before editing.

### Test seams

Protected filesystem-operation seams remain available for deterministic ordering and failure injection. They are testability hooks, not additional public durability guarantees.

## Consequences

### Positive

- Existing callers retain file-sync behavior.
- Callers can choose lower latency or stronger rename durability explicitly.
- Unsupported filesystems and Windows have deterministic degrade/strict behavior.
- Post-commit errors cannot be mistaken for pre-commit failures.
- Mode preservation is ordered before the final file sync.

### Negative

- `file-and-parent-directory` adds a directory open and sync after every successful rename.
- `degrade` success cannot prove parent-directory durability; strict mode is required when lack of that capability must be surfaced.
- Newly created directory hierarchies remain outside the guarantee.
- Filesystem and storage hardware may still weaken or ignore sync semantics beyond what Node.js can observe.

## Alternatives considered

1. **Always synchronize the parent directory.** Rejected because it changes current latency and introduces unsupported-platform failures for all callers.
2. **Make no-sync the default.** Rejected because it weakens current behavior.
3. **Reject parent-directory mode on Windows by platform name.** Rejected because support is an operation/filesystem capability and platform allowlists become inaccurate.
4. **Synchronize all recursively created ancestors.** Rejected because it expands a file-edit operation into directory-tree provisioning and makes the level's cost and scope less predictable.
5. **Roll back after a parent sync failure.** Rejected because rename has already committed; a rollback would be a second mutation with its own failure and concurrency risks.

## Reversal signals

Revisit this decision if Node.js provides a portable directory-sync capability API, if callers require crash-durable recursive path creation, or if measurements show the configuration surface cannot express required durability guarantees clearly.
