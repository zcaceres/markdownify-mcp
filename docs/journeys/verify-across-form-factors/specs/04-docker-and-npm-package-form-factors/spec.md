# Slice 04: Docker and `npm-package` Form Factor Drivers

Covers [VF-4](../../acceptance-criteria.md#3-run-form-factor-transport--security-checks),
[VF-7](../../acceptance-criteria.md#5-tear-down-resources--emit-verification-report),
[VF-9](../../acceptance-criteria.md#2-provision--connect-each-selected-form-factor), and
[VF-10](../../acceptance-criteria.md#2-provision--connect-each-selected-form-factor) from
[Verify Across Form Factors](../../plan.md). Cites **D4, D9, D22, D33, D34, D37, D43, D44, D45, I2, I5** from
[`REQUIREMENTS.md`](../../../../../REQUIREMENTS.md).

## Scope

1. **Docker Form Factor Drivers (`cli/e2e/drivers.ts` — VF-4, VF-7, VF-9):**
   - `docker-stdio`: builds `Dockerfile` once per run (unless `--no-build`), runs `docker run --rm -i -v src/sample-data:/data:ro -e MD_ALLOWED_PATHS=/data` over MCP SDK `StdioClientTransport` (`slim-pdf` profile asserting `D22` hints on real binary Office files).
   - `docker-http`: runs slim `Dockerfile` with `--transport=http --host=0.0.0.0 --port=3000` mapped to an ephemeral loopback port, connects via MCP SDK `StreamableHTTPClientTransport`, verifies container HTTP 404/405/403 (`D33`, `I5`) and `D9` fail-closed local file blocking, and force-removes the container in `finally`.
2. **`npm-package` Form Factor Driver (`cli/e2e/drivers.ts` — VF-7, VF-10, D43):**
   - Packs the repository with `npm pack` into a fresh temporary directory, installs the tarball cleanly (running real `preinstall` / `uv sync` by default, or skipping `preinstall` and passing workspace `MARKITDOWN_PATH` when `--reuse-venv` is set), spawns `node_modules/.bin/mcp-markdownify-server` over `StdioClientTransport`, and deletes the temporary directory in `finally`.

## Placeholders

None.
