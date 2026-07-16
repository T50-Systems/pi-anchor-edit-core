# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | Yes |
| Earlier or unreleased snapshots | No |

Security fixes are released as new immutable patch versions. Support may move to the newest minor release after an announcement in the changelog and GitHub release notes.

## Private reporting

Use [GitHub private vulnerability reporting](https://github.com/T50-Systems/pi-anchor-edit-core/security/advisories/new). Do not open a public issue for a suspected vulnerability. If GitHub does not present a private report form, contact a T50 Systems maintainer privately through the organization’s established contact channel and include only enough metadata to arrange a secure transfer; do not fall back to a public issue.

Never include credentials, access tokens, secrets, customer data, private source files, complete edited file contents, or stale-anchor diagnostic excerpts in a public issue, discussion, pull request, benchmark, or log. A safe initial report states the affected version, operating system, Node version, error prefix, and a minimal synthetic reproduction. Maintainers will request sensitive evidence through the private advisory.

We aim to acknowledge a private report within 3 business days, provide an initial severity/triage decision within 7 business days, and send status updates at least every 14 days until remediation or closure. Coordinated disclosure timing is agreed with the reporter after a fix and supported release are ready.

## Trust boundary

`pi-anchor-edit-core` reads and mutates caller-selected local paths. The caller is responsible for authorization, path selection, backups, and preventing untrusted users from choosing sensitive targets. The filesystem adapter rejects symbolic links, special files, directories, images, binary/null-byte content, and invalid UTF-8 rewrites; it does not create a sandbox or establish that a path is safe to edit.

Anchor diagnostics can quote nearby file content in `>>> LINE#HASH:content` retry lines. Treat all diagnostics as potentially sensitive. Redact or replace them with synthetic examples before sharing, and never send raw diagnostics to telemetry by default.

Filesystem sync is a durability control, not an authorization or confidentiality boundary. `none` intentionally omits explicit syncs; the default `file` level does not make the directory rename crash-durable; and `file-and-parent-directory` depends on operating-system, filesystem, mount, virtualization, and hardware behavior. A degraded unsupported directory sync confirms only file durability. Strict post-rename failures leave the new destination visible and must not trigger blind replay or rollback.

See [`docs/OPERATIONS.md`](docs/OPERATIONS.md) for safe recovery actions and [`docs/RELEASING.md`](docs/RELEASING.md) for immutable release recovery.

## Dependency and scanning maintenance

Dependabot checks npm and GitHub Actions dependencies weekly. CodeQL scans pushes, pull requests, and a weekly schedule. The maintainer responsible for the next release reviews high-severity `npm audit`, Dependabot, and code-scanning findings at least weekly and before every release. Security-related dependency updates use the normal reviewed pull-request and required-check path; emergency fixes do not bypass validation.
