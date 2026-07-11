# Examples

## Parse anchored read output

```ts
import { parseReadAnchors } from 'pi-anchor-edit-core';

const anchors = parseReadAnchors('1#AB:alpha\n2#CD:beta');
```

## Replace one observed line

```ts
import { applyHashlineEdits, resolveEditAnchors } from 'pi-anchor-edit-core';

const result = applyHashlineEdits(
  'alpha\nbeta',
  resolveEditAnchors([
    { op: 'replace', pos: '2#<copied-hash>:beta', lines: ['patched'] },
  ]),
);
```

Always copy the complete anchor returned by a current read. Never construct or adjust it manually.

## Recover from a stale anchor

Catch the error, parse it with `parseStaleAnchorError`, and retry using the exact `>>> LINE#HASH:content` suggestions. Do not rerun the same stale request.

## Use the filesystem adapter

```ts
import { FilesystemPiClient } from 'pi-anchor-edit-core';

const client = new FilesystemPiClient();
const rendered = await client.read({ path: 'src/file.ts' });
```

The adapter rejects unsupported binary edits and preserves detected newline style.
