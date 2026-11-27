# Slice 01: Retrieve Markdown File

Part of the [Retrieve Markdown File plan](../../plan.md). Decisions referenced as D# / U# / I# are in
[`REQUIREMENTS.md`](../../../../../REQUIREMENTS.md).

Covers [acceptance criteria](../../acceptance-criteria.md) RM-1, RM-2, RM-3, RM-4, RM-5, RM-6, and RM-7.

## Goal

Wire the end-to-end **Retrieve Markdown File** path across a dedicated `src/markdown-retrieval/` context, the DD
harness (`retrieve [filepath]`), `src/utils.ts`, `src/Markdownify.ts`, and `src/server.ts`:

1. Extract shared pure local file-access primitives (`FileAccessPolicy`, `FileStat`, `isAbsoluteOrHomePath`,
   `resolveFileAccessPolicy`, `checkFileAccess`, `verifyReadableFile`) into `src/shared/local-access.ts` (re-exported
   by `src/local-file-conversion/` so bounded contexts stay independent).
2. Validate `filepath` is a non-empty absolute or `~`-prefixed path (**D8, D18, D25**) ending in `.md` or `.markdown`
   case-insensitively (**D8, D26**).
3. Enforce `FileAccessPolicy` (`D9, D23, D24`) and `Allowed Paths` containment via `realpath` **before** checking file
   existence (**D6, D21, I2**), then verify the `realpath`-resolved target also ends in `.md`/`.markdown` (**D26**).
4. Verify the resolved target exists, is a regular file, and is readable (**D17, D25**), read UTF-8 contents verbatim
   without a separate byte cap (**D19, D27**), and return `{ path: realTarget, text }` (**D5, D27**).

**Done when:** the tests below pass, `bun run lint` and `bun run build` pass, and
`scenarios/retrieve-markdown-file/01-retrieve-markdown-file.txt` replays cleanly
(`bun run harness run scenarios/retrieve-markdown-file/01-retrieve-markdown-file.txt`).

## Scope

**In:** `src/shared/local-access.ts`, `src/markdown-retrieval/` (`nouns.ts`, `ports.ts`, `queries.ts`, `verbs.ts`,
`markdown-retrieval.test.ts`), `readTextFile` & optional file content in `src/integrations/filesystem/{mock,live}.ts`,
`retrieve` command in `cli/commands/markdown-retrieval.ts`, optional content on `filesystem put <path> [content...]` in
`cli/commands/filesystem.ts`, case-insensitive `isMarkdownFile` in `src/utils.ts`, and `Markdownify.get` /
`src/server.ts` alignment.

**Out:**

- Live suite `scenarios/live/retrieve-markdown-file.live.txt` and real OS symlink tests — waits for Slice 02 (`02-live-markdown-retrieval`, RM-8).

## Vocabulary

- **MCP Client**, **Operator**, **Markdown File**, **Allowed Paths**, **Server Configuration**, **Markdown Result** _(derived)_, **retrieve**, **validate**.

## What it reads and writes

| Payload                          | Shape                                                        |
| -------------------------------- | ------------------------------------------------------------ |
| `MarkdownFilePath`               | `Brand<string, "MarkdownFilePath">`                          |
| `MarkdownRetrievalRequest`       | `{ readonly filePath: MarkdownFilePath }`                    |
| `MarkdownFileResult` _(derived)_ | `{ readonly path: string; readonly text: string }` (D5, D27) |

## Verbs (`src/markdown-retrieval/verbs.ts`)

| Function                                        | Rule                                                                                                                                                                                                                                                                                          | Error                                                                                                                                            |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `isMarkdownExtension(filePath)`                 | Returns `true` iff `path.extname(filePath).toLowerCase()` is `".md"` or `".markdown"` (D8, D26)                                                                                                                                                                                               | _(boolean predicate)_                                                                                                                            |
| `validateMarkdownRetrievalRequest(filePath)`    | Requires non-empty string, absolute or `~`-prefixed path (D18, D25), and Markdown extension (D8, D26)                                                                                                                                                                                         | `File path is required for this tool` / `File path "<path>" must be an absolute path or start with ~/` / `Required file is not a Markdown file.` |
| `retrieveMarkdownFile(request, ports, options)` | Enforces `checkFileAccess` before existence (D9, D21, D23, D24, I2), resolves `realpath` and checks `isMarkdownExtension(realTarget)` (D26), runs `statFile` + `verifyReadableFile` (D17, D25), reads UTF-8 verbatim via `readTextFile`, returns `markdownFileResult(realTarget, text)` (D27) | Errors from `checkFileAccess`, `Required file is not a Markdown file.`, `verifyReadableFile`, or `Failed to read file: <reason>`                 |

## Queries (`src/markdown-retrieval/queries.ts`)

| Function                                         | Definition                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `markdownFileResult(path: string, text: string)` | Computes `{ path, text }` preserving exact UTF-8 text verbatim (no trimming; D5, D27) |

## Harness

| Command                              | Kind   | What it does                                                                                                                                                                      |
| ------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `retrieve [filepath]`                | domain | Validates request, enforces `FileAccessPolicy` & `Allowed Paths`, verifies target, prints `ok: get-markdown-file (path: <realpath>)` + `\| <line>` (or `(empty)`) or `error: ...` |
| `filesystem put <path> [content...]` | world  | Creates a readable regular file at `<path>` in the mock filesystem with optional UTF-8 content (defaults to `""`; supports `\n` escapes)                                          |

## Placeholders

_(None — all rules are settled by D3, D5, D6, D8, D9, D17, D18, D19, D21, D23, D24, D25, D26, D27, and I2.)_

## Tests

- **Example tests** (`src/markdown-retrieval/markdown-retrieval.test.ts`): unit tests for `isMarkdownExtension` (`.md`, `.MD`, `.markdown`, `.Markdown`, `.txt`, extensionless), `validateMarkdownRetrievalRequest` (missing, blank, non-string, relative, non-Markdown, POSIX/Windows/`~`), and `retrieveMarkdownFile` (happy path, `~` expansion, in-bounds symlink returns `realpath`, escaping symlink refused before `statFile`, `.md -> .txt` symlink refused, HTTP `disabled`, empty & whitespace-only verbatim preservation, missing/directory/not-a-file/unreadable).
- **Utils, Markdownify & MCP boundary tests** (`src/utils.test.ts`, `src/Markdownify.test.ts`, `src/server.test.ts`): verify case-insensitive `isMarkdownFile`, `Markdownify.get` rejecting relative paths, directories, and `.md -> .txt` symlinks, returning `realpath` and verbatim contents, and `server.ts` routing `get-markdown-file` through `validateMarkdownRetrievalRequest` + `Output file: <path>`.
- **Scenario:** `scenarios/retrieve-markdown-file/01-retrieve-markdown-file.txt`.
