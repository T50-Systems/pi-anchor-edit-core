# Contributing

## Prerequisites

- Node.js 22 or newer
- npm

## Shortest path to a verified change

```bash
git clone https://github.com/T50-Systems/pi-anchor-edit-core.git
cd pi-anchor-edit-core
npm install
npm run check
npm test
```

`npm test` builds TypeScript first and executes the compiled `node:test` suite.

## Rules

- Add a focused regression test for every edit/error semantic change.
- Preserve CRLF/LF and binary-file handling.
- Never weaken stale-anchor, ambiguity, overlap, or display-prefix checks without an explicit compatibility decision.
- Keep filesystem I/O outside pure edit transformations.
- Update README, architecture docs, and changelog for public API changes.
- Run `npm audit --audit-level=high` for dependency changes.
