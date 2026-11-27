# Slice 02: Live Server Transport

Covers [SC-3](../../acceptance-criteria.md#3-guard-http-requests--serve-stateless-mcp) and
[SC-8](../../acceptance-criteria.md#3-guard-http-requests--serve-stateless-mcp) from
[Serve & Configure Server](../../plan.md). Cites **D1, D3, D8, D9, D23, D33, I5** from
[`REQUIREMENTS.md`](../../../../REQUIREMENTS.md).

## Scope

Verify the real MCP transport boundaries end to end without mocks:

1. **In-memory MCP Client/Server (`src/server.test.ts` — SC-3, D3, D8):**
   - `tools/list` returns the exact 11 stable MCP tools (`D3`).
   - Invoking an unknown tool name returns concise single-line `isError: true` (`Error: Tool not found`, `D8`).
   - Invalid argument types and missing required arguments return concise single-line `isError: true` (`D8`).
2. **Live stateless Streamable HTTP server on `127.0.0.1:0` (`src/http.test.ts` — SC-3, SC-8, D1, D3, D9, D23, D33, I5):**
   - `POST /mcp` and `POST /` return HTTP 200 with all 11 stable tools on `tools/list` (`D3`, `D33`).
   - Unknown paths return HTTP 404 JSON-RPC; non-POST methods (`GET`, `DELETE`) return HTTP 405 JSON-RPC with `Allow: POST` (`D33`).
   - Invalid `Host` and cross-origin `Origin` headers return HTTP 403 JSON-RPC (`D33`, `I5`).
   - `POST /mcp` `tools/call` for local file tools (`pdf-to-markdown`, `get-markdown-file`) fails closed with `isError: true` when `MD_ALLOWED_PATHS` is unset (`D9`), while `{ allowUnrestrictedPaths: true }` permits passing the HTTP policy gate (`D23`).
   - `POST /mcp` `tools/call` for an unknown tool returns `isError: true` (`D8`).

## Files

- `src/server.test.ts` — `tools/list` 11-tool assertion and unknown-tool `isError: true` check.
- `src/http.test.ts` — Live ephemeral loopback HTTP server tests for all 11 tools, `Allow: POST`, `Host`/`Origin` 403, `D9` fail-closed local file blocking, and `D23` opt-out.

## Placeholders

None.
