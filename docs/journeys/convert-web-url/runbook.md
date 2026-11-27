# Runbook: Convert Web URL

How a person, or an agent, walks the journey by hand: what needs eyes, a real network, or a real `markitdown` binary.
Everything that can be scripted is a scenario, listed below; the [acceptance criteria](acceptance-criteria.md) each step
shows are in brackets.

## Before you start

```bash
bun install --frozen-lockfile
bun run build
bun run harness     # interactive; type help
```

Every external system is mocked in memory in the harness and starts from its fixtures; `reset` starts again.

## Scenarios

| Scenario                                                            | Shows                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scenarios/convert-web-url/01-basic-webpage.txt`                    | Tracer bullet: request validation, HTTP 200 fetch, non-2xx rejection, Temporary File staging & cleanup, `markitdown` conversion, empty output, converter/network failure, and path-less Markdown Result [WU-1, WU-3, WU-4, WU-7, WU-10, WU-11, WU-14] |
| `scenarios/convert-web-url/02-ssrf-and-redirects.txt`               | SSRF scheme/host/IP/DNS validation and manual redirect traversal with per-hop SSRF validation and redirect cap [WU-2, WU-5]                                                                                                                           |
| `scenarios/convert-web-url/03-format-inference-and-passthrough.txt` | `Content-Type`/pathname/`.html` extension inference, canonical YouTube/Bing direct pass-through without staging, and unconverted raw HTML rejection with cleanup [WU-8, WU-9, WU-12]                                                                  |
| `scenarios/convert-web-url/04-timeouts-and-size-limits.txt`         | Default fetch timeout, streaming download cap, `markitdown` timeout with cleanup, and `MD_*` env var overrides (`D7`, `D13`) [WU-6, WU-13]                                                                                                            |

```bash
bun run harness run scenarios/convert-web-url
bun run harness live scenarios/live/convert-web-url.live.txt
bun run harness exec --live "convert webpage-to-markdown https://example.com"
```

## By hand

### 1. Live MCP stdio smoke check against real websites

1. Start the built server (`bun start`) or connect from an MCP client (e.g. Claude Desktop).
2. Call `webpage-to-markdown` with a live public webpage (e.g. `https://example.com`).
   - Expect Markdown text containing the page heading, no `Output file:` line, and `isError: false`. [WU-3, WU-10, WU-14]
3. Call `youtube-to-markdown` with a public YouTube watch or `youtu.be` URL that has a transcript.
   - Expect Markdown including the video title and transcript via `markitdown`'s YouTube converter. [WU-9, WU-14]
4. Call `webpage-to-markdown` with a URL that returns `404` or a JS-only SPA returning raw HTML.
   - Expect `isError: true` with a clear status or unconverted-HTML message, and no leftover `markdownify-*` directory in `os.tmpdir()`. [WU-4, WU-12]
