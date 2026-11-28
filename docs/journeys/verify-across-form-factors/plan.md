# Verify Across Form Factors: Plan

How the journey is built, slice by slice. What it must do is in its [acceptance criteria](acceptance-criteria.md);
decisions (D#) and questions (U#) are in [`REQUIREMENTS.md`](../../../REQUIREMENTS.md).

## Sources

The designs and existing code behind this journey, from its design session (2026-11-27).

- [REQUIREMENTS.md](../../../REQUIREMENTS.md): system decisions D1–D46, invariants I1–I5, Terminology (`Form Factor`, `Verification Corpus`, `Verification Case`, `Verification Report`).
- [cli/docker.ts](../../../cli/docker.ts), [cli/live.ts](../../../cli/live.ts), [cli/main.ts](../../../cli/main.ts): existing DD harness live and slim Docker modes.
- [src/sample-data/](../../../src/sample-data/), [Dockerfile](../../../Dockerfile), [package.json](../../../package.json), [preinstall.js](../../../preinstall.js): fixtures, slim container image, and npm packaging lifecycle.

## Shape

An **Operator** (including a coding agent) runs `bun run harness e2e` with optional Form Factor, category, case, or
ad-hoc `--url`/`--file` filters (**D37, D38, D40, D45**). The harness validates `corpus/manifest.json`, provisions each
selected **Form Factor** (`node-stdio`, `bun-stdio`, `local-http`, `docker-stdio`, `docker-http`, `npm-package`;
**D37, D43**), connects a real MCP SDK client (`StdioClientTransport` or `StreamableHTTPClientTransport`), checks all 11
tools (**D3**) plus HTTP security guards (**D9, D33, I5**), executes real-internet and real-binary **Verification Cases**
with profile-aware contracts (`full` vs `slim-pdf`, **D4, D22, D42, D44**), classifies outcomes into `PASS`/`FAIL`/
`BLOCKED` (**D39**), cleans up every spawned resource (**D45**), prints a text or JSON **Verification Report**, and
exits `0` / `1` / `2` (**D41**).

## Contexts, verbs and queries

Where this journey lives in the code. Each noun is a type in `src/e2e-verification/nouns.ts`. Each verb is a function in
`verbs.ts`, and each derived noun a function in `queries.ts`.

| Context                 | Nouns                                                                                                                                                                                  | Verbs                                                                                          | Queries                                                                                    | Harness commands                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `src/e2e-verification/` | `FormFactor`, `FormFactorDescriptor`, `PythonProfile`, `ClassicMcpTool`, `CompactMcpTool`, `VerificationCorpus`, `VerificationCase`, `E2eOptions`, `CaseOutcome`, `VerificationReport` | `parseE2eOptions`, `parseVerificationCorpus`, `selectVerificationCases`, `classifyCaseOutcome` | `describeFormFactor`, `mapToolToToolset`, `verificationReport`, `formatVerificationReport` | `e2e parse [flags...]`, `e2e validate-corpus <json>`, `e2e classify ...`, `e2e report [--json] [--preview]`, `harness e2e` |

## External systems

| System                 | What we need from it                                                                              | World commands / mode                     |
| ---------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Node.js & Bun runtimes | Spawn `node dist/index.js`, `bun dist/index.js`, and local `--transport=http` servers             | `bun run harness e2e --form=node-stdio,…` |
| Real Internet & DNS    | Live webpages, redirects, SPAs, hosted binaries, YouTube, Bing, public Git repositories           | `bun run harness e2e --category=…`        |
| Local Docker daemon    | Build slim `Dockerfile` and run `docker-stdio` and `docker-http` containers                       | `bun run harness e2e --form=docker-…`     |
| `npm pack` / `uv sync` | Pack tarball, install cleanly in temp dir (`preinstall` or `--reuse-venv`), invoke `bin` over MCP | `bun run harness e2e --form=npm-package`  |

## Slices

Each slice is one capability, wired through every part of the system with tests and a scenario or live runner check. Each
has a [spec](specs/).

### Done

1. **01-e2e-domain-and-corpus.** Tracer bullet: build `src/e2e-verification/` (`nouns.ts`, `verbs.ts`, `queries.ts`, unit tests) covering CLI parsing (`D37`, `D43`, `D45`), corpus manifest validation (`D3`, `D38`, `D44`), profile-aware `PASS`/`FAIL`/`BLOCKED` classification (`D22`, `D39`, `D44`), derived `VerificationReport` with `0`/`1`/`2` exit codes and text/JSON formatting (`D41`, `D46`), plus mock harness command `e2e` and scenario `scenarios/verify-across-form-factors/01-e2e-domain-and-corpus.txt`. Covers VF-1, VF-2, VF-5, VF-6.
   ([spec](specs/01-e2e-domain-and-corpus/spec.md), `scenarios/verify-across-form-factors/01-e2e-domain-and-corpus.txt`)
2. **02-real-binary-sample-data.** Replace `src/sample-data/test.{docx,xlsx,pptx,jpg}` ASCII stubs with minimal, real, valid binary fixtures plus minimal `test.wav` and `test.md` (`D42`), update `src/Markdownify.test.ts`, `src/integrations/live.test.ts`, and `scenarios/live/convert-local-file.live.txt`, and simplify `cli/docker.ts` to test real `src/sample-data/test.docx` directly. Covers VF-3.
   ([spec](specs/02-real-binary-sample-data/spec.md))
3. **03-local-form-factors-and-corpus-runner.** Author curated `corpus/manifest.json` across all six categories (`static-web`, `spa-html`, `hosted-binary`, `youtube-bing`, `git-repo`, `local-binary`), implement real MCP SDK drivers for `node-stdio`, `bun-stdio`, and `local-http` (including `tools/list`, `I2`, `I5`, `D9`, `D33` guards, per-case timeouts, ad-hoc `--url`/`--file` probes, and guaranteed resource cleanup), and wire `bun run harness e2e` in `cli/main.ts`. Covers VF-4, VF-7, VF-8, VF-11.
   ([spec](specs/03-local-form-factors-and-corpus-runner/spec.md))
4. **04-docker-and-npm-package-form-factors.** Implement `docker-stdio`, `docker-http` (slim `pdf` profile with `D22` checks and container HTTP `I5`/`D9`/`D33` guards), and `npm-package` (`npm pack` + temp install verifying `preinstall`/`uv sync` and `mcp-markdownify-server` bin, plus `--reuse-venv`). Covers VF-4, VF-7, VF-9, VF-10.
   ([spec](specs/04-docker-and-npm-package-form-factors/spec.md))
5. **CI workflows (`.github/workflows/ci.yml` & `.github/workflows/e2e-live.yml`).** Offline PR CI runs `core`, `docker`, and `npm-package` Form Factor gates in parallel; weekly scheduled and `workflow_dispatch` live E2E runs the 6-Form-Factor matrix with `D41` exit code handling.

### Next

_(None — all planned slices for Verify Across Form Factors are complete.)_

## Deferred

- Headless browser / Playwright SPA rendering (out of scope per D1, D4).
- Authenticated or paywalled Web URL testing (deferred under U5).
