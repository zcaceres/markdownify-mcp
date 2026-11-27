# Slice 01: Server Configuration and HTTP Request Guards

Part of the [Serve & Configure Server plan](../../plan.md). Decisions referenced as D# / U# / I# are in
[`REQUIREMENTS.md`](../../../../../REQUIREMENTS.md).

Covers [acceptance criteria](../../acceptance-criteria.md) SC-1, SC-2, SC-4, SC-5, SC-6, and SC-7.

## Goal

Model **Server Configuration**, HTTP request guards (`Host`, `Origin`, path routing, `POST`-only), and HTTP startup
diagnostics as pure domain functions in `src/server-config/`, wire them into `src/http.ts` and the DD harness (`serve`),
and enforce **D32** (fail fast on unknown CLI flags):

1. Parse CLI flags (`--transport=`, `--host=`, `--port=`, `--allow-unrestricted-paths`) and `MCP_*` env vars (CLI wins)
   via `parseServerConfiguration`, failing fast on unknown flags, unexpected positional arguments, unknown transport,
   invalid port, or empty host (**D1, D2, D23, D32**).
2. Evaluate incoming HTTP requests via `checkHttpRequest` (routing `/` and `/mcp` → 404 otherwise, `Host` header check
   → 403, `Origin` header check → 403, `POST`-only → 405 with `Allow: POST`, **D33, I5**).
3. Derive HTTP startup notices via `startupNotices(config, env, expandHome)` (**D9, D23, D24, D33**).

**Done when:** the tests below pass, `bun run lint` and `bun run build` pass, and
`scenarios/serve-and-configure-server/01-config-and-http-guards.txt` replays cleanly
(`bun run harness run scenarios/serve-and-configure-server/01-config-and-http-guards.txt`).

## Scope

**In:** `src/server-config/` (`nouns.ts`, `queries.ts`, `verbs.ts`, `server-config.test.ts`), `cli/commands/server-config.ts`
(`serve`), `cli/commands/index.ts`, wiring `src/http.ts` to delegate to `src/server-config/`, and
`scenarios/serve-and-configure-server/01-config-and-http-guards.txt`.

**Out:**

- Live MCP 11-tool `tools/list` & live HTTP port binding tests — waits for Slice 02 (`02-live-server-transport`, SC-3, SC-8).
- `bun run harness docker` & `scripts/docker-smoke-test.sh` wrapper — waits for Slice 03 (`03-docker-container-harness`, SC-9).

## Vocabulary

- **Operator**, **Server Configuration**, **Allowed Paths**, **serve**, **validate**.

## What it reads and writes

| Payload                     | Shape                                                                                                                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TransportMode`             | `"stdio" \| "http"`                                                                                                                                                                                                   |
| `ServerConfiguration`       | `{ readonly transport: TransportMode; readonly port: number; readonly host: string; readonly allowedHosts: readonly string[]; readonly allowedOrigins: readonly string[]; readonly allowUnrestrictedPaths: boolean }` |
| `HttpRequestGuardResult`    | `{ readonly allowed: true } \| { readonly allowed: false; readonly status: 403 \| 404 \| 405; readonly message: string; readonly allowHeader?: "POST" }`                                                              |
| `StartupNotice` _(derived)_ | `{ readonly level: "notice" \| "warning"; readonly message: string }`                                                                                                                                                 |

## Verbs (`src/server-config/verbs.ts`)

| Function                                                        | Rule                                                                                                                                        | Error                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parseServerConfiguration(argv, env)`                           | Rejects unknown flags/args (D32); parses `--transport=`, `--host=`, `--port=`, `--allow-unrestricted-paths` and `MCP_*` env vars (CLI wins) | `Unknown CLI argument "<arg>". Supported flags: --transport=stdio\|http, --host=HOST, --port=N, --allow-unrestricted-paths` / `Unknown transport "<t>". Supported values: stdio, http` / `Invalid port "<p>". Must be an integer between 1 and 65535.` / `Invalid host: must not be empty.` |
| `isLoopbackHost(host)`                                          | Matches `127.0.0.1`, `localhost`, `::1` (with optional `[...]`)                                                                             | _(boolean predicate)_                                                                                                                                                                                                                                                                       |
| `isHostHeaderAllowed(hostHeader, bindHost, allowedHosts)`       | Validates `Host` syntax; enforces `allowedHosts` if set, loopback-only if bound to loopback, or any valid host on non-loopback (D33, I5)    | _(boolean predicate)_                                                                                                                                                                                                                                                                       |
| `isOriginHeaderAllowed(originHeader, bindHost, allowedOrigins)` | Allows omitted `Origin`; enforces `allowedOrigins` if set, loopback-only on loopback bind, or denies on non-loopback (D33, I5)              | _(boolean predicate)_                                                                                                                                                                                                                                                                       |
| `checkHttpRequest(req, config)`                                 | Checks path (`/` or `/mcp` → 404), `Host` (→ 403), `Origin` (→ 403), and method (`POST` → 405 with `Allow: POST`) (D33, I5)                 | HTTP 404 `Not found` / HTTP 403 `Forbidden: invalid Host header` / HTTP 403 `Forbidden: invalid Origin header` / HTTP 405 `Method not allowed`                                                                                                                                              |

## Queries (`src/server-config/queries.ts`)

| Function                                  | Definition                                                                                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `startupNotices(config, env, expandHome)` | Computes HTTP startup notices/warnings for `MD_ALLOWED_PATHS` (disabled D9, unrestricted opt-in D23, invalid empty D24) and non-loopback host binding (D33) |

## Harness

| Command                                                    | Kind   | What it does                                                                                             |
| ---------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `serve config [flags...]`                                  | domain | Parses Server Configuration from `[flags...]` + `world.env` and prints resolved settings or `error: ...` |
| `serve check-http <method> <path> [host=<h>] [origin=<o>]` | domain | Evaluates HTTP routing and `Host`/`Origin` guards against current `world.env` Server Configuration       |
| `serve notices [flags...]`                                 | domain | Prints derived HTTP startup notices/warnings for `[flags...]` + `world.env` (or `(none)`)                |

## Placeholders

_(None — all rules are settled by D1, D2, D6, D9, D23, D24, D32, D33, and I5.)_

## Tests

- **Example tests** (`src/server-config/server-config.test.ts`): unit tests for `parseServerConfiguration` (defaults, CLI overrides, unknown flag D32, positional arg D32, invalid transport/port/host), `checkHttpRequest` (404, 405, 403 Host, 403 Origin, 200 pass, non-loopback rules), and `startupNotices` (D9, D23, D24, D33).
- **HTTP parser tests** (`src/http.test.ts`): verify `parseCliArgs` rejects unknown CLI flags (`D32`).
- **Scenario:** `scenarios/serve-and-configure-server/01-config-and-http-guards.txt`.
