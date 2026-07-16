# Changelog

## [Unreleased]

### Added

- product, architecture, contributor, examples, performance, operations, branch-protection, security, and release documentation;
- focused coverage for anchor parsing, classified failures, file kinds, atomic filesystem edits, and cross-platform link/newline behavior;
- reproducible hash benchmark and enforced coverage thresholds;
- Linux, Windows, macOS, Node 22, and Node 24 CI coverage;
- package provenance/license verification and immutable GitHub release artifact creation;
- weekly Dependabot and CodeQL scanning workflows.
- deterministic filesystem race fixtures for changed content, permission mode, replacement identity, deletion, and missing-to-created destinations.
- exported filesystem durability levels, defaults, configuration, and post-rename `FilesystemDurabilityError` recovery metadata;
- deterministic ordering/failure seams and cross-platform tests for file sync, parent-directory capability, strict/degraded behavior, visibility, and cleanup.
- repository ADR defining crash-durability scope and failure semantics.

### Changed

- filesystem edits now classify paths before decoding and use same-directory atomic replacement with mode, BOM, newline, and cleanup guarantees;
- package contents exclude compiled tests and include complete repository provenance metadata.
- filesystem atomic replacement now performs best-effort optimistic destination revalidation with identity, permission-mode, and SHA-256 byte-digest evidence, returning `[E_CONCURRENT_DESTINATION]` while preserving detected concurrent state and cleaning temporary files.
- callers can select `none`, `file`, or `file-and-parent-directory` durability through `FilesystemPiClient`; the default remains file sync.
- preserved destination mode is now applied before the final temporary-file sync, and parent-directory capability is detected from the actual filesystem operation using a pre-rename pinned handle.

### Security

- unsafe binary, image, special-file, symlink, null-byte, and lossy UTF-8 rewrites are rejected before writing;
- security reporting, sensitive-diagnostic handling, dependency review, and recovery responsibilities are documented.
- same-size, coarse-timestamp, and permission-only destination changes are no longer silently overwritten when detected before replacement; documentation explicitly records the residual check-to-rename race and makes no compare-and-swap guarantee.
- post-rename sync failures now explicitly report that the destination is visible but crash durability is unconfirmed, preventing unsafe blind retry/rollback assumptions;
- documentation distinguishes atomic visibility, file durability, parent-directory durability, and the unsupported scope of recursively created ancestors.

## 0.1.0

### Added

- initial shared anchor-editing core with ESM output, TypeScript declarations, filesystem adapter, hashline operations, and stale-anchor helpers.
