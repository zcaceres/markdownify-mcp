# Verify Across Form Factors: Acceptance Criteria

An **Operator** (including an AI coding agent verifying the server) runs `bun run harness e2e` to test Markdownify MCP
end-to-end as a real **MCP Client** across all six supported **Form Factors** (`node-stdio`, `bun-stdio`, `local-http`,
`docker-stdio`, `docker-http`, `npm-package`) against a curated real-world **Verification Corpus** and ad-hoc URL/file
probes, producing a **Verification Report** with three-state outcomes and exit codes ([plan](plan.md)).

Rules that hold whichever journey is involved, and the decisions (D#), questions (U#) and invariants (I#) cited here,
are in [`REQUIREMENTS.md`](../../../REQUIREMENTS.md). These criteria say what the **Operator** can do and see; they cite
rules rather than restate them. Each slice's [spec](specs/) names the criteria it covers.

Each criterion is one or more Gherkin scenarios tagged with its id (`@VF-1`) and the decisions, questions and
invariants it cites. Scenarios that share an id make up one criterion.

## Steps

1. **Parse E2E options & load Verification Corpus.** The harness parses CLI flags (failing fast on unknown flags or invalid selections) and validates `corpus/manifest.json`.
2. **Provision & connect each selected Form Factor.** The harness starts each selected Form Factor (including real binary `src/sample-data/` fixtures, Docker builds/containers, or `npm pack` temp installs) and connects a real MCP SDK client.
3. **Run Form Factor transport & security checks.** The harness verifies all 11 stable MCP tools on `tools/list` plus HTTP `Host`/`Origin`, routing, and fail-closed `File Access Policy` guards on HTTP Form Factors.
4. **Execute Verification Cases & classify outcomes.** The harness runs curated corpus cases or ad-hoc probes against real internet and binary inputs, evaluates profile-aware expectations (`full` vs `slim-pdf`), enforces per-case timeouts, and classifies each outcome as `PASS`, `FAIL`, or `BLOCKED`.
5. **Tear down resources & emit Verification Report.** The harness cleans up every spawned server, container, and temporary directory, renders text or JSON output, and exits `0`, `1`, or `2`.

## 1. Parse E2E options & load Verification Corpus

```gherkin
@VF-1 @D37 @D40 @D43 @D45
Scenario: E2E CLI parses Form Factor filters, corpus filters, ad-hoc probe flags, and rejects invalid arguments
  Given an Operator invokes `bun run harness e2e` with defaults, `--form=`, `--all`, `--category=`, `--case=`, `--url=` / `--file=` + `--tool=`, `--json`, `--no-build`, or `--reuse-venv`
  When E2E options are parsed
  Then valid combinations resolve cleanly and unknown flags, unknown Form Factors, unknown categories, conflicting `--url` + `--file`, or missing `--tool` fail fast with clear errors (D37, D43, D45)

@VF-2 @D3 @D38 @D44 @D46
Scenario: Verification Corpus manifest is validated at the boundary and case filters fail on unknown case ids
  Given a Verification Corpus manifest with valid or malformed entries (duplicate ids, unknown tool names, invalid categories, missing profile expectations)
  When the manifest is parsed and filtered by category or case id
  Then valid manifests load cleanly, malformed manifests fail with structured validation errors, and unknown `--case=` ids or empty filter matches fail cleanly (D3, D38, D44)
```

## 2. Provision & connect each selected Form Factor

```gherkin
@VF-3 @D4 @D11 @D42 @D44
Scenario: Real minimal binary fixtures in src/sample-data/ convert accurately on markitdown[all] and surface D22 on slim Docker
  Given `src/sample-data/` contains real minimal valid binary fixtures (`test.pdf`, `test.docx`, `test.xlsx`, `test.pptx`, `test.jpg`, `test.md`, plus `test.wav` verified separately when network speech recognition is available)
  When local full-profile tools convert offline `local-binary` fixtures and slim Docker converts non-PDF binaries
  Then full-profile conversions produce expected Markdown (or empty on visionless image per D16) and slim Docker rejects non-PDF Office binaries with the D22 hint (D4, D11, D22, D42, D44)

@VF-8 @D37 @D40 @D45
Scenario: Local Form Factors (`node-stdio`, `bun-stdio`, `local-http`) connect via real MCP SDK transports
  Given the built server (`dist/index.js`) and local `.venv`
  When the Operator runs `bun run harness e2e` targeting `node-stdio`, `bun-stdio`, or `local-http`
  Then each Form Factor starts cleanly, connects via MCP SDK `StdioClientTransport` or `StreamableHTTPClientTransport`, and runs selected Verification Cases end-to-end (D37, D40, D45)

@VF-9 @D4 @D22 @D34 @D37 @D44
Scenario: Docker Form Factors (`docker-stdio`, `docker-http`) verify the slim image over stdio and Streamable HTTP
  Given a running local Docker daemon
  When the Operator runs `bun run harness e2e --form=docker-stdio,docker-http` (or `bun run harness docker`)
  Then the slim image builds (unless `--no-build`), verifies PDF conversion, Allowed Paths containment, `D22` slim-Docker hints on real binary Office fixtures, and container HTTP guards on `docker-http`, and reports a clear error if Docker is unavailable (D4, D22, D34, D37, D44)

@VF-10 @D37 @D43 @D45
Scenario: `npm-package` Form Factor verifies `npm pack` installation and `mcp-markdownify-server` binary over stdio
  Given a fresh temporary directory outside the workspace
  When the Operator runs `bun run harness e2e --form=npm-package` (with full `preinstall` / `uv sync`, or `--reuse-venv` for fast local iteration)
  Then the packed tarball installs cleanly, starts `mcp-markdownify-server` over `StdioClientTransport`, executes Verification Cases, and removes the temporary directory on exit (D37, D43, D45)
```

## 3. Run Form Factor transport & security checks

```gherkin
@VF-4 @D3 @D9 @D33 @D37 @D44 @I2 @I5
Scenario: Every Form Factor verifies all 11 tools and HTTP Form Factors verify Host/Origin, routing, and D9 fail-closed policy
  Given a provisioned Form Factor transport
  When Form Factor transport and security checks run
  Then `tools/list` exposes all 11 stable tools (D3), `Allowed Paths` blocks out-of-bounds reads (I2), and HTTP Form Factors (`local-http`, `docker-http`) additionally verify HTTP 404/405 (`Allow: POST`, D33), HTTP 403 on bad `Host`/`Origin` (I5), and `D9` fail-closed local file refusal when `MD_ALLOWED_PATHS` is unset (D44)
```

## 4. Execute Verification Cases & classify outcomes

```gherkin
@VF-5 @D4 @D22 @D38 @D39 @D44
Scenario: Profile-aware outcome classifier distinguishes PASS, FAIL, and BLOCKED across full and slim-pdf profiles
  Given a Verification Case with per-profile expectations (`full` vs `slim-pdf`) and optional upstream `blockedPatterns`
  When a tool invocation succeeds, fails with an expected profile error (such as D22 on `slim-pdf`), fails with an unexpected server error or timeout, or fails with a matching upstream bot-wall/rate-limit error
  Then expected profile matches classify as `PASS`, upstream bot-wall/rate-limit matches classify as `BLOCKED`, and unexpected errors, timeouts, transport errors, or contract mismatches classify as `FAIL` (D22, D39, D44)

@VF-11 @D16 @D38 @D39 @D40 @D45
Scenario: Curated real-internet corpus and ad-hoc CLI probes execute end-to-end across all input categories
  Given outbound network access and the curated `corpus/manifest.json` (static HTML/redirects/404, JS framework SSR conversion and unconverted raw-HTML rejection per D16, hosted binaries, YouTube/Bing, multi-language Git repos, offline local binaries) or an ad-hoc `--url=` / `--file=` probe
  When the Operator runs `bun run harness e2e` against the corpus or an ad-hoc target
  Then every selected target runs through the real MCP tool boundary and records its classified outcome and duration in the Verification Report (D16, D38, D39, D40, D45)
```

## 5. Tear down resources & emit Verification Report

```gherkin
@VF-6 @D39 @D41 @D45 @D46 @D54
Scenario: Verification Report computes totals, renders text or JSON, and maps outcomes to three-state exit codes
  Given a set of classified Verification Case, ad-hoc, contract, and transport outcomes (D54)
  When the derived Verification Report is computed and rendered
  Then exit code is `0` when all pass, `1` when any check is `FAIL`, and `2` when zero checks are `FAIL` and one or more checks are `BLOCKED`, with both human-readable and `--json` formats including totals and per-case diagnostics (D39, D41, D45, D46, D54)

@VF-7 @D45
Scenario: Spawned servers, Docker containers, and temporary directories are always cleaned up on completion or failure
  Given an E2E run that completes normally or encounters a case failure or timeout
  When the run finishes
  Then every child server process, Docker container, and temporary install/probe directory is torn down before the harness exits (D45)
```
