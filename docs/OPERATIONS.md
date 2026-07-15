# Operations and recovery

## Before editing

Authorize the caller-selected path, keep a recoverable copy when content is important, read immediately before editing, and use only anchors from that read. Do not place secrets or private file content in bug reports. Use synthetic fixtures when reproducing failures.

The filesystem adapter performs same-directory temporary-file replacement. It records destination existence, file identity, byte length, and a SHA-256 byte digest when loading, then revalidates immediately before replacement. A detected content change, destination replacement, deletion, or missing-to-created race preserves the concurrent state and removes the adapter's temporary file. Symbolic links are rejected. Editing one name in a hard-link set replaces only that directory entry, so sibling hard links retain the old inode and content.

## Classified errors

| Error prefix | Meaning | Safe caller action |
|---|---|---|
| `[E_STALE_ANCHOR]` | Observed content changed. The diagnostic may contain nearby source lines. | Keep the diagnostic private, re-read the file, copy the current `>>>` anchors verbatim, reassess intent, and retry once with current anchors. |
| `[E_BAD_REF]` | An anchor is malformed, out of format, or has an invalid hash. | Re-read and copy the complete `LINE#HASH:content` value. Never construct or repair an anchor manually. |
| `[E_RANGE_OOB]` | An anchor points outside the current file. | Re-read, verify that the intended range still exists, and create a new request. |
| `[E_BAD_OP]` | The operation or its required fields are invalid. | Correct the request shape; do not retry unchanged. |
| `[E_EDIT_CONFLICT]` | Edits in one request overlap or otherwise conflict. | Merge the intent into one non-overlapping edit or split it into sequential read/edit cycles. |
| `[E_NO_MATCH]` | `replace_text` found no exact match. | Re-read and use a narrower current exact value or anchored edit. |
| `[E_MULTI_MATCH]` | `replace_text` is ambiguous or overlaps. | Use anchored edits or provide an exact value that occurs once. |
| `[E_WOULD_EMPTY]` | An edit would empty a non-empty file. | Stop and require an explicit, separately reviewed whole-file deletion/write path if emptying is intended. |
| `[E_INVALID_PATCH]` | Payload content includes rendered anchors/diff markers or otherwise violates literal-content rules. | Remove display prefixes and submit only literal replacement lines. |
| `[E_BINARY_FILE]` | The classifier detected an image, binary MIME type, or null bytes. | Do not edit with this library. Select a format-aware binary tool and preserve the original. |
| `[E_DECODE_LOSS]` | UTF-8 decoding would replace invalid bytes. | Do not rewrite. Determine the real encoding and use an encoding-aware conversion with an explicit backup. |
| `[E_UNSUPPORTED_FILE]` | The path is a directory, symbolic link, or unsupported special file. | Resolve and authorize a regular-file path explicitly; do not weaken the classifier or follow the link implicitly. |
| `[E_CONCURRENT_DESTINATION]` | The destination's existence, identity, length, or byte digest changed after it was loaded and before replacement. | Preserve the concurrent destination, re-read it, reassess intent, and retry only with current anchors. |

`Operation aborted` means the supplied abort signal was already cancelled; leave content unchanged, determine whether the caller still wants the operation, then re-read before retrying.

## Filesystem failures

Node filesystem errors such as `EACCES`, `EPERM`, `EROFS`, `ENOSPC`, `EMFILE`, and unexpected `ENOENT` are propagated. Do not elevate privileges automatically. Confirm directory authorization and available space, preserve the original, inspect the same directory for a `.filename.<pid>.<uuid>.tmp` residue after an unhandled process termination, and remove a residue only after confirming no live process owns it. A missing path is treated as empty for an intentional prepend/append creation; callers must distinguish intentional creation from a misspelled path.

The optimistic guard deliberately compares a byte digest rather than trusting size and timestamps, so same-size edits and coarse-time metadata collisions are detected. It is still a best-effort check, not an atomic compare-and-swap: another writer can change the destination after revalidation and before `rename`. Callers must not treat a successful edit as proof that no writer raced in that residual interval.

## Escalation data

A safe report contains:

- package version, Node version, operating system, and filesystem type;
- the error prefix or Node error code;
- whether the destination existed and whether link capability was involved; and
- a minimal synthetic fixture with no proprietary text.

Never attach real credentials, tokens, private paths, customer data, complete file content, or unredacted stale-anchor output. Report suspected security impact only through the private route in [`SECURITY.md`](../SECURITY.md).
