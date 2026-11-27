# Slice 03: Curated Corpus and Local Form Factor Drivers

Covers [VF-4](../../acceptance-criteria.md#3-run-form-factor-transport--security-checks),
[VF-7](../../acceptance-criteria.md#5-tear-down-resources--emit-verification-report),
[VF-8](../../acceptance-criteria.md#2-provision--connect-each-selected-form-factor), and
[VF-11](../../acceptance-criteria.md#4-execute-verification-cases--classify-outcomes) from
[Verify Across Form Factors](../../plan.md). Cites **D3, D8, D9, D22, D33, D37–D45, I2, I5** from
[`REQUIREMENTS.md`](../../../../../REQUIREMENTS.md).

## Scope

1. **Curated Verification Corpus (`corpus/manifest.json` — D38, D42, D44):**
   - Covers all six categories (`static-web`, `spa-html`, `hosted-binary`, `youtube-bing`, `git-repo`, `local-binary`)
     with per-profile (`full` vs `slim-pdf`) expectations and upstream `blockedPatterns` for YouTube/Bing.
2. **Local Form Factor Drivers (`cli/e2e/drivers.ts` — VF-4, VF-7, VF-8):**
   - `node-stdio`: spawns `node dist/index.js` over MCP SDK `StdioClientTransport`.
   - `bun-stdio`: spawns `bun dist/index.js` over MCP SDK `StdioClientTransport`.
   - `local-http`: spawns `bun dist/index.js --transport=http` on an ephemeral loopback port, connects via MCP SDK
     `StreamableHTTPClientTransport`, and runs `Host`/`Origin` 403 (`I5`), 404/405 `Allow: POST` (`D33`), and `D9`
     fail-closed checks.
3. **E2E Runner & CLI Wiring (`cli/e2e/runner.ts`, `cli/main.ts` — VF-7, VF-11):**
   - Runs `bun run harness e2e [flags...]`, supports ad-hoc `--url=`/`--file=` + `--tool=` probes, enforces per-case
     timeouts, guarantees teardown in `finally`, prints text or `--json` Verification Report, and exits `0`/`1`/`2`.

## Placeholders

None.
