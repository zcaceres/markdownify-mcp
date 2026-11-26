# Slice 03: Format Inference, YouTube/Bing Pass-through, and Unconverted HTML

Part of the [Convert Web URL plan](../../plan.md). Decisions referenced as D# / U# / I# are in
[`REQUIREMENTS.md`](../../../../../REQUIREMENTS.md). Builds on [slice 02](../02-ssrf-and-redirects/spec.md).

Covers [acceptance criteria](../../acceptance-criteria.md) WU-8, WU-9, and WU-12.

## Goal

Complete Web URL input routing and output validation:

1. Infer the **Temporary File** extension from known HTTP `Content-Type` media types first (HTML, PDF, DOCX/XLSX/PPTX, common images and audio, plain text, Markdown, CSV, JSON, XML), falling back to a recognized URL pathname extension, and defaulting to `.html` (**D10, D15**).
2. Route canonical `https://www.youtube.com/watch?v=...` and `https://www.bing.com/search?q=...` URLs (including after redirect resolution such as `youtu.be`) directly to `markitdown` without creating a **Temporary File** (**D10, D14**).
3. Reject raw unconverted HTML (`<!DOCTYPE` / `<html`) returned by `markitdown` as a conversion failure and clean up any **Temporary File** (**D3, D8, I4**).

Also align `src/utils.ts` (`inferExtensionFromUrl`, `shouldPassUrlToMarkitdown`, `isUnconvertedHtml`) and `src/Markdownify.ts` so the live MCP server shares the exact same rules.

**Done when:** the tests below pass, `bun run lint` and `bun run build` pass, and
`scenarios/convert-web-url/03-format-inference-and-passthrough.txt` replays cleanly
(`bun run harness run scenarios/convert-web-url/03-format-inference-and-passthrough.txt`).

## Scope

**In:** `inferTempExtension`, `shouldPassUrlDirectly`, and `checkConvertedOutput` in `src/web-conversion/verbs.ts`,
optional `contentType` on `FetchedResponse` (`src/web-conversion/nouns.ts`), `network content-type`,
`markitdown last-input`, and `filesystem staged-count` harness commands, and `src/utils.ts` / `src/Markdownify.ts`
alignment.

**Out:**

- Fetch timeout, `markitdown` timeout, 25 MB streaming download cap, and `MD_*` env var overrides — waits for Slice 04 (`04-timeouts-and-size-limits`, WU-6, WU-13).
- Custom auth headers or cookies — deferred (U5).

## Vocabulary

- **MCP Client**, **Web URL**, **Temporary File**, **Markdown Result** _(derived)_, **convert**, **validate**.

## What it reads and writes

| Payload           | Shape                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `FetchedResponse` | `{ readonly status: number; readonly body: Uint8Array; readonly finalUrl: string; readonly location?: string; readonly contentType?: string }` |

## Verbs (`src/web-conversion/verbs.ts`)

| Function                                 | Rule                                                                                                                                                                                                                                                                                                                          | Error                                                                                                                                                                                         |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inferTempExtension(url, contentType?)`  | Maps known `Content-Type` media types (stripping parameters) first; falls back to recognized URL pathname extension; defaults to `"html"` (D10, D15)                                                                                                                                                                          | _(infallible helper)_                                                                                                                                                                         |
| `shouldPassUrlDirectly(url)`             | True only for `https://www.youtube.com/watch?v=...` and `https://www.bing.com/search?q=...` (D10, D14)                                                                                                                                                                                                                        | _(boolean predicate)_                                                                                                                                                                         |
| `checkConvertedOutput(stdout)`           | Rejects raw HTML starting with `<!DOCTYPE` or `<html` after leading whitespace (case-insensitive) (D3, D8)                                                                                                                                                                                                                    | `Conversion failed: the page returned raw HTML that could not be converted to Markdown. This typically happens with JavaScript-rendered pages (SPAs) that require a browser to load content.` |
| `convertWebUrl(request, ports, options)` | After redirects + 2xx status check: if `shouldPassUrlDirectly(finalUrl)`, invokes `convertWithMarkitdown(finalUrl)` directly without staging a Temporary File; otherwise stages with `inferTempExtension(finalUrl, contentType)` and cleans up in `finally`; validates output with `checkConvertedOutput` (D10, D14, D15, I4) | See `checkConvertedOutput` plus Slice 01–02 errors                                                                                                                                            |

## Queries (`src/web-conversion/queries.ts`)

Unchanged from Slice 01 (`markdownResult`).

## Harness

| Command                             | Kind  | What it does                                                                                    |
| ----------------------------------- | ----- | ----------------------------------------------------------------------------------------------- |
| `network content-type <url> <mime>` | world | Sets the `Content-Type` header on an existing stubbed response for `<url>`                      |
| `markitdown last-input`             | world | Prints `last input: <path-or-url>` (or `last input: (none)`) showing what `markitdown` received |
| `filesystem staged-count`           | world | Prints `staged count: <n>` showing total Temporary Files staged since session start/reset       |

## Placeholders

_(None — all rules in Slice 03 are settled by D3, D8, D10, D14, D15, and I4.)_

## Tests

- **Example tests** (`src/web-conversion/web-conversion.test.ts`): unit tests for `inferTempExtension` (`Content-Type` precedence over pathname, MIME parameters like `; charset=utf-8`, PDF/Office/image/audio/text/JSON/XML/CSV mappings, pathname fallback on `application/octet-stream` or missing header, `.html` default), `shouldPassUrlDirectly` (YouTube watch, Bing search, lookalike host rejection, non-https rejection), `checkConvertedOutput` (raw HTML `<!DOCTYPE`/`<html` case-insensitive vs Markdown/empty), and `convertWebUrl` end-to-end routing (extensionless PDF via `Content-Type`, `youtu.be` redirect pass-through without staging, unconverted HTML failure with cleanup).
- **Scenario:** `scenarios/convert-web-url/03-format-inference-and-passthrough.txt`.
