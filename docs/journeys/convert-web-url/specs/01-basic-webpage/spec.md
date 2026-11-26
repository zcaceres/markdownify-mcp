# Slice 01: Basic Webpage Conversion

Part of the [Convert Web URL plan](../../plan.md). Decisions referenced as D# / U# / I# are in
[`REQUIREMENTS.md`](../../../../../REQUIREMENTS.md).

Covers [acceptance criteria](../../acceptance-criteria.md) WU-1, WU-3, WU-4, WU-7, WU-10, WU-11, and WU-14.

## Goal

Wire the narrowest end-to-end path an **MCP Client** recognizes for **Convert Web URL**: validate a web tool call,
fetch a public HTTP 200 webpage, stage its bytes into a private random **Temporary File**, convert it via `markitdown`
(never through a shell), delete the **Temporary File** on both success and failure, and return a derived **Markdown
Result** (`text` only) or a structured error (`isError: true`) for invalid inputs, non-2xx HTTP statuses, network
errors, converter failures, or missing `markitdown`. Also wire the MCP server boundary (`src/server.ts`) so schema
validation failures return `isError: true` (D8) and `safeFetch` rejects non-2xx responses (D12).

**Done when:** the tests below pass, `bun run lint` and `bun run build` pass, and
`scenarios/convert-web-url/01-basic-webpage.txt` replays cleanly
(`bun run harness run scenarios/convert-web-url/01-basic-webpage.txt`).

## Scope

**In:** `src/web-conversion/` (`nouns.ts`, `verbs.ts`, `queries.ts`, `ports.ts`), in-memory mocks in
`src/integrations/network/mock.ts`, `src/integrations/markitdown/mock.ts`, and `src/integrations/filesystem/mock.ts`,
harness commands (`convert`, `network`, `markitdown`, `filesystem`), and server/fetcher alignment for D8 and D12.

**Out:**

- Full SSRF checks (schemes, private/reserved IPs, blocked hostnames, DNS lookup) and manual redirect following — waits for Slice 02 (`02-ssrf-and-redirects`, WU-2, WU-5).
- `Content-Type` / pathname extension inference, YouTube/Bing pass-through, and unconverted raw HTML detection — waits for Slice 03 (`03-format-inference-and-passthrough`, WU-8, WU-9, WU-12).
- Fetch timeout, `markitdown` timeout, 25 MB download size cap, and `MD_*` env var overrides — waits for Slice 04 (`04-timeouts-and-size-limits`, WU-6, WU-13).
- Custom auth headers or cookies — deferred (U5).

## Vocabulary

The Terminology this slice uses.

- **MCP Client**, **Web URL**, **Temporary File**, **Markdown Result** _(derived)_, **convert**, **validate**.

## What it reads and writes

| Payload                      | Shape                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `WebUrlTool`                 | `"webpage-to-markdown" \| "youtube-to-markdown" \| "bing-search-to-markdown"`       |
| `WebConversionRequest`       | `{ readonly tool: WebUrlTool; readonly url: WebUrl }`                               |
| `FetchedResponse`            | `{ readonly status: number; readonly body: Uint8Array; readonly finalUrl: string }` |
| `TemporaryFile`              | `{ readonly path: string; readonly cleanupDir: string }`                            |
| `MarkdownResult` _(derived)_ | `{ readonly text: string }` (no `path` for Web URL conversions; D5)                 |

## Verbs (`src/web-conversion/verbs.ts`)

| Function                                         | Rule                                                                                                                                                             | Error                                                                                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `validateWebRequest(tool: string, url: unknown)` | Tool must be one of the 3 web tools (D3); `url` must be a non-empty, parseable URL string (D8)                                                                   | `Unknown web tool "<tool>"` / `URL is required for this tool` / `Invalid URL "<url>"`                                                         |
| `checkHttpStatus(status: number, url: string)`   | Final HTTP status must be `200–299` (D12)                                                                                                                        | `HTTP <status> fetching <url>`                                                                                                                |
| `convertWebUrl(request, ports)`                  | Orchestrates fetch → status check → stage Temporary File → `markitdown` convert → cleanup in `finally` → derived `MarkdownResult` (D3, D5, D8, D12, D16, I3, I4) | `Network error fetching <url>: <reason>` / `HTTP <status> fetching <url>` / `markitdown executable not found` / `Conversion failed: <reason>` |

## Queries (`src/web-conversion/queries.ts`)

The derived nouns this slice computes. Never stored, never refused.

| Function                                       | Definition                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `markdownResult(text: string): MarkdownResult` | Constructs `{ text }` with no `path`, normalizing whitespace-only exit-0 output to `""` (D5, D16) |

## Harness

Output lines from `convert` are prefixed so scenario parsing (`cli/scenario.ts`) can hold Markdown headings (`# ...`),
blockquotes (`> ...`), and blank lines safely:

- Success with text: `ok: <tool> (path: none)` followed by one `| <line>` per line of `text`.
- Success with empty text: `ok: <tool> (path: none)` followed by `(empty)`.
- Failure: `error: <exact verb error message>`.

| Command                                 | Kind   | What it does                                                                                                                                         |
| --------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `convert <tool> [url]`                  | domain | Validates request, fetches via mock network, stages & cleans up mock Temporary File, converts via mock `markitdown`, prints Markdown Result or error |
| `network stub <url> <status> <body...>` | world  | Configures the in-memory network mock to return `<status>` and `<body>` for `<url>`                                                                  |
| `network fail <url> <reason...>`        | world  | Configures the in-memory network mock to reject fetches to `<url>` with `<reason>`                                                                   |
| `markitdown stub <text...>`             | world  | Configures the in-memory `markitdown` mock to return `<text>` on the next conversion (`\n` escaped as `\\n` or single line)                          |
| `markitdown empty`                      | world  | Configures the in-memory `markitdown` mock to exit 0 with whitespace-only output                                                                     |
| `markitdown fail <reason...>`           | world  | Configures the in-memory `markitdown` mock to fail with `<reason>`                                                                                   |
| `markitdown missing`                    | world  | Configures the in-memory `markitdown` mock to simulate `ENOENT` (missing executable)                                                                 |
| `filesystem temp-count`                 | world  | Prints `active temp dirs: <n>` so scenarios prove Temporary File cleanup (I4)                                                                        |

## Placeholders

_(None — all rules in Slice 01 are settled by D3, D5, D8, D12, D16, I3, and I4.)_

## Tests

- **Example tests** (`src/web-conversion/web-conversion.test.ts`): pure given/when/then tests for `validateWebRequest`, `checkHttpStatus`, `markdownResult`, and `convertWebUrl` (happy path across all 3 tool names, missing/malformed URL, HTTP 404/500, network failure, empty exit-0 output, converter failure, missing binary, and Temporary File cleanup on both success and failure).
- **MCP boundary tests** (`src/server.test.ts` or `src/Markdownify.test.ts`): verify invalid tool argument types return `isError: true` (D8) and `Markdownify.toMarkdown` rejects non-2xx HTTP responses (D12).
- **Scenario:** `scenarios/convert-web-url/01-basic-webpage.txt`.
