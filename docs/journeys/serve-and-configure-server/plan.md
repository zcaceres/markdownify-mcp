# Serve & Configure Server: Plan

How the journey is built, slice by slice. What it must do is in its [acceptance criteria](acceptance-criteria.md);
decisions (D#) and questions (U#) are in [`REQUIREMENTS.md`](../../../REQUIREMENTS.md).

## Sources

The designs and existing code behind this journey, from its design session (2026-11-26).

- [REQUIREMENTS.md](../../../REQUIREMENTS.md): system decisions D1–D34, invariants I1–I5.
- [src/index.ts](../../../src/index.ts), [src/http.ts](../../../src/http.ts), [src/server.ts](../../../src/server.ts), [src/http.test.ts](../../../src/http.test.ts), [src/server.test.ts](../../../src/server.test.ts): existing CLI parser, HTTP transport, Host/Origin guards, and MCP server setup.
- [Dockerfile](../../../Dockerfile) & [scripts/docker-smoke-test.sh](../../../scripts/docker-smoke-test.sh): slim Debian/Bun/uv `pdf` Docker image and smoke test.

## Shape

An **Operator** configures **Server Configuration** via CLI flags (`--transport=`, `--host=`, `--port=`,
`--allow-unrestricted-paths`) and `MCP_*` environment variables (CLI wins; unknown flags and invalid values fail fast,
**D2, D23, D32**). In `stdio` mode the server binds `StdioServerTransport`; in `http` mode it binds stateless
Streamable HTTP on `127.0.0.1:3000` (default), emits accurate startup notices (**D9, D23, D24, D33**), routes
`POST /mcp` and `POST /` exclusively (**D33**), enforces `Host` and `Origin` header validation (**I5, D33**), and
serves all 11 MCP tools statelessly (**D1, D3, D8, D9**). The Operator verifies the packaged slim Docker image via
`bun run harness docker` over MCP `StdioClientTransport` (**D4, D11, D22, D34**).

## Contexts, verbs and queries

Where this journey lives in the code. Each noun is a type in `src/server-config/nouns.ts`. Each verb is a function in
`verbs.ts`, and each derived noun a function in `queries.ts`.

| Context              | Nouns                                                                             | Verbs                                                                                                            | Queries          | Harness commands                                                                                       |
| -------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| `src/server-config/` | `ServerConfiguration`, `TransportMode`, `HttpRequestGuardResult`, `StartupNotice` | `parseServerConfiguration`, `isLoopbackHost`, `isHostHeaderAllowed`, `isOriginHeaderAllowed`, `checkHttpRequest` | `startupNotices` | `serve config [flags...]`, `serve check-http <method> <path> [host=<h>] [origin=<o>]`, `serve notices` |

## External systems

| System   | What we need from it                                                                   | World commands                                   |
| -------- | -------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `config` | Environment variables (`MCP_*`, `MD_ALLOWED_PATHS`)                                    | `config set <VAR> <value>`, `config clear <VAR>` |
| `docker` | Build `Dockerfile` and run the container over MCP `StdioClientTransport` (opt-in mode) | `bun run harness docker`                         |

## Slices

Each slice is one capability, wired through every part of the system (harness commands, verbs, ports, mocks) with a
scenario that runs it. Each has a [spec](specs/) and a scenario in `scenarios/serve-and-configure-server/`.

### Done

1. **01-config-and-http-guards.** Build `src/server-config/` (`parseServerConfiguration` with D32 unknown-flag rejection, `isLoopbackHost`, `isHostHeaderAllowed`, `isOriginHeaderAllowed`, `checkHttpRequest` D33/I5, `startupNotices` D9/D23/D24/D33), add `serve` harness command in `cli/commands/server-config.ts`, wire `src/http.ts` to delegate to `src/server-config/`, and add `scenarios/serve-and-configure-server/01-config-and-http-guards.txt`. Covers SC-1, SC-2, SC-4, SC-5, SC-6, SC-7.
   ([spec](specs/01-config-and-http-guards/spec.md), `scenarios/serve-and-configure-server/01-config-and-http-guards.txt`)
2. **02-live-server-transport.** Verify all 11 tools on `tools/list`, unknown-tool `isError: true`, and live Streamable HTTP server behavior (including HTTP `D9`/`D23` fail-closed local file blocking over real HTTP `POST /mcp`) in `src/server.test.ts` and `src/http.test.ts`. Covers SC-3, SC-8.
   ([spec](specs/02-live-server-transport/spec.md))
3. **03-docker-container-harness.** Implement `cli/docker.ts` and `bun run harness docker` (using MCP SDK `StdioClientTransport` against built `Dockerfile` to verify PDF conversion, `Allowed Paths` `/etc/passwd` refusal, and `D22` slim-Docker hint on `[all]`-only format), and replace `scripts/docker-smoke-test.sh` with a thin wrapper calling `bun run harness docker`. Covers SC-9.
   ([spec](specs/03-docker-container-harness/spec.md))

### Next

In the order we expect to build them; reorder freely. Each says where it came from: criteria, a finding (a
`/dd-verify` note) or a decision.

_(None — all planned slices for Serve & Configure Server are complete.)_

## Deferred

- Built-in HTTP authentication / bearer tokens (out of scope per D1; use an authenticating reverse proxy).
- Rate limiting and multi-tenant isolation (out of scope per D1).
- Stateful MCP sessions / SSE streams (stateless Streamable HTTP per D1).
- Unauthenticated `GET /health` endpoint (excluded per D33).
