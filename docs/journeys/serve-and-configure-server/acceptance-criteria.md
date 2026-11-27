# Serve & Configure Server: Acceptance Criteria

An **Operator** configures CLI flags and environment variables and serves Markdownify MCP over `stdio`, stateless
Streamable HTTP, or the slim Docker container, and an **MCP Client** discovers all 11 tools and invokes them under HTTP
`Host` and `Origin` guards ([plan](plan.md)).

Rules that hold whichever journey is involved, and the decisions (D#), questions (U#) and invariants (I#) cited here,
are in [`REQUIREMENTS.md`](../../../REQUIREMENTS.md). These criteria say what the **Operator** and **MCP Client** can
do and see; they cite rules rather than restate them. Each slice's [spec](specs/) names the criteria it covers.

Each criterion is one or more Gherkin scenarios tagged with its id (`@SC-1`) and the decisions, questions and
invariants it cites. Scenarios that share an id make up one criterion.

## Steps

1. **Parse Server Configuration.** The server parses CLI flags and `MCP_*` environment variables (CLI flags override env vars) and fails fast on invalid values or unknown CLI flags.
2. **Start transport & emit diagnostics.** The server selects `stdio` (default) or Streamable HTTP (`127.0.0.1:3000` default) and emits accurate startup notices/warnings for local file access policy and non-loopback binding.
3. **Guard HTTP requests & serve stateless MCP.** Streamable HTTP routes `POST /mcp` and `POST /` exclusively, validates `Host` and `Origin` headers (HTTP 403), rejects non-POST methods (HTTP 405), and serves stateless MCP `tools/list` (all 11 tools) and `tools/call`.
4. **Verify packaged container runtime.** The Operator verifies the slim Docker image (`Dockerfile`) over MCP stdio via `bun run harness docker`.

## 1. Parse Server Configuration

```gherkin
@SC-1 @D1 @D2 @D6 @D23
Scenario: Default configuration selects stdio on 127.0.0.1:3000 and CLI flags override environment variables
  Given no CLI flags or MCP_* environment variables are set
  When the server parses Server Configuration
  Then transport is "stdio", host is "127.0.0.1", port is 3000, and allowUnrestrictedPaths is false (D1, D2, D23)

@SC-1 @D2 @D6 @D23
Scenario: CLI flags take precedence over MCP_* environment variables
  Given MCP_TRANSPORT, MCP_HOST, MCP_PORT, MCP_ALLOWED_HOSTS, MCP_ALLOWED_ORIGINS, and CLI flags --transport=, --host=, --port=, --allow-unrestricted-paths
  When the server parses Server Configuration
  Then CLI flag values override env vars and comma-separated host/origin lists are trimmed (D2, D23)

@SC-2 @D2 @D32
Scenario: Invalid transport, port, empty host, or unknown CLI flags fail fast at startup
  Given an Operator passes an unknown transport, out-of-range or non-numeric port, empty host, unknown flag (such as "--transprot=http" or "--allow-unrestricted"), or unexpected positional argument
  When the server parses Server Configuration
  Then startup fails fast with a clear configuration error (D32)
```

## 2. Start transport & emit diagnostics

```gherkin
@SC-7 @D6 @D9 @D23 @D24 @D33
Scenario: HTTP startup diagnostics accurately reflect file-access policy and non-loopback binding
  Given HTTP transport configuration with MD_ALLOWED_PATHS unset, empty (D24), or opted out (D23), and loopback or non-loopback host binding
  When startup notices are computed
  Then notices report disabled local file tools (D9), unrestricted opt-in warning (D23), invalid MD_ALLOWED_PATHS warning (D24), and non-loopback reverse-proxy warning (D33)
```

## 3. Guard HTTP requests & serve stateless MCP

```gherkin
@SC-3 @D1 @D3 @D8
Scenario: MCP server exposes all 11 stable tools and returns structured errors on unknown tools or invalid arguments
  Given a connected MCP Client over stdio or Streamable HTTP
  When the client calls tools/list and invokes an unknown tool or invalid argument type
  Then tools/list returns all 11 stable tools (D3) and invalid calls return concise single-line isError: true responses (D8)

@SC-4 @D1 @D33
Scenario: Streamable HTTP routes POST /mcp and POST / exclusively
  Given a Streamable HTTP request targeting an unknown path or using a non-POST method (such as GET or DELETE)
  When the HTTP guard evaluates the request
  Then unknown paths return JSON-RPC HTTP 404 and non-POST methods return JSON-RPC HTTP 405 with Allow: POST (D33)

@SC-5 @D1 @D33 @I5
Scenario: Streamable HTTP enforces Host header DNS-rebinding protection
  Given a Streamable HTTP server bound to loopback (or configured with MCP_ALLOWED_HOSTS)
  When a request arrives with a missing, malformed, or disallowed Host header
  Then the server rejects the request with JSON-RPC HTTP 403 (D33, I5)

@SC-6 @D1 @D33 @I5
Scenario: Streamable HTTP enforces Origin header browser CSRF protection
  Given a Streamable HTTP server bound to loopback or non-loopback (optionally with MCP_ALLOWED_ORIGINS)
  When a request arrives without an Origin, with a loopback Origin, or with a disallowed cross-origin Origin
  Then omitted Origins are allowed, loopback Origins are allowed on loopback bind, and disallowed Origins are rejected with JSON-RPC HTTP 403 (D33, I5)

@SC-8 @D1 @D3 @D9 @D23 @I5
Scenario: Live Streamable HTTP server handles real HTTP requests on an ephemeral loopback port
  Given a live Streamable HTTP server listening on 127.0.0.1:0
  When an HTTP client sends POST /mcp and POST / tools/list, invalid Host/Origin requests, and local-file tool calls without MD_ALLOWED_PATHS
  Then tools/list succeeds with all 11 tools, bad Host/Origin returns HTTP 403, and local file tools fail closed with isError: true (D3, D9, I5)
```

## 4. Verify packaged container runtime

```gherkin
@SC-9 @D4 @D11 @D22 @D34 @I2
Scenario: Slim Docker image converts PDFs, enforces Allowed Paths, and surfaces D22 hint via harness docker
  Given Docker is available and the Operator runs "bun run harness docker" (or "bash scripts/docker-smoke-test.sh")
  When the harness builds Dockerfile and communicates with the container over MCP StdioClientTransport with src/sample-data mounted at /data and MD_ALLOWED_PATHS=/data
  Then pdf-to-markdown /data/test.pdf succeeds, pdf-to-markdown /etc/passwd is blocked by Allowed Paths, and a format requiring markitdown[all] fails with the D22 slim-Docker hint (D4, D11, D22, D34, I2)
```
