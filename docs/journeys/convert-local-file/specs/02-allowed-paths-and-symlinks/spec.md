# Slice 02: Allowed Paths, Symlinks, and HTTP Fail-Closed Policy

Part of the [Convert Local File plan](../../plan.md). Decisions referenced as D# / U# / I# are in
[`REQUIREMENTS.md`](../../../../../REQUIREMENTS.md). Builds on [slice 01](../01-basic-local-file/spec.md).

Covers [acceptance criteria](../../acceptance-criteria.md) LF-3 and LF-4.

## Goal

Enforce filesystem access boundaries (**D6, D9, D21, D23, D24, I2**) inside `src/local-file-conversion/`, the DD
harness, and the MCP server (`src/server.ts`, `src/http.ts`, `src/index.ts`):

1. Resolve `FileAccessPolicy` from `MD_ALLOWED_PATHS` (delimiter-separated; fail closed with a configuration error if
   explicitly set to an empty, whitespace-only, or delimiter-only value, **D24**) and transport mode (`stdio` defaults
   to unrestricted when unset; `http` fails closed with `disabled` unless `MD_ALLOWED_PATHS` or
   `--allow-unrestricted-paths` / `MCP_ALLOW_UNRESTRICTED_PATHS=true` is configured, **D6, D9, D23**).
2. Check access policy and `Allowed Paths` containment (after `~` expansion and `realpath` resolution) **before**
   checking file existence, blocking `..` traversals, shared-prefix sibling directories, and symlinks escaping an
   Allowed Path (**D21, I2**).

**Done when:** the tests below pass, `bun run lint` and `bun run build` pass, and
`scenarios/convert-local-file/02-allowed-paths-and-symlinks.txt` replays cleanly
(`bun run harness run scenarios/convert-local-file/02-allowed-paths-and-symlinks.txt`).

## Scope

**In:** `FileAccessPolicy` (`src/local-file-conversion/nouns.ts`), `ResolveRealpath` port
(`src/local-file-conversion/ports.ts`), `resolveFileAccessPolicy` and `checkFileAccess`
(`src/local-file-conversion/verbs.ts`), symlink resolution in `src/integrations/filesystem/{mock,live}.ts`,
`filesystem symlink <link> <target>` harness command, `config`-driven policy in `cli/commands/web-conversion.ts`, and
HTTP fail-closed enforcement in `src/server.ts` / `src/http.ts`.

**Out:**

- `MD_MARKITDOWN_TIMEOUT_MS` enforcement and invalid `MD_*` timeout handling — waits for Slice 03 (`03-conversion-timeout-and-limits`, LF-10).
- Live suite `scenarios/live/convert-local-file.live.txt` and `statRealLocalFile` `EACCES`/`!isFile()` fix — waits for Slice 04 (`04-live-local-file-verification`, LF-12).

## Vocabulary

- **MCP Client**, **Operator**, **Local File**, **Allowed Paths**, **Server Configuration**, **Markdown Result** _(derived)_, **convert**, **validate**.

## What it reads and writes

| Payload                      | Shape                                                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FileAccessPolicy`           | `{ readonly kind: "unrestricted" } \| { readonly kind: "allowed-paths"; readonly directories: readonly string[] } \| { readonly kind: "disabled" }` |
| `LocalFileConversionOptions` | `{ readonly accessPolicy?: FileAccessPolicy; readonly markitdownTimeoutMs?: number; readonly pathDelimiter?: string }`                              |

## Verbs (`src/local-file-conversion/verbs.ts`)

| Function                                                                     | Rule                                                                                                                                                                                                                                                                   | Error                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveFileAccessPolicy(env, expandHome, options)`                          | Parses `MD_ALLOWED_PATHS` (D6, D23), returning `err` if set but empty/delimiter-only (D24); in `http` mode without Allowed Paths or `--allow-unrestricted-paths` / `MCP_ALLOW_UNRESTRICTED_PATHS=true` returns `disabled` (D9, D23); in `stdio` returns `unrestricted` | `MD_ALLOWED_PATHS is set but contains no valid directories. Specify at least one directory or unset MD_ALLOWED_PATHS.`                                                                                                                                                                                                                                        |
| `checkFileAccess(rawPath, expandedPath, policy, resolveRealpath, delimiter)` | Refuses immediately on `disabled` (D9); when `allowed-paths`, resolves `realpath` of target and allowed dirs and verifies containment via `isWithinDirectory` before any stat check (D21, I2)                                                                          | `Local file tools are disabled in HTTP mode when MD_ALLOWED_PATHS is unset. Set MD_ALLOWED_PATHS, or pass --allow-unrestricted-paths / MCP_ALLOW_UNRESTRICTED_PATHS=true to opt out.` / `Path "<rawPath>" is outside the allowed directories. Set MD_ALLOWED_PATHS to a <delim>-separated list that includes a parent directory (currently allowed: <dirs>).` |
| `convertLocalFile(request, ports, options)`                                  | Runs `checkFileAccess` before `statFile` and `convertWithMarkitdown` (D21, I2)                                                                                                                                                                                         | Errors from `checkFileAccess` plus Slice 01 errors                                                                                                                                                                                                                                                                                                            |

## Queries (`src/local-file-conversion/queries.ts`)

Unchanged from Slice 01 (`markdownResult`).

## Harness

| Command                              | Kind  | What it does                                                                  |
| ------------------------------------ | ----- | ----------------------------------------------------------------------------- |
| `filesystem symlink <link> <target>` | world | Creates a symlink in the mock filesystem from `<link>` pointing to `<target>` |

Existing `config set MD_ALLOWED_PATHS <dirs>`, `config set MCP_TRANSPORT http`, and
`config set MCP_ALLOW_UNRESTRICTED_PATHS true` control the session's `FileAccessPolicy`.

## Placeholders

_(None — HTTP opt-out names and `MD_SHARE_DIR` removal are settled by D23, and empty `MD_ALLOWED_PATHS` handling by D24.)_

## Tests

- **Example tests** (`src/local-file-conversion/local-file-conversion.test.ts`): unit tests for `resolveFileAccessPolicy` (`stdio` default unrestricted, `MD_ALLOWED_PATHS` parsing with `~` expansion, `MD_SHARE_DIR` ignored per D23, empty/delimiter-only `MD_ALLOWED_PATHS` rejected per D24, `http` fail-closed `disabled`, `--allow-unrestricted-paths` / `MCP_ALLOW_UNRESTRICTED_PATHS=true` opt-out) and `convertLocalFile` (allowed file, out-of-bounds missing file blocked before `statFile` per D21, `..` traversal, prefix-sibling `/data-evil`, symlink escape, valid in-bounds symlink, HTTP `disabled` refusal).
- **MCP boundary & HTTP CLI tests** (`src/server.test.ts`, `src/http.test.ts`, `src/utils.test.ts`): verify `createServer({ transport: "http" })` rejects local file tools (including `get-markdown-file`) when `MD_ALLOWED_PATHS` is unset (D9), permits opting out via `MCP_ALLOW_UNRESTRICTED_PATHS=true` or `{ allowUnrestrictedPaths: true }` (D23), parses `--allow-unrestricted-paths` in `parseCliArgs`, ignores `MD_SHARE_DIR` (D23), and fails closed on empty/delimiter-only `MD_ALLOWED_PATHS` (D24).
- **Scenario:** `scenarios/convert-local-file/02-allowed-paths-and-symlinks.txt`.
