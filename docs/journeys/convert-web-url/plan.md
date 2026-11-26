# Convert Web URL: Plan

How the journey is built, slice by slice. What it must do is in its [acceptance criteria](acceptance-criteria.md);
decisions (D#) and questions (U#) are in [`REQUIREMENTS.md`](../../../REQUIREMENTS.md).

## Sources

The designs, flows, tickets and documents behind this journey, from its design session (2026-11-25).

- [REQUIREMENTS.md](../../../REQUIREMENTS.md): system decisions D1–D16, invariants I1–I5, open question U5.
- [src/Markdownify.ts](../../../src/Markdownify.ts), [src/utils.ts](../../../src/utils.ts), [src/server.ts](../../../src/server.ts), [src/tools.ts](../../../src/tools.ts): existing web URL fetching, SSRF guards, routing, and `markitdown` invocation.
- [src/Markdownify.test.ts](../../../src/Markdownify.test.ts), [src/utils.test.ts](../../../src/utils.test.ts): existing unit tests covering SSRF, temp cleanup, and YouTube/Bing routing.

## Shape

An **MCP Client** calls `webpage-to-markdown`, `youtube-to-markdown`, or `bing-search-to-markdown` with a **Web URL**.
The server validates the request and the URL (and every redirect hop) against SSRF rules via DNS lookup, fetches the
remote resource with manual redirects while enforcing HTTP 2xx status, timeout, and download size bounds, then either
passes canonical YouTube/Bing URLs straight to `markitdown` or infers a file extension and stages the downloaded bytes
into a private **Temporary File**. `markitdown` converts the input via `execFile` within a timeout and buffer limit,
the **Temporary File** is always cleaned up, unconverted raw HTML is rejected while empty exit-0 output is allowed, and
the server returns a derived **Markdown Result** (`text` only) or a structured MCP tool error (`isError: true`).

## Contexts, verbs and queries

Where this journey lives in the code. Each noun is a type in the context's `nouns.ts`. Each verb is a function in its
`verbs.ts`, and each derived noun a function in its `queries.ts`, each exercised by a harness command.

| Context               | Nouns                                                                                                                       | Verbs                                                                                                                                                               | Queries          | Harness commands       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------- |
| `src/web-conversion/` | `WebUrlTool`, `WebUrl`, `WebConversionRequest`, `WebConversionLimits`, `FetchedResponse`, `TemporaryFile`, `MarkdownResult` | `validateWebRequest`, `validateWebUrl`, `parseWebLimits`, `checkHttpStatus`, `convertWebUrl`, `inferTempExtension`, `shouldPassUrlDirectly`, `checkConvertedOutput` | `markdownResult` | `convert <tool> <url>` |

## External systems

Every system outside ours is mocked in `src/integrations/<system>/`; world commands make it do what the journey needs.

| System       | What we need from it                                                                       | World commands                                                                                                                                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clock`      | Deterministic time for timeout checks                                                      | `clock`, `clock advance <duration>`, `clock set <time>`                                                                                                                                                                                                                                                     |
| `network`    | DNS resolution and HTTP fetch responses (status, headers, redirects, body, delays, errors) | `network stub <url> <status> <body...>`, `network stub-size <url> <bytes>`, `network content-type <url> <mime...>`, `network redirect <from> <status> <to>`, `network dns <host> <ip...>`, `network dns-fail <host>`, `network fail <url> <reason>`, `network fetch-count`, `network slow <url> <duration>` |
| `markitdown` | Convert a Temporary File or allowlisted URL to Markdown text (or fail / hang / be missing) | `markitdown stub <text...>`, `markitdown empty`, `markitdown fail <reason>`, `markitdown missing`, `markitdown last-input`, `markitdown slow <duration>`                                                                                                                                                    |
| `filesystem` | Create private random Temporary Files and clean them up                                    | `filesystem temp-count`, `filesystem staged-count`                                                                                                                                                                                                                                                          |
| `config`     | Server Configuration `MD_*` limit overrides                                                | `config set <VAR> <value>`, `config clear <VAR>`                                                                                                                                                                                                                                                            |

## Slices

Each slice is one capability, wired through every part of the system (harness commands, verbs, ports, mocks) with a
scenario that runs it. The first is the **tracer bullet**: the narrowest path a user would recognize, and nothing else.
Each later slice adds one capability, chosen from the criteria not yet met or from what running the journey turned up.
Each has a [spec](specs/) and a scenario in `scenarios/convert-web-url/`.

### Done

1. **01-basic-webpage.** Tracer bullet: validate request, fetch a 200 HTML webpage, stage and clean up a Temporary File, convert via `markitdown`, and return the Markdown Result (plus invalid input, non-2xx status, network/converter failure, missing binary, and empty output). Covers WU-1, WU-3, WU-4, WU-7, WU-10, WU-11, WU-14.
   ([spec](specs/01-basic-webpage/spec.md), `scenarios/convert-web-url/01-basic-webpage.txt`)
2. **01b-server-and-harness-alignment.** Routed web tools in `src/server.ts` through `validateWebRequest`, formatted Zod schema errors as a single concise line (D8), normalized whitespace-only `markitdown` stdout via `markdownResult` in `src/Markdownify.ts` (D16), rejected trailing args in `convert`, and synced `plan.md` and `README.md` (D3).
3. **02-ssrf-and-redirects.** Full SSRF validation (public `http:`/`https:`, blocked hostnames, private/reserved IPv4/IPv6, DNS lookup fail-closed) and manual redirect traversal validating every hop (up to 10 redirects). Covers WU-2, WU-5.
   ([spec](specs/02-ssrf-and-redirects/spec.md), `scenarios/convert-web-url/02-ssrf-and-redirects.txt`)
4. **03-format-inference-and-passthrough.** `Content-Type` → URL pathname → `.html` extension inference, canonical YouTube/Bing pass-through (including `youtu.be` redirect resolution without staging a Temporary File), and unconverted raw HTML rejection. Covers WU-8, WU-9, WU-12.
   ([spec](specs/03-format-inference-and-passthrough/spec.md), `scenarios/convert-web-url/03-format-inference-and-passthrough.txt`)
5. **04-timeouts-and-size-limits.** 30s fetch timeout (`MD_FETCH_TIMEOUT_MS`), 60s `markitdown` timeout (`MD_MARKITDOWN_TIMEOUT_MS`), 25 MB streaming download cap (`MD_MAX_DOWNLOAD_BYTES`), and `MD_MAX_REDIRECTS` env override. Covers WU-6, WU-13.
   ([spec](specs/04-timeouts-and-size-limits/spec.md), `scenarios/convert-web-url/04-timeouts-and-size-limits.txt`)
6. **05-live-harness-verification.** Live adapters (`src/integrations/{network,filesystem,markitdown,clock}/live.ts`), `--live` / `exec --live` / `live` CLI modes, and variance-tolerant live suite (`scenarios/live/convert-web-url.live.txt`) verified against repo `src/sample-data/*` and real internet URLs.
   ([spec](specs/05-live-harness-verification/spec.md), `scenarios/live/convert-web-url.live.txt`)

### Next

_(None — all 14 acceptance criteria hold in both mock and live harness modes.)_

## Deferred

- Headless browser / JavaScript-rendered SPA execution (raw HTML pages continue to fail with a clear SPA error; D3, D8).
- Streaming or chunked partial Markdown responses for large pages.
- Custom `User-Agent` configuration per request.
- Custom authentication headers or cookies for paywalled or logged-in Web URLs (U5).
