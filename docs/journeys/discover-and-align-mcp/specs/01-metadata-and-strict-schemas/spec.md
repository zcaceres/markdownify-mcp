# Slice 01: Metadata, Instructions, Cache Hints, and Strict Schemas

Tracer bullet for **Discover & Align MCP**. Establishes the `src/mcp-contract/` context, enriches server identity,
instructions, cache hints, complete `ToolAnnotations`, top-level `Tool.title`, 2–4 sentence tool descriptions with
concise single-sentence non-empty parameter descriptions, and Gemini-safe wire `inputSchema` with per-tool Zod `.strict()` runtime argument validation.

- **Journey:** [Discover & Align MCP](../../acceptance-criteria.md) ([plan](../../plan.md))
- **Criteria covered:** `MC-1`, `MC-2`, `MC-3`, `MC-4`, `MC-5`
- **Decisions & invariants cited:** `D3`, `D8`, `D47`, `D48`, `D52`
- **Done when:** `bun run lint`, `bun run build`, `bun test ./src/mcp-contract/mcp-contract.test.ts ./src/server.test.ts`, and `bun run harness run scenarios/discover-and-align-mcp/01-metadata-and-strict-schemas.txt` all pass.

## Scope

### In scope

- Pure `src/mcp-contract/` context (`nouns.ts`, `queries.ts`, `verbs.ts`) for server metadata/instructions/cacheHints, cross-provider Toolset auditing, and per-tool strict runtime argument validation.
- Enriching all 11 tools in `src/tools.ts` with:
  - top-level `title` matching `annotations.title` (`D47`),
  - all four explicit `ToolAnnotations` booleans (`readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, and `openWorldHint: true` for web/YouTube/Bing/git tools or `openWorldHint: false` for local file tools + `get-markdown-file`) (`D47`),
  - concise 2–4 sentence tool descriptions and informative parameter descriptions explaining what each tool does, when to use it vs. sibling tools, and key limits (JS-rendered SPAs, slim Docker `pdf` profile, image metadata-only limit, absolute/`~/` paths) (`D48`),
  - flat Gemini-safe `inputSchema` free of `additionalProperties`, `$schema`, `$ref`, and `$defs` (`D52`).
- Enriching `createServer` in `src/server.ts` with:
  - `Implementation` metadata (`name`, `title`, `version`, `description`, `websiteUrl`) (`D48`),
  - concise server-level `instructions` (`D48`),
  - `cacheHints: { "tools/list": { ttlMs: 3_600_000, cacheScope: "public" }, "server/discover": { ttlMs: 3_600_000, cacheScope: "public" } }` (`D48`),
  - per-tool Zod `.strict()` argument validation via `validateToolArguments` so unknown or cross-tool keys (e.g. `file_path`, `url` on `pdf-to-markdown`, `branch` on `webpage-to-markdown`) fail with a concise single-line `isError: true` error (`D8`, `D52`).
- Harness command group `mcp` (`cli/commands/mcp-contract.ts`) exposing `mcp info`, `mcp audit`, and `mcp validate-args <tool> <json>`.
- Deterministic mock scenario `scenarios/discover-and-align-mcp/01-metadata-and-strict-schemas.txt`.

### Out of scope

- `outputSchema` and `structuredContent` payloads — deferred to Slice 02 (`02-structured-outputs`, `MC-6`, `D49`).
- `--toolset=compact` / `MCP_TOOLSET` and the 4 compact tools — deferred to Slice 03 (`03-compact-toolset`, `MC-7`, `D51`).
- 6-Form-Factor E2E contract assertions — deferred to Slice 03 (`03-compact-toolset`, `MC-8`).

## Vocabulary

Uses Terminology from `REQUIREMENTS.md`: **MCP Client**, **Operator**, **Toolset**, **Tool Contract Audit** _(derived)_, **Markdown Result**, **Allowed Paths**, **File Access Policy**, **Local File**, **Web URL**, **Git Repository**, **Markdown File**, **audit**.

## Reads and writes

- **Reads:** Tool definitions from `src/tools.ts`, tool name and raw argument object on `tools/call`.
- **Writes:** None (pure validation, metadata queries, and MCP protocol responses).

## Verbs

| Function                                   | Rule                                                                                                                                                                                    | Exact error message                                                                                                                                                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validateToolArguments(toolName, rawArgs)` | Looks up the tool's strict Zod schema (`z.strictObject(...)`) for `toolName`. Rejects unknown tool names, non-object arguments, wrong field types, and unrecognized keys (`D8`, `D52`). | Unknown tool: `Tool not found`<br>Non-object args: `Invalid arguments: expected an object`<br>Unknown key: `Invalid arguments: Unrecognized key: "<key>"` (or `Unrecognized keys: ...`)<br>Wrong type: `Invalid arguments: <field>: <zod message>` |

Per-tool strict argument schemas (all fields optional at schema parse so domain validators still emit exact `D8`/`D18` missing-field messages like `"URL is required for this tool"` and `"File path is required for this tool"`):

- `youtube-to-markdown`, `bing-search-to-markdown`, `webpage-to-markdown`: `z.strictObject({ url: z.string().optional() })`
- `pdf-to-markdown`, `image-to-markdown`, `audio-to-markdown`, `docx-to-markdown`, `xlsx-to-markdown`, `pptx-to-markdown`, `get-markdown-file`: `z.strictObject({ filepath: z.string().optional() })`
- `git-repo-to-markdown`: `z.strictObject({ url: z.string().optional(), branch: z.string().optional(), compress: z.boolean().optional() })`

## Queries

| Function                                            | Definition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serverMetadata()`                                  | Returns `{ name: "mcp-markdownify-server", title: "Markdownify MCP", version: "2.0.0", description: "...", websiteUrl: "https://github.com/zcaceres/markdownify-mcp" }` (`D48`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `serverInstructions()`                              | Returns concise multi-line guidance covering tool selection (webpages vs. YouTube/Bing vs. Git repos vs. local files vs. existing Markdown), absolute/`~/` local paths, HTTP fail-closed `MD_ALLOWED_PATHS` policy, and converter limits (SPAs, image metadata-only, slim Docker `pdf` profile) (`D48`).                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `serverCacheHints()`                                | Returns `{ "tools/list": { ttlMs: 3_600_000, cacheScope: "public" }, "server/discover": { ttlMs: 3_600_000, cacheScope: "public" } }` (`D48`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `toolContractAudit(tools, expectedOpenWorldByName)` | Checks every `Tool` against `D47`, `D48`, and `D52`: top-level `title` non-empty and equal to `annotations.title`; all four `ToolAnnotations` booleans present and accurate (`readOnlyHint === true`, `destructiveHint === false`, `idempotentHint === true`, `openWorldHint === expected`); tool description has ≥ 2 sentences; every `inputSchema.properties` entry has non-empty `type` and `description`; tool name ≤ 63 chars matching `/^[a-zA-Z_][a-zA-Z0-9_.:-]*$/`; parameter names ≤ 64 chars matching `/^[a-zA-Z_][a-zA-Z0-9_]*$/`; recursive scan finds zero forbidden Gemini keys (`additionalProperties`, `$schema`, `$ref`, `$defs`). Returns `{ ok: boolean, toolCount: number, issues: ToolContractIssue[] }`. |

## Harness commands

### Domain commands (`cli/commands/mcp-contract.ts`)

- `mcp info` — prints `serverMetadata()`, `serverCacheHints()`, and a summary of `serverInstructions()` (`MC-1`, `MC-2`).
- `mcp audit` — runs `toolContractAudit` on the exported `classic` Toolset and prints `ok: audited <n> tools (0 issues)` or `error: ...` listing each issue (`MC-3`, `MC-4`).
- `mcp validate-args <tool> <json>` — parses `<json>` and runs `validateToolArguments(tool, parsed)`, printing `ok: <tool> <canonical-json>` or `error: <message>` (`MC-5`).

### World commands

None needed for this slice.

## Placeholders

None — all rules (`D47`, `D48`, `D52`) are settled.

## Tests

1. **Domain unit tests (`src/mcp-contract/mcp-contract.test.ts`):**
   - `serverMetadata`, `serverInstructions`, and `serverCacheHints` match `D48`.
   - `toolContractAudit` passes on all 11 tools from `src/tools.ts`, and catches missing `destructiveHint`, missing `openWorldHint`, mismatched `title`, single-sentence descriptions, invalid Gemini parameter names, and forbidden `additionalProperties`/`$schema`/`$ref`/`$defs` keywords.
   - `validateToolArguments` accepts valid arguments per tool and rejects unknown keys (`file_path`), cross-tool keys (`url` on `pdf-to-markdown`, `branch` on `webpage-to-markdown`), wrong types (`compress: "yes"`), non-object payloads, and unknown tool names with exact single-line `D8` errors.
2. **MCP boundary tests (`src/server.test.ts`):**
   - `client.getServerVersion()` includes `title`, `description`, and `websiteUrl`, and `client.getInstructions()` is populated (`MC-1`).
   - `client.listTools()` passes `toolContractAudit` across all 11 tools (`MC-3`, `MC-4`).
   - `client.callTool` with `{ file_path: "/tmp/a.pdf" }` on `pdf-to-markdown` or `{ branch: "main", url: "https://example.com" }` on `webpage-to-markdown` returns concise single-line `isError: true` (`MC-5`).
3. **Scenario test:** `scenarios/discover-and-align-mcp/01-metadata-and-strict-schemas.txt` passes under `bun run harness run scenarios` and `bun test ./cli/scenarios.test.ts`.
