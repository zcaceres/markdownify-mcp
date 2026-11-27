# Discover & Align MCP: Plan

How the journey is built, slice by slice. What it must do is in its [acceptance criteria](acceptance-criteria.md);
decisions (D#) and questions (U#) are in [`REQUIREMENTS.md`](../../../REQUIREMENTS.md).

## Sources

The external standards and existing code behind this journey, from its design session (2026-11-27).

- [REQUIREMENTS.md](../../../REQUIREMENTS.md): system decisions D1–D52, invariants I1–I5.
- External MCP best-practice docs (read 2026-11-27): MCP 2025/2026 specification (`modelcontextprotocol.io`), Anthropic _Writing Effective Tools for Agents_ & MCP server best practices, Google Gemini API / Gemini CLI MCP schema compatibility docs (`function_declarations` & `additionalProperties` sanitization), and OpenAI ChatGPT Apps / Responses API / Agents SDK MCP guidelines.
- [src/tools.ts](../../../src/tools.ts), [src/server.ts](../../../src/server.ts), [src/http.ts](../../../src/http.ts), [src/index.ts](../../../src/index.ts), [src/server-config/](../../../src/server-config/), [cli/e2e/runner.ts](../../../cli/e2e/runner.ts): current MCP server, tool definitions, configuration parser, and 6-Form-Factor E2E runner.

## Shape

An **MCP Client** initializes or discovers Markdownify MCP and receives enriched `Implementation` metadata (`title`,
`description`, `websiteUrl`), concise server-level `instructions`, and static `public` `cacheHints` on `tools/list` and
`server/discover` (**D48**). Calling `tools/list` returns the active **Toolset** (`classic` 11-tool default per **D3**,
or opt-in `compact` 4-tool mode via `--toolset=compact` / `MCP_TOOLSET=compact` per **D51**), where every tool declares
top-level `title`, all four explicit `ToolAnnotations` booleans (`readOnlyHint`, `destructiveHint`, `idempotentHint`,
`openWorldHint`, **D47**), 2–4 sentence descriptions (**D48**), a flat Gemini-safe `inputSchema` free of
`additionalProperties`/`$schema`/`$ref`/`$defs` (**D52**), and a JSON Schema `outputSchema` (**D49**). Calling
`tools/call` validates arguments strictly per tool via Zod `.strict()` (**D8, D52**), enforces the active Toolset
strictly (**D51**), and returns full untruncated `Markdown Result` content alongside matching `structuredContent` on
success (**D49, D50**) while omitting `structuredContent` on `isError: true`.

## Contexts, verbs and queries

Where this journey lives in the code. Pure contract inspection, schema auditing, and strict per-tool argument
validation live in `src/mcp-contract/`; Toolset flag/env parsing extends `src/server-config/`.

| Context              | Nouns                                                                               | Verbs                                                          | Queries                                                                        | Harness commands                                           |
| -------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `src/mcp-contract/`  | `Toolset`, `ServerMetadata`, `ToolContractIssue`, `ToolContractAudit`, `StrictArgs` | `validateToolArguments`, `formatStructuredToolResult`          | `serverMetadata`, `serverInstructions`, `serverCacheHints`, `auditToolCatalog` | `mcp info`, `mcp audit`, `mcp validate-args <tool> <json>` |
| `src/server-config/` | `ServerConfiguration` (adds `toolset: Toolset`)                                     | `parseServerConfiguration` (adds `--toolset=` / `MCP_TOOLSET`) | `startupDiagnostics`                                                           | `serve config [flags...]`                                  |

## External systems

No new external systems. All contract auditing, metadata inspection, and strict argument validation are pure domain
logic verified deterministically in the mock harness and exercised live over `InMemoryTransport`, `StdioClientTransport`,
and `StreamableHTTPClientTransport` across all 6 Form Factors (`D37`).

| System           | What we need from it                                              | World commands                              |
| ---------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| `config`         | `MCP_TOOLSET` environment variable (in Slice 03)                  | `config set MCP_TOOLSET <classic\|compact>` |
| `e2e` / `docker` | Real MCP Client verification across all 6 Form Factors (Slice 03) | `bun run harness e2e --all`                 |

## Slices

Each slice is one capability, wired through every part of the system with a scenario that runs it. Each has a
[spec](specs/) and a scenario in `scenarios/discover-and-align-mcp/`.

### Done

1. **01-metadata-and-strict-schemas** _(tracer bullet)_ — Built `src/mcp-contract/` (`serverMetadata`, `serverInstructions`, `serverCacheHints`, `auditToolCatalog`, per-tool Zod `.strict()` `validateToolArguments`), enriched [src/tools.ts](../../../src/tools.ts) (top-level `title`, all 4 explicit `ToolAnnotations` booleans, 2–4 sentence tool/param descriptions, Gemini-safe flat `inputSchema`) and [src/server.ts](../../../src/server.ts) (`Implementation` metadata, `instructions`, `cacheHints`, per-tool strict validation), wired `cli/commands/mcp-contract.ts`, and verified with unit/boundary tests and `scenarios/discover-and-align-mcp/01-metadata-and-strict-schemas.txt`. Covers **MC-1, MC-2, MC-3, MC-4, MC-5** (D47, D48, D52).
   ([spec](specs/01-metadata-and-strict-schemas/spec.md), `scenarios/discover-and-align-mcp/01-metadata-and-strict-schemas.txt`)
2. **02-structured-outputs** — Added Gemini-safe JSON Schema `outputSchema` to every tool (`{ markdown }` for conversions, `{ path, markdown }` for `get-markdown-file`), wired `formatStructuredToolResult` in `src/server.ts` to return matching `structuredContent` alongside backwards-compatible `content` text blocks without truncation (D50) while omitting `structuredContent` on `isError: true`, extended `auditToolCatalog`, and verified with unit/boundary tests and `scenarios/discover-and-align-mcp/02-structured-outputs.txt`. Covers **MC-6** (D49, D50).
   ([spec](specs/02-structured-outputs/spec.md), `scenarios/discover-and-align-mcp/02-structured-outputs.txt`)

### Next

In the order we expect to build them; reorder freely.

1. **03-compact-toolset** — Add `Toolset` (`classic` | `compact`) to `ServerConfiguration` (`--toolset=<classic|compact>`, `MCP_TOOLSET`, D32 fail-fast on invalid values), implement the 4 capability tools (`convert-web-url`, `convert-local-file`, `convert-git-repo`, `get-markdown-file`) with tailored `instructions` and strict Toolset enforcement in `tools/call` (D51), update [README.md](../../../README.md), and add cross-provider contract checks (`D47`–`D52`) to the 6-Form-Factor E2E runner (`cli/e2e/runner.ts`). Covers **MC-7, MC-8** (D32, D51, D47–D52).

## Deferred

- Server-side character truncation or pagination parameters (`D50` keeps full untruncated Markdown output).
- Single unified `convert-to-markdown` tool (`D51` uses 4 capability-aligned tools for `compact` mode so `openWorldHint`, HTTP `D9` gating, and `outputSchema` stay exact).
- Built-in HTTP OAuth / bearer authentication (`D1`).
- MCP `icons` assets (optional visual polish; no binary icon assets in repo yet).
