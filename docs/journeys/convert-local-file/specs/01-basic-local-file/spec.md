# Slice 01: Basic Local File Conversion

Part of the [Convert Local File plan](../../plan.md). Decisions referenced as D# / U# / I# are in
[`REQUIREMENTS.md`](../../../../../REQUIREMENTS.md).

Covers [acceptance criteria](../../acceptance-criteria.md) LF-1, LF-2, LF-5, LF-6, LF-7, LF-8, LF-9, and LF-11.

## Goal

Wire the narrowest end-to-end path an **MCP Client** recognizes for **Convert Local File**: validate any of the 6 local
file tools and require an absolute or `~`-prefixed path (**D3, D8, D18**), pre-validate in Node that the target exists,
is a regular file (not a directory), and is readable (**D17**), convert via `markitdown` (**I3**) without a separate
input file size cap (**D19**) or Web URL raw-HTML rejection (**D20**), normalize whitespace-only exit-0 output to `""`
(**D16**), append an actionable `markitdown[all]` vs slim Docker `pdf` hint on `MissingDependencyException`
(**D4, D22**), and return a derived **Markdown Result** (`text` only, **D5**) or structured error (`isError: true`).
Align `src/server.ts` and `src/Markdownify.ts` to share these exact rules.

**Done when:** the tests below pass, `bun run lint` and `bun run build` pass, and
`scenarios/convert-local-file/01-basic-local-file.txt` replays cleanly
(`bun run harness run scenarios/convert-local-file/01-basic-local-file.txt`).

## Scope

**In:** `src/local-file-conversion/` (`nouns.ts`, `ports.ts`, `queries.ts`, `verbs.ts`), mock filesystem file/directory/
unreadable state in `src/integrations/filesystem/mock.ts` and `cli/commands/filesystem.ts`, extending `convert` in
`cli/commands/` to dispatch all 6 local file tools alongside the 3 web tools, and aligning `src/server.ts` and
`src/Markdownify.ts` (`D17`, `D18`, `D20`, `D22`).

**Out:**

- `Allowed Paths` (`MD_ALLOWED_PATHS`), symlink containment (`I2`), and HTTP fail-closed disabled policy (`D9`) — waits for Slice 02 (`02-allowed-paths-and-symlinks`, LF-3, LF-4).
- `MD_MARKITDOWN_TIMEOUT_MS` timeout enforcement and invalid `MD_*` config handling — waits for Slice 03 (`03-conversion-timeout-and-limits`, LF-10).
- Live filesystem adapter (`stat`/`realpath`) and `scenarios/live/convert-local-file.live.txt` — waits for Slice 04 (`04-live-local-file-verification`, LF-12).

## Vocabulary

- **MCP Client**, **Local File**, **Markdown Result** _(derived)_, **convert**, **validate**.

## What it reads and writes

| Payload                      | Shape                                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `LocalFileTool`              | `"pdf-to-markdown" \| "image-to-markdown" \| "audio-to-markdown" \| "docx-to-markdown" \| "xlsx-to-markdown" \| "pptx-to-markdown"` |
| `LocalFilePath`              | `Brand<string, "LocalFilePath">` (absolute POSIX/Windows path or `~`-prefixed path)                                                 |
| `LocalFileConversionRequest` | `{ readonly tool: LocalFileTool; readonly filePath: LocalFilePath }`                                                                |
| `FileStat`                   | `{ readonly kind: "missing" } \| { readonly kind: "directory" } \| { readonly kind: "unreadable" } \| { readonly kind: "file" }`    |
| `MarkdownResult` _(derived)_ | `{ readonly text: string }` (no `path` for Local File conversions; D5)                                                              |

## Verbs (`src/local-file-conversion/verbs.ts`)

| Function                                   | Rule                                                                                                                                                                                                           | Error                                                                                                                                                                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validateLocalFileRequest(tool, filePath)` | Tool must be one of the 6 local file tools (D3); `filePath` must be a non-empty string that is absolute (POSIX `/...`, Windows `C:\...` / `C:/...`, or UNC `\\...`) or `~`-prefixed (`~` or `~/...`) (D8, D18) | `Unknown local file tool "<tool>"` / `File path is required for this tool` / `File path "<path>" must be an absolute path or start with ~/`                                                                                                 |
| `verifyReadableFile(resolvedPath, stat)`   | Target must exist, be a regular file, and be readable before spawning `markitdown` (D17)                                                                                                                       | `File does not exist: <path>` / `Path is a directory, not a file: <path>` / `File is not readable: <path>`                                                                                                                                  |
| `formatMarkitdownError(error)`             | Maps `MarkitdownError` to structured message; appends slim-Docker hint when `reason` includes `MissingDependencyException` (D4, D22)                                                                           | `markitdown executable not found` / `Conversion timed out after <ms>ms` / `Conversion failed: <reason>. This format requires markitdown[all] (full local install) rather than the slim Docker pdf profile.` / `Conversion failed: <reason>` |
| `convertLocalFile(request, ports)`         | Expands `~`, checks `statFile`, invokes `convertWithMarkitdown` (no Web URL raw-HTML check, D20), returns `markdownResult` (D5, D16, I3)                                                                       | Errors from `verifyReadableFile` and `formatMarkitdownError`                                                                                                                                                                                |

## Queries (`src/local-file-conversion/queries.ts`)

| Function                                       | Definition                                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `markdownResult(text: string): MarkdownResult` | Re-exports/computes `{ text }` with no `path`, normalizing whitespace-only exit-0 output to `""` (D5, D16) |

## Harness

Extends the `convert` domain command (`convert <tool> [target]`) to dispatch both the 3 web tools and the 6 local file
tools (updating `cli/scenarios.test.ts` usage expectation accordingly).

| Command                                | Kind   | What it does                                                                                                                                                           |
| -------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `convert <local-file-tool> [filepath]` | domain | Validates request & path shape, verifies mock file stat, converts via mock `markitdown`, prints `ok: <tool> (path: none)` + `\| <line>` (or `(empty)`) or `error: ...` |
| `filesystem put <path>`                | world  | Creates a readable regular file at `<path>` in the mock filesystem                                                                                                     |
| `filesystem mkdir <path>`              | world  | Creates a directory at `<path>` in the mock filesystem                                                                                                                 |
| `filesystem unreadable <path>`         | world  | Marks a regular file at `<path>` as unreadable in the mock filesystem                                                                                                  |

## Placeholders

_(None — all rules in Slice 01 are settled by D3, D4, D5, D8, D16, D17, D18, D19, D20, D22, and I3.)_

## Tests

- **Example tests** (`src/local-file-conversion/local-file-conversion.test.ts`): unit tests for `validateLocalFileRequest` (all 6 tools, missing/blank/non-string, relative vs POSIX/Windows/`~` paths), `verifyReadableFile` (missing, directory, unreadable, regular file), `formatMarkitdownError` (missing binary, generic failure, `MissingDependencyException` hint), and `convertLocalFile` (happy path, `~/` expansion, empty output, HTML-prefixed text preserved, pre-validation skips `markitdown`).
- **MCP boundary & fetcher tests** (`src/server.test.ts`, `src/Markdownify.test.ts`): verify relative/blank `filepath` rejections return `isError: true`, missing/directory local paths fail without spawning `markitdown`, and local file output beginning with `<!DOCTYPE html>` is preserved (D20).
- **Scenario:** `scenarios/convert-local-file/01-basic-local-file.txt`.
