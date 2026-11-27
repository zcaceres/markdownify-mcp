# Slice 03: Docker Container Harness

Covers [SC-9](../../acceptance-criteria.md#4-verify-packaged-container-runtime) from
[Serve & Configure Server](../../plan.md). Cites **D3, D4, D11, D22, D34, I2** from
[`REQUIREMENTS.md`](../../../../../REQUIREMENTS.md).

## Scope

Replace the brittle `sleep 5` piped JSON-RPC shell smoke test with an MCP SDK-driven container verification mode in the
DD harness (`bun run harness docker`):

1. **Docker harness runner (`cli/docker.ts` — SC-9, D4, D11, D22, D34, I2):**
   - Builds `Dockerfile` (`docker build -t <image> .`, defaulting to `IMAGE` env var or `markdownify-mcp:harness`, with optional `--no-build` and `--image=<tag>`).
   - Connects to `docker run --rm -i -v <repo>/src/sample-data:/data:ro -e MD_ALLOWED_PATHS=/data <image>` using `@modelcontextprotocol/sdk` `Client` + `StdioClientTransport`.
   - Verifies four checks against the live container:
     1. `tools/list` returns all 11 stable MCP tools (`D3`).
     2. `pdf-to-markdown /data/test.pdf` succeeds (`isError !== true`) and contains `"Test PDF content"` (`D4`, `D11`, `D34`).
     3. `pdf-to-markdown /etc/passwd` fails closed (`isError === true`) with `"outside the allowed directories"` (`I2`, `D34`).
     4. `docx-to-markdown /data/test.docx` (real binary OOXML fixture per `D42`) fails (`isError === true`) with the `D22` slim-Docker `markitdown[all]` hint (`D4`, `D22`, `D34`).
   - Closes the MCP client cleanly in `finally` so the `--rm` container exits immediately without fixed sleeps.
2. **CLI wiring (`cli/main.ts`):**
   - Adds `harness docker [--no-build] [--image=<tag>]` mode.
3. **Thin shell wrapper (`scripts/docker-smoke-test.sh` — D34):**
   - Delegates directly to `bun run harness docker "$@"` so existing operator and CI invocations continue to work.
4. **Unit test (`cli/docker.test.ts`):**
   - Tests check evaluation and CLI option parsing without requiring a running Docker daemon.

## Files

- `cli/docker.ts` — `parseDockerArgs`, `runDockerChecks`, `formatDockerReport`, `runDockerHarness`.
- `cli/docker.test.ts` — Deterministic unit tests for `parseDockerArgs` and `runDockerChecks`.
- `cli/main.ts` — Dispatch `mode === "docker"`.
- `scripts/docker-smoke-test.sh` — Thin wrapper delegating to `bun run harness docker`.
- `docs/journeys/serve-and-configure-server/runbook.md` & `README.md` — Document `bun run harness docker`.

## Placeholders

None.
