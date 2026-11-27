# Slice 03: Conversion Timeout and Limits

Part of the [Convert Local File plan](../../plan.md). Decisions referenced as D# / U# / I# are in
[`REQUIREMENTS.md`](../../../../../REQUIREMENTS.md). Builds on [slice 02](../02-allowed-paths-and-symlinks/spec.md).

Covers [acceptance criterion](../../acceptance-criteria.md) LF-10.

## Goal

Enforce bounded `markitdown` subprocess timeouts (**D7, D13**) on Local File conversions in `src/local-file-conversion/`,
the DD harness, and `src/Markdownify.ts`:

1. Parse `MD_MARKITDOWN_TIMEOUT_MS` (60s default, positive integer) via `parseLocalFileLimits`, rejecting invalid values
   with a structured error before touching the filesystem or spawning `markitdown` (**D7, D8, D13**).
2. Pass the parsed timeout into `convertLocalFile` and `Markdownify._markitdown`, aborting conversions that exceed the
   limit with `Conversion timed out after <ms>ms` (**D7, D13**).

**Done when:** the tests below pass, `bun run lint` and `bun run build` pass, and
`scenarios/convert-local-file/03-conversion-timeout-and-limits.txt` replays cleanly
(`bun run harness run scenarios/convert-local-file/03-conversion-timeout-and-limits.txt`).

## Scope

**In:** `LocalFileConversionLimits` (`src/local-file-conversion/nouns.ts`), `parseLocalFileLimits`
(`src/local-file-conversion/verbs.ts`), wiring `parseLocalFileLimits` in `cli/commands/web-conversion.ts` and
`src/Markdownify.ts`, and `scenarios/convert-local-file/03-conversion-timeout-and-limits.txt`.

**Out:**

- Live suite `scenarios/live/convert-local-file.live.txt`, `statRealLocalFile` `EACCES`/`!isFile()` fix, and `cli/main.ts` piped-stdin REPL fix — waits for Slice 04 (`04-live-local-file-verification`, LF-12).

## Vocabulary

- **MCP Client**, **Operator**, **Local File**, **Server Configuration**, **Markdown Result** _(derived)_, **convert**, **validate**.

## What it reads and writes

| Payload                     | Shape                                      |
| --------------------------- | ------------------------------------------ |
| `LocalFileConversionLimits` | `{ readonly markitdownTimeoutMs: number }` |

## Verbs (`src/local-file-conversion/verbs.ts`)

| Function                    | Rule                                                                                                                              | Error                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `parseLocalFileLimits(env)` | Parses `MD_MARKITDOWN_TIMEOUT_MS` as a positive integer, defaulting to `DEFAULT_LOCAL_MARKITDOWN_TIMEOUT_MS` (`60_000`) (D7, D13) | `Invalid MD_MARKITDOWN_TIMEOUT_MS "<raw>": must be a positive integer` |

`convertLocalFile(request, ports, options)` passes `options.markitdownTimeoutMs ?? DEFAULT_LOCAL_MARKITDOWN_TIMEOUT_MS`
to `ports.convertWithMarkitdown` and formats `{ kind: "timeout", timeoutMs }` via `formatMarkitdownError` as
`Conversion timed out after <ms>ms`.

## Queries (`src/local-file-conversion/queries.ts`)

Unchanged from Slice 01 (`markdownResult`).

## Harness

Uses existing `config set MD_MARKITDOWN_TIMEOUT_MS <value>`, `markitdown slow <duration>`, `clock`, and
`convert <local-file-tool> <filepath>`.

## Placeholders

_(None — default 60s timeout and `MD_MARKITDOWN_TIMEOUT_MS` override are settled by D7 and D13.)_

## Tests

- **Example tests** (`src/local-file-conversion/local-file-conversion.test.ts`): unit tests for `parseLocalFileLimits` (default `60_000`, custom positive integer, whitespace trimming, empty treated as default, rejecting `0`, negative, non-numeric, float, and overflow) and `convertLocalFile` timeout handling (default 60s and custom `markitdownTimeoutMs`).
- **Markdownify tests** (`src/Markdownify.test.ts`): verify invalid `MD_MARKITDOWN_TIMEOUT_MS` fails local file conversion cleanly and unrelated web env vars (`MD_FETCH_TIMEOUT_MS`) do not break local file conversions.
- **Scenario:** `scenarios/convert-local-file/03-conversion-timeout-and-limits.txt`.
