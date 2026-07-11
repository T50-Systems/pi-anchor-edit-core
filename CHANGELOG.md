# Changelog

## [Unreleased]

### Added

- product, architecture, contributor, examples, performance, operations, branch-protection, security, and release documentation;
- focused coverage for anchor parsing, classified failures, file kinds, atomic filesystem edits, and cross-platform link/newline behavior;
- reproducible hash benchmark and enforced coverage thresholds;
- Linux, Windows, macOS, Node 22, and Node 24 CI coverage;
- package provenance/license verification and immutable GitHub release artifact creation;
- weekly Dependabot and CodeQL scanning workflows.

### Changed

- filesystem edits now classify paths before decoding and use same-directory atomic replacement with mode, BOM, newline, and cleanup guarantees;
- package contents exclude compiled tests and include complete repository provenance metadata.

### Security

- unsafe binary, image, special-file, symlink, null-byte, and lossy UTF-8 rewrites are rejected before writing;
- security reporting, sensitive-diagnostic handling, dependency review, and recovery responsibilities are documented.

## 0.1.0

### Added

- initial shared anchor-editing core with ESM output, TypeScript declarations, filesystem adapter, hashline operations, and stale-anchor helpers.
