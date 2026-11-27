# Convert Local File: Plan

How the journey is built, slice by slice. What it must do is in its [acceptance criteria](acceptance-criteria.md);
decisions (D#) and questions (U#) are in [`REQUIREMENTS.md`](../../../REQUIREMENTS.md).

## Sources

The designs, flows, tickets and documents behind this journey, from its design session (2026-11-26).

- [REQUIREMENTS.md](../../../REQUIREMENTS.md): system decisions D1–D24, invariants I1–I5.
- [src/tools.ts](../../../src/tools.ts), [src/server.ts](../../../src/server.ts), [src/Markdownify.ts](../../../src/Markdownify.ts), [src/utils.ts](../../../src/utils.ts): existing 6 local file tools, `expandHome`, `getAllowedPaths`, `assertPathAllowed`, and `_markitdown`.
- [src/sample-data/](../../../src/sample-data/): real PDF, DOCX, XLSX, PPTX, and JPEG fixtures for live verification.

## Shape

An **MCP Client** calls one of the 6 local file conversion tools (`pdf-to-markdown`, `image-to-markdown`,
`audio-to-markdown`, `docx-to-markdown`, `xlsx-to-markdown`, `pptx-to-markdown`) with `{ filepath }`. The server
validates the request and requires an absolute or `~`-prefixed path, checks the file-access policy (failing closed
when disabled in HTTP mode) and `Allowed Paths` containment via `realpath` **before** touching file existence, verifies
the target exists and is a readable regular file, invokes `markitdown` via `execFile` within `MD_MARKITDOWN_TIMEOUT_MS`
(preserving HTML-prefixed text, normalizing whitespace-only output to `""`, and adding a `markitdown[all]` vs Docker
`pdf` hint on `MissingDependencyException`), and returns a derived **Markdown Result** (`text` only) or a structured
MCP tool error (`isError: true`).

## Contexts, verbs and queries

Where this journey lives in the code. Each noun is a type in the context's `nouns.ts`. Each verb is a function in its
`verbs.ts`, and each derived noun a function in its `queries.ts`.

| Context                      | Nouns                                                                                                            | Verbs                                                                                                                                                               | Queries          | Harness commands                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------- |
| `src/local-file-conversion/` | `LocalFileTool`, `LocalFilePath`, `LocalFileConversionRequest`, `FileAccessPolicy`, `FileStat`, `MarkdownResult` | `validateLocalFileRequest`, `resolveFileAccessPolicy`, `checkFileAccess`, `verifyReadableFile`, `parseLocalFileLimits`, `formatMarkitdownError`, `convertLocalFile` | `markdownResult` | `convert <local-file-tool> [filepath]` |

## External systems

Every system outside ours is mocked in `src/integrations/<system>/` (with live counterparts in `live.ts`); world
commands make it do what the journey needs.

| System       | What we need from it                                                                                | World commands                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `filesystem` | Expand `~`, resolve `realpath` (or nearest ancestor), stat & readability checks on local files      | `filesystem put <path>`, `filesystem mkdir <path>`, `filesystem symlink <link> <target>`, `filesystem unreadable <path>`, `filesystem temp-count`, `filesystem staged-count` |
| `markitdown` | Convert a Local File path to Markdown text (or fail / missing / missing-dep / timeout)              | `markitdown stub <text...>`, `markitdown empty`, `markitdown fail <reason>`, `markitdown missing`, `markitdown slow <duration>`, `markitdown last-input`                     |
| `clock`      | Deterministic time for `markitdown` timeout checks                                                  | `clock`, `clock advance <duration>`, `clock set <time>`                                                                                                                      |
| `config`     | `MD_ALLOWED_PATHS`, `MD_MARKITDOWN_TIMEOUT_MS`, `MCP_TRANSPORT`, and `MCP_ALLOW_UNRESTRICTED_PATHS` | `config set <VAR> <value>`, `config clear <VAR>`                                                                                                                             |

## Slices

Each slice is one capability, wired through every part of the system (harness commands, verbs, ports, mocks) with a
scenario that runs it. Each has a [spec](specs/) and a scenario in `scenarios/convert-local-file/`.

### Done

1. **01-basic-local-file.** Tracer bullet: validate request & absolute/`~` path, verify file exists/is regular/is readable, convert via `markitdown`, normalize empty output, allow HTML-prefixed text, add `MissingDependencyException` hint, and return path-less `Markdown Result` across all 6 local file tools. Covers LF-1, LF-2, LF-5, LF-6, LF-7, LF-8, LF-9, LF-11.
   ([spec](specs/01-basic-local-file/spec.md), `scenarios/convert-local-file/01-basic-local-file.txt`)
2. **02-allowed-paths-and-symlinks.** Enforce `Allowed Paths` (`MD_ALLOWED_PATHS`, `~` expansion, `realpath` symlink containment, `..` traversal & prefix-sibling rejection, and D24 empty-value fail-closed rejection) before existence checks, plus HTTP fail-closed `disabled` access mode with `--allow-unrestricted-paths` / `MCP_ALLOW_UNRESTRICTED_PATHS=true` opt-out (D9, D23). Covers LF-3, LF-4.
   ([spec](specs/02-allowed-paths-and-symlinks/spec.md), `scenarios/convert-local-file/02-allowed-paths-and-symlinks.txt`)
3. **03-conversion-timeout-and-limits.** Enforce `MD_MARKITDOWN_TIMEOUT_MS` (60s default) on local file conversions and reject invalid `MD_*` limit values cleanly (D7, D13). Covers LF-10.
   ([spec](specs/03-conversion-timeout-and-limits/spec.md), `scenarios/convert-local-file/03-conversion-timeout-and-limits.txt`)

### Next

In the order we expect to build them; reorder freely. Each says where it came from: criteria, a finding (a
`/dd-verify` note) or a decision.

- **04-live-local-file-verification.** Extend `src/integrations/filesystem/live.ts` with real `realpath`/`stat`/readability checks (fixing `EACCES` misclassification and rejecting non-regular files where `!stats.isFile()`), fix `cli/main.ts` piped-stdin `ERR_USE_AFTER_CLOSE` in live REPL mode, and add `scenarios/live/convert-local-file.live.txt` exercising real `src/sample-data/*` files plus live `Allowed Paths` and symlink escape refusal. From LF-12, [notes/2026-11-26-convert-local-file-verify.md](../../../notes/2026-11-26-convert-local-file-verify.md).

## Deferred

- Batch or recursive directory conversion (converting multiple files in a single tool call).
- Built-in LLM vision or OCR integration for image descriptions (out of scope per D4).
- Streaming or chunked partial Markdown responses for large documents.
