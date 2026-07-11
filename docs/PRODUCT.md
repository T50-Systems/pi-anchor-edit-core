# Product Vision and Success Metrics

## Vision

Provide one dependable, cross-platform anchor-editing core for Pi extensions so higher-level tools share the same safety semantics.

## Product promise

Every edit either applies to the exact observed content or fails with actionable retry information; it never silently edits stale or ambiguous text.

## Success metrics

| ID | Outcome | Target | Evidence |
|---|---|---|---|
| SAFE-1 | Stale anchors mutate files | 0 | stale-anchor tests |
| SAFE-2 | Ambiguous exact replacements apply | 0 | uniqueness tests |
| REL-1 | CRLF/LF behavior preserved | 100% fixture pass | filesystem tests |
| PERF-1 | Hash computation overhead | p99 < 0.1 ms per line | `npm run benchmark` |
| UX-1 | Recoverable failures include retry context | 100% classified cases | error-contract tests |

No file content or edit payload is sent to an external service by this library.
