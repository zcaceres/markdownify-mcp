# Slice 02: Structured Outputs (`outputSchema` & `structuredContent`)

Adds JSON Schema `outputSchema` declarations to every MCP tool and returns typed `structuredContent` alongside
backwards-compatible `content` text blocks on successful `tools/call` responses while omitting `structuredContent` on
`isError: true` errors and preserving full untruncated Markdown.

- **Journey:** [Discover & Align MCP](../../acceptance-criteria.md) ([plan](../../plan.md))
- **Criteria covered:** `MC-6`
- **Decisions & invariants cited:** `D8`, `D49`, `D50`
- **Done when:** `bun run lint`, `bun run build`, `bun test ./src/mcp-contract/mcp-contract.test.ts ./src/server.test.ts`, and `bun run harness run scenarios/discover-and-align-mcp/02-structured-outputs.txt` all pass.

## Scope

### In scope

- Declaring Gemini-safe JSON Schema `outputSchema` on every tool in `src/tools.ts`:
  - Conversion tools: `{ type: "object", properties: { markdown: { type: "string", description: "..." } }, required: ["markdown"] }` (`D49`).
  - `get-markdown-file`: `{ type: "object", properties: { path: { type: "string", description: "..." }, markdown: { type: "string", description: "..." } }, required: ["path", "markdown"] }` (`D49`).
- Adding `formatStructuredToolResult(result)` in `src/mcp-contract/verbs.ts` returning backwards-compatible `content` text blocks plus matching `structuredContent` without truncating Markdown (`D49`, `D50`).
- Wiring `src/server.ts` to use `formatStructuredToolResult` on success and keep `structuredContent` omitted on `isError: true` (`D8`, `D49`).
- Extending `auditToolCatalog` in `src/mcp-contract/queries.ts` to verify every tool declares a valid, Gemini-safe `outputSchema` (`D49`, `D52`).
- Adding `mcp format-result <text> [path=<p>]` in `cli/commands/mcp-contract.ts` and scenario `scenarios/discover-and-align-mcp/02-structured-outputs.txt`.

### Out of scope

- `--toolset=compact` / `MCP_TOOLSET` and the 4 compact tools — deferred to Slice 03 (`03-compact-toolset`, `MC-7`, `D51`).
- 6-Form-Factor E2E contract assertions — deferred to Slice 03 (`03-compact-toolset`, `MC-8`).

## Vocabulary

Uses Terminology from `REQUIREMENTS.md`: **MCP Client**, **Markdown Result**, **Markdown File**.

## Verbs

| Function                             | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                      | Exact error message           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `formatStructuredToolResult(result)` | Formats a `MarkdownResult` (`{ text, path? }`) into `{ content, structuredContent, isError: false }` without truncating `text` (`D49`, `D50`). When `path` is present (`get-markdown-file`), emits `content: [{ type: "text", text: "Output file: <path>" }, { type: "text", text }]` and `structuredContent: { path, markdown: text }`. Otherwise emits `content: [{ type: "text", text }]` and `structuredContent: { markdown: text }`. | _(infallible pure formatter)_ |

## Queries

- `auditToolCatalog` _(extended)_: also verifies every tool has an `outputSchema` with `type: "object"`, string `properties.markdown`, `required` including `"markdown"` (and `"path"` for `get-markdown-file`), and no Gemini-incompatible schema keywords (`additionalProperties`, `$schema`, `$ref`, `$defs`).

## Harness commands

- `mcp format-result <text> [path=<p>]` — formats a `MarkdownResult` via `formatStructuredToolResult` and prints `content-blocks`, `structured`, and `isError` (`MC-6`).
- `mcp audit` — now verifies `outputSchema` on every tool in addition to `D47`, `D48`, `D52`.

## Placeholders

None — `D49` and `D50` are settled.

## Tests

1. **Domain unit tests (`src/mcp-contract/mcp-contract.test.ts`):**
   - `formatStructuredToolResult` formats conversion results (`{ markdown }`), `get-markdown-file` results (`{ path, markdown }`), and preserves > 100k char Markdown without truncation (`D50`).
   - `auditToolCatalog` rejects tools with missing or malformed `outputSchema`.
2. **MCP boundary tests (`src/server.test.ts`, `src/http.test.ts`):**
   - `get-markdown-file` over `InMemoryTransport` against `src/sample-data/test.md` returns both `content` text blocks and `structuredContent: { path, markdown }` (`D49`, `D50`).
   - Error responses (`isError: true`) omit `structuredContent` over both `InMemoryTransport` and live HTTP (`D8`, `D49`).
3. **Scenario test:** `scenarios/discover-and-align-mcp/02-structured-outputs.txt`.
