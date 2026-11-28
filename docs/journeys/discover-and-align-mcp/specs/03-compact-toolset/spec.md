# Slice 03: Compact Toolset & 6-Form-Factor E2E Contract Verification

Adds Operator-selectable **Toolset** (`compact` 4-tool default or opt-in `classic` 11-tool mode via
`--toolset=<compact|classic>` / `MCP_TOOLSET`), strict Toolset enforcement in `tools/call`, tailored compact server
`instructions`, updated `README.md` docs, and live cross-provider MCP contract checks (`D47`–`D52`) in the
6-Form-Factor E2E harness.

- **Journey:** [Discover & Align MCP](../../acceptance-criteria.md) ([plan](../../plan.md))
- **Criteria covered:** `MC-7`, `MC-8`
- **Decisions & invariants cited:** `D2`, `D3`, `D8`, `D9`, `D32`, `D37`, `D44`, `D47`, `D48`, `D49`, `D51`, `D52`, `D53`
- **Done when:** `bun run lint`, `bun run build`, `bun test`, `bun run harness run scenarios/discover-and-align-mcp/03-compact-toolset.txt`, and `bun run harness e2e --all --category=static-web,hosted-binary,local-binary` all pass.

## Scope

### In scope

- Adding `toolset: Toolset` (`"compact" | "classic"`, default `"compact"`) to `ServerConfiguration` (`src/server-config/nouns.ts`, `src/server-config/verbs.ts`), parsing `--toolset=<compact|classic>` and `MCP_TOOLSET` (CLI overrides env var; invalid values fail fast per `D32`, `D51`).
- Defining the 4 capability tools in `src/tools.ts` (`COMPACT_TOOLS`, `toolsForToolset`):
  - `convert-web-url` (`url`, `openWorldHint: true`, `CONVERSION_OUTPUT_SCHEMA`)
  - `convert-local-file` (`filepath`, `openWorldHint: false`, `CONVERSION_OUTPUT_SCHEMA`)
  - `convert-git-repo` (`url`, `branch?`, `compress?`, `openWorldHint: true`, `CONVERSION_OUTPUT_SCHEMA`)
  - `get-markdown-file` (`filepath`, `openWorldHint: false`, `MARKDOWN_FILE_OUTPUT_SCHEMA`)
- Extending `serverInstructions(toolset)`, `toolContractAudit`, and `validateToolArguments(toolName, rawArgs, toolset)` in `src/mcp-contract/` so `compact` mode enforces exact `D47`–`D52` contracts and rejects unexposed `classic` tool names with `"Tool not found"` (`D51`).
- Wiring `toolset` through `src/server.ts`, `src/index.ts`, and `src/http.ts` (including HTTP `D9` fail-closed gating on `convert-local-file` and `get-markdown-file` while keeping `convert-web-url` and `convert-git-repo` active).
- Updating `cli/commands/mcp-contract.ts`, `cli/commands/server-config.ts`, `scenarios/serve-and-configure-server/01-config-and-http-guards.txt`, and `README.md`.
- Adding live MCP contract checks (`mcp-contract-audit` + `structuredContent` check on every Verification Case) to `cli/e2e/runner.ts` across all 6 Form Factors (`MC-8`).

### Out of scope

- Removing the opt-in `classic` 11-tool surface (`D3`, `D51`).

## Vocabulary

Uses Terminology from `REQUIREMENTS.md`: **Operator**, **MCP Client**, **Server Configuration**, **Toolset**, **File Access Policy**, **Form Factor**, **Verification Case**.

## Verbs

| Function                                            | Rule                                                                                                                                                                                                   | Exact error message                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `parseServerConfiguration(argv, env)`               | Parses `--toolset=<compact\|classic>` and `MCP_TOOLSET` (CLI overrides env var, default `compact`). Rejects unknown values (`D32`, `D51`).                                                             | `Unknown toolset "<value>". Supported values: classic, compact` |
| `validateToolArguments(toolName, rawArgs, toolset)` | Looks up `toolName` only within the active `toolset`'s strict Zod schema map (`classic` or `compact`). Rejects unexposed tool names (`D51`), non-objects, unknown keys, and wrong types (`D8`, `D52`). | `Tool not found` for tools outside the active `Toolset`         |

## Queries

- `toolsForToolset(toolset)` — returns `CLASSIC_TOOLS` (11 tools) or `COMPACT_TOOLS` (4 tools).
- `serverInstructions(toolset)` — returns toolset-specific routing instructions referencing only the active Toolset's tools.
- `expectedOpenWorldByToolset(toolset)` — returns expected `openWorldHint` map for `classic` or `compact`.

## Harness commands

- `serve config [flags...]` — includes `toolset: <classic|compact>`.
- `mcp info [classic|compact]` — inspects metadata, cache hints, and instructions for the given Toolset.
- `mcp audit [classic|compact]` — audits either the 11-tool `classic` or 4-tool `compact` Toolset.
- `mcp validate-args <tool> <json> [toolset=<classic|compact>]` — validates strict args against the chosen Toolset.

## Placeholders

None — all decisions (`D32`, `D47`–`D52`) are settled.

## Tests

1. **Unit tests (`src/server-config/server-config.test.ts`, `src/mcp-contract/mcp-contract.test.ts`):**
   - `--toolset=compact`, `MCP_TOOLSET=compact`, CLI precedence over env var, and invalid toolset failure (`D32`, `D51`).
   - `COMPACT_TOOLS` passes `toolContractAudit` with 0 issues (`D47`–`D49`, `D52`).
   - `validateToolArguments` strictly enforces active Toolset membership (`pdf-to-markdown` rejected in `compact`; `convert-local-file` rejected in `classic`).
2. **MCP boundary & live HTTP tests (`src/server.test.ts`, `src/http.test.ts`):**
   - `createServer({ toolset: "compact" })` exposes exactly the 4 compact tools, returns tailored compact `instructions`, enforces `D9` fail-closed HTTP local-file gating on `convert-local-file` & `get-markdown-file` while keeping `convert-git-repo` enabled, returns `structuredContent` on `get-markdown-file`, and returns `"Error: Tool not found"` for `pdf-to-markdown`.
   - Live HTTP server with `toolset: "compact"` exposes the 4 compact tools on `POST /mcp` and passes `toolContractAudit`.
3. **Scenario tests:** `scenarios/discover-and-align-mcp/03-compact-toolset.txt` and updated `scenarios/serve-and-configure-server/01-config-and-http-guards.txt`.
4. **Live 6-Form-Factor E2E (`bun run harness e2e --all`):** Every Form Factor passes `tools-list-11`, `mcp-contract-audit` (`D47`–`D49`, `D52`), and `structuredContent` verification on every executed case (`MC-8`).
