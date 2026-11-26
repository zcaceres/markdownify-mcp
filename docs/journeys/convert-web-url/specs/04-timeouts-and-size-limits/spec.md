# Slice 04: Timeouts, Download Size Cap, and Env Overrides

Part of the [Convert Web URL plan](../../plan.md). Decisions referenced as D# / U# / I# are in
[`REQUIREMENTS.md`](../../../../../REQUIREMENTS.md). Builds on [slice 03](../03-format-inference-and-passthrough/spec.md).

Covers [acceptance criteria](../../acceptance-criteria.md) WU-6 and WU-13.

## Goal

Bound every Web URL fetch and `markitdown` conversion with deterministic timeouts and a streaming download size cap
(**D7, D13**):

- 30-second fetch timeout (`MD_FETCH_TIMEOUT_MS`, default `30000`)
- 60-second `markitdown` subprocess timeout (`MD_MARKITDOWN_TIMEOUT_MS`, default `60000`)
- 25 MB maximum Web URL download size (`MD_MAX_DOWNLOAD_BYTES`, default `26214400`), aborting before buffering unbounded bodies
- Maximum 10 redirect hops (`MD_MAX_REDIRECTS`, default `10`)

Ensure any **Temporary File** staged before a `markitdown` timeout is deleted (**I4**), and wire the exact same limits
and streaming reader into `src/Markdownify.ts`.

**Done when:** the tests below pass, `bun run lint` and `bun run build` pass, and
`scenarios/convert-web-url/04-timeouts-and-size-limits.txt` replays cleanly
(`bun run harness run scenarios/convert-web-url/04-timeouts-and-size-limits.txt`).

## Scope

**In:** `WebConversionLimits` and limit defaults (`src/web-conversion/nouns.ts`), `parseWebLimits` and timeout/size
error handling (`src/web-conversion/verbs.ts`), typed `FetchError` and `MarkitdownError` (`src/web-conversion/ports.ts`),
streaming download cap and `AbortSignal.timeout` / `execFile` timeout in `src/Markdownify.ts`, and `network slow`,
`network stub-size`, `markitdown slow`, and `config set` harness commands.

**Out:**

- `repomix` subprocess timeout — belongs to **Convert Git Repository** (`U2`).
- Custom auth headers or cookies — deferred (`U5`).

## Vocabulary

- **MCP Client**, **Operator**, **Web URL**, **Server Configuration**, **Temporary File**, **Markdown Result** _(derived)_, **convert**, **validate**.

## What it reads and writes

| Payload               | Shape                                                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WebConversionLimits` | `{ readonly fetchTimeoutMs: number; readonly markitdownTimeoutMs: number; readonly maxDownloadBytes: number; readonly maxRedirects: number }`                                    |
| `FetchError`          | `{ readonly kind: "timeout"; readonly timeoutMs: number } \| { readonly kind: "too-large"; readonly maxBytes: number } \| { readonly kind: "network"; readonly reason: string }` |
| `MarkitdownError`     | `{ readonly kind: "missing" } \| { readonly kind: "timeout"; readonly timeoutMs: number } \| { readonly kind: "failed"; readonly reason: string }`                               |

## Verbs (`src/web-conversion/verbs.ts`)

| Function                                 | Rule                                                                                                                                                                                                        | Error                                                                                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `parseWebLimits(env)`                    | Parses `MD_FETCH_TIMEOUT_MS`, `MD_MARKITDOWN_TIMEOUT_MS`, `MD_MAX_DOWNLOAD_BYTES` (positive integers) and `MD_MAX_REDIRECTS` (non-negative integer), falling back to D13 defaults                           | `Invalid <VAR> "<raw>": must be a positive integer` / `Invalid MD_MAX_REDIRECTS "<raw>": must be a non-negative integer`                     |
| `convertWebUrl(request, ports, options)` | Enforces `fetchTimeoutMs`, `maxDownloadBytes` (skipping body cap on direct YouTube/Bing pass-through), `maxRedirects`, and `markitdownTimeoutMs`, deleting any Temporary File on timeout (D7, D13, D14, I4) | `Fetch timed out after <ms>ms for <url>` / `Download exceeded maximum size of <bytes> bytes for <url>` / `Conversion timed out after <ms>ms` |

## Queries (`src/web-conversion/queries.ts`)

Unchanged from Slice 01 (`markdownResult`).

## Harness

| Command                           | Kind  | What it does                                                                                                                                 |
| --------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `network slow <url> <duration>`   | world | Simulates fetch latency (`10s`, `35s`, etc.) for `<url>`, advancing the mock clock and timing out when exceeding `fetchTimeoutMs`            |
| `network stub-size <url> <bytes>` | world | Stubs a 200 response for `<url>` reporting `<bytes>` body size without allocating huge buffers                                               |
| `markitdown slow <duration>`      | world | Simulates `markitdown` conversion latency, advancing the mock clock and timing out when exceeding `markitdownTimeoutMs`                      |
| `config set <VAR> <value>`        | world | Sets an environment override (`MD_FETCH_TIMEOUT_MS`, `MD_MARKITDOWN_TIMEOUT_MS`, `MD_MAX_DOWNLOAD_BYTES`, `MD_MAX_REDIRECTS`) in the session |

## Placeholders

_(None — all defaults and `MD_*` env var names are settled by D13.)_

## Tests

- **Example tests** (`src/web-conversion/web-conversion.test.ts`): unit tests for `parseWebLimits` (defaults, valid overrides, zero `MD_MAX_REDIRECTS`, invalid values) and `convertWebUrl` (fetch timeout, download size exceeded without staging, defense-in-depth byteLength check, `markitdown` timeout cleaning up Temporary File).
- **Server fetcher tests** (`src/Markdownify.test.ts`): verify `Content-Length` rejection, streaming chunk accumulation aborting past `MD_MAX_DOWNLOAD_BYTES`, `MD_MAX_REDIRECTS` env override, and fetch timeout rejection.
- **Scenario:** `scenarios/convert-web-url/04-timeouts-and-size-limits.txt`.
