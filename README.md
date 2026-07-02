# pi-anchor-edit-core

Shared anchor-based edit core for Pi packages.

This package extracts the reusable editing engine used by higher-level packages such as:

- `pi-hashline-edit-plus`
- `pi-smart-edit`

## Scope

- anchor parsing and formatting
- stale-anchor error parsing
- hashline edit engine
- text normalization helpers
- file kind/text loading
- simple local filesystem Pi client for retry-oriented tooling

## Development

```bash
npm install
npm run check
npm test
```
