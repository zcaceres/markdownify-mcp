# Discover & Align MCP: Acceptance Criteria

An **MCP Client** (Anthropic Claude, Google Gemini, OpenAI ChatGPT / Agents SDK, or any MCP 2025/2026 client) discovers
Markdownify MCP's server identity, instructions, cache hints, cross-provider tool metadata, and schemas, invokes tools
with strict per-tool argument validation and typed structured outputs, and an **Operator** optionally selects between
the default `classic` (11-tool) and `compact` (4-tool) **Toolset** ([plan](plan.md)).

Rules that hold whichever journey is involved, and the decisions (D#), questions (U#) and invariants (I#) cited here,
are in [`REQUIREMENTS.md`](../../../REQUIREMENTS.md). These criteria say what the **MCP Client** and **Operator** can
do and see; they cite rules rather than restate them. Each slice's [spec](specs/) names the criteria it covers.

Each criterion is one or more Gherkin scenarios tagged with its id (`@MC-1`) and the decisions, questions and
invariants it cites. Scenarios that share an id make up one criterion.

## Steps

1. **Discover server identity, instructions, and cache hints.** An MCP Client initializes or discovers the server and receives enriched `Implementation` metadata, concise server `instructions`, and `cacheHints` for static catalog responses.
2. **Inspect cross-provider tool metadata & schemas.** An MCP Client calls `tools/list` and receives complete explicit `ToolAnnotations`, top-level `Tool.title`, 2–4 sentence tool descriptions with concise single-sentence non-empty parameter descriptions, and Gemini-safe flat `inputSchema` definitions.
3. **Validate strict arguments & return typed structured outputs.** An MCP Client invokes tools with valid or malformed/unknown arguments and receives either full untruncated `Markdown Result` content paired with `structuredContent` matching `outputSchema`, or concise single-line `isError: true` errors without `structuredContent`.
4. **Select Toolset & verify across Form Factors.** An Operator selects `classic` (default) or `compact` via Server Configuration, `tools/call` strictly enforces the active Toolset, and the 6-Form-Factor E2E harness validates the cross-provider contracts end to end.

## 1. Discover server identity, instructions, and cache hints

```gherkin
@MC-1 @D48
Scenario: Server exposes enriched Implementation metadata and concise server instructions
  Given a connected MCP Client initializing or discovering Markdownify MCP
  When the client inspects server info and server instructions
  Then server info includes name, title, version, description, and websiteUrl, and server instructions provide concise cross-tool routing, local-path, HTTP-mode, and capability guidance (D48)

@MC-2 @D48
Scenario: Server advertises static public cacheHints for tools/list and server/discover
  Given a 2026-07-28 MCP Client connecting to Markdownify MCP
  When Server options are constructed
  Then cacheHints for tools/list and server/discover specify public caching with a 3,600,000 ms TTL (D48)
```

## 2. Inspect cross-provider tool metadata & schemas

```gherkin
@MC-3 @D3 @D47 @D48 @D55
Scenario: Every exposed tool declares top-level title, all four explicit ToolAnnotations booleans, and rich multi-sentence descriptions
  Given an MCP Client calls tools/list on Markdownify MCP
  When each returned Tool definition is audited into a Tool Contract Audit (D55)
  Then every tool declares top-level title matching annotations.title, explicit readOnlyHint (true), destructiveHint (false), idempotentHint (true), and openWorldHint (true for remote/network tools, false for local filesystem tools), plus 2-4 sentence tool descriptions explaining usage, sibling tools, and key limits and concise single-sentence non-empty parameter descriptions (D3, D47, D48, D55)

@MC-4 @D52
Scenario: Every tool name, parameter name, and wire inputSchema is compatible with Anthropic, Gemini, and OpenAI
  Given an MCP Client calls tools/list on Markdownify MCP
  When each tool name, parameter name, and inputSchema is audited
  Then tool names stay <= 63 characters matching [a-zA-Z_][a-zA-Z0-9_.:-]*, parameter names match [a-zA-Z_][a-zA-Z0-9_]*, and wire inputSchema objects are flat JSON Schema objects free of Gemini-incompatible keywords (additionalProperties, $schema, $ref, $defs) (D52)
```

## 3. Validate strict arguments & return typed structured outputs

```gherkin
@MC-5 @D8 @D52
Scenario: Per-tool strict runtime validation rejects unknown or cross-tool argument keys
  Given an MCP Client invokes a tool with an unexpected argument key (such as file_path instead of filepath, or url passed to pdf-to-markdown, or branch passed to webpage-to-markdown)
  When the server validates the tool call arguments at the boundary
  Then the server rejects the call with a concise single-line isError: true error naming the unrecognized key without invoking any converter (D8, D52)

@MC-6 @D8 @D49 @D50
Scenario: Successful calls return full untruncated Markdown in both content text and structuredContent matching outputSchema
  Given an MCP Client calls any conversion tool or get-markdown-file
  When the tool succeeds
  Then the tool advertises an outputSchema and returns untruncated Markdown in both backwards-compatible content text blocks and matching structuredContent ({ markdown } for conversions, { path, markdown } for get-markdown-file) (D49, D50)

@MC-6 @D8 @D49
Scenario: Error responses omit structuredContent and preserve the single-line D8 error format
  Given an MCP Client invokes a tool with invalid arguments, a policy violation, or a runtime failure
  When the tool returns isError: true
  Then structuredContent is omitted and content contains a single concise error line (D8, D49)
```

## 4. Select Toolset & verify across Form Factors

```gherkin
@MC-7 @D2 @D3 @D8 @D32 @D51 @D53
Scenario: Operator configures classic (default) or compact Toolset via CLI flag or MCP_TOOLSET
  Given Server Configuration parses --toolset=<classic|compact> and MCP_TOOLSET
  When no toolset is provided (or MCP_TOOLSET is blank), classic (11 tools) is selected; when compact is provided (case- and whitespace-normalized), only the 4 capability tools (convert-web-url, convert-local-file, convert-git-repo, get-markdown-file) are exposed; invalid or empty CLI toolset values fail fast at startup (D2, D3, D32, D51, D53)

@MC-7 @D8 @D9 @D47 @D49 @D51
Scenario: Compact Toolset strictly enforces exposed tool names, annotations, HTTP D9 gating, and structured outputs
  Given Markdownify MCP is running with Toolset compact
  When an MCP Client calls tools/list, invokes convert-web-url / convert-local-file / convert-git-repo / get-markdown-file, or attempts to invoke a classic-only tool name (such as pdf-to-markdown)
  Then tools/list exposes only the 4 compact tools with complete D47-D49 contracts, HTTP mode enforces D9 fail-closed gating on convert-local-file and get-markdown-file while keeping convert-web-url and convert-git-repo available, and unexposed classic names fail with "Error: Tool not found" (D8, D9, D47, D49, D51)

@MC-8 @D37 @D44 @D47 @D48 @D49 @D52
Scenario: All six Form Factors pass MCP contract checks in E2E verification
  Given an Operator runs bun run harness e2e across supported Form Factors
  When the E2E runner inspects tools/list and executes Verification Cases
  Then every Form Factor passes cross-provider contract checks (D47 annotations & titles, D48 descriptions, D49 outputSchema & structuredContent, D52 Gemini-safe schemas) alongside conversion and security checks (D37, D44, D47, D48, D49, D52)
```
