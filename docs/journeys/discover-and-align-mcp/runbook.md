# Runbook: Discover & Align MCP

How a person, or an agent, checks Markdownify MCP's cross-provider discovery metadata, schemas, structured outputs, and
Toolset selection. Deterministic contract rules live in mock scenarios; live multi-runtime checks run through
`bun test` and `bun run harness e2e`. The [acceptance criteria](acceptance-criteria.md) each step shows are in brackets.

## Before you start

```bash
bun install --frozen-lockfile
bun run build
bun run harness     # interactive (mock)
```

## Scenarios

| Scenario                                                              | Shows                                                                                                                                                          |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scenarios/discover-and-align-mcp/01-metadata-and-strict-schemas.txt` | Server identity/instructions/cacheHints, cross-provider `ToolAnnotations` + Gemini-safe schema audit, and per-tool strict arg validation [MC-1..MC-5]          |
| `scenarios/discover-and-align-mcp/02-structured-outputs.txt`          | `outputSchema` audit, backwards-compatible `content` + typed `structuredContent` formatting (`{ markdown }` / `{ path, markdown }`), untruncated output [MC-6] |
| `scenarios/discover-and-align-mcp/03-compact-toolset.txt`             | `--toolset=` / `MCP_TOOLSET` Server Configuration, 4-tool `compact` catalog audit, and strict active-Toolset enforcement [MC-7]                                |

```bash
bun run harness run scenarios/discover-and-align-mcp
```

## Live protocol & host checks (by hand / opt-in)

1. **In-memory & HTTP MCP protocol verification [MC-1..MC-7]:**

   ```bash
   bun test ./src/server.test.ts ./src/http.test.ts
   ```

   Verify `initialize` returns `serverInfo` (`title`, `description`, `websiteUrl`) and `instructions`, `tools/list` returns complete annotations/titles/descriptions/`outputSchema`, and `tools/call` returns `structuredContent` on success and omits it on `isError: true`.

2. **6-Form-Factor E2E contract check [MC-8]:**

   ```bash
   bun run harness e2e --all --category=static-web,hosted-binary,local-binary
   bun run harness e2e --all --toolset=compact --category=static-web,hosted-binary,local-binary
   ```

   Confirm all 6 Form Factors pass the cross-provider contract checks in both `classic` (11 tools) and `compact` (4 tools) Toolsets alongside conversion and HTTP guard checks.

3. **Optional real host spot-checks (manual):**
   - **Claude Desktop / Claude Code:** register stdio server (default `classic` and `--toolset=compact`), inspect tool titles, descriptions, and read-only approval behavior.
   - **Gemini CLI:** connect via stdio or HTTP and verify `tools/list` registers cleanly with zero `additionalProperties` schema warnings.
   - **OpenAI MCP Inspector / Responses API:** verify every tool passes the mandatory `readOnlyHint` + `destructiveHint` + `openWorldHint` check and `outputSchema` validation.
