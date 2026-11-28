# Slice 01: E2E Verification Domain and Corpus

Part of the [Verify Across Form Factors plan](../../plan.md). Decisions referenced as D# / U# / I# are in
[`REQUIREMENTS.md`](../../../../../REQUIREMENTS.md).

Covers [acceptance criteria](../../acceptance-criteria.md) VF-1, VF-2, VF-5, and VF-6.

## Goal

Build the pure `src/e2e-verification/` domain context and mock harness commands for end-to-end verification across Form
Factors and Verification Cases:

1. Parse and validate `bun run harness e2e` CLI options (`--form=`, `--all`, `--category=`, `--case=`, `--toolset=`,
   `--url=`, `--file=`, `--tool=`, `--branch=`, `--compress`, `--json`, `--preview`, `--no-build`, `--reuse-venv`),
   rejecting unknown flags, invalid Form Factors, categories, or Toolsets, conflicting `--url` + `--file`, or ad-hoc
   probes missing `--tool` (**D37, D43, D45, D51**).
2. Validate `VerificationCorpus` manifests at the boundary (`version`, unique case `id`s, valid categories, classic 11
   tool names `CLASSIC_MCP_TOOLS` per **D3**, per-profile `full` and `slim-pdf` expectations, optional `timeoutMs` and
   `blockedPatterns`) and filter cases cleanly (**D38, D44**).
3. Classify execution outputs against profile-aware expectations (`full` vs `slim-pdf`, **D4, D22, D44**) into `PASS`,
   `FAIL`, or `BLOCKED` (**D39**).
4. Compute the derived `VerificationReport` (`total`, `passed`, `failed`, `blocked`, three-state exit code `0`/`1`/`2`
   per **D41**) and format it as human-readable text or JSON (**D39, D46**).

**Done when:** `src/e2e-verification/e2e-verification.test.ts` passes, `bun run lint` and `bun run build` pass, and
`scenarios/verify-across-form-factors/01-e2e-domain-and-corpus.txt` replays cleanly
(`bun run harness run scenarios/verify-across-form-factors/01-e2e-domain-and-corpus.txt`).

## Scope

**In:** `src/e2e-verification/{nouns,verbs,queries,e2e-verification.test}.ts`, `cli/commands/e2e-verification.ts`
(`e2e` mock harness command registered in `cli/commands/index.ts`), `cli/world.ts` (in-memory outcome list reset on
`reset`), and `scenarios/verify-across-form-factors/01-e2e-domain-and-corpus.txt`.

**Out:**

- Real binary fixtures in `src/sample-data/` — waits for Slice 02 (`02-real-binary-sample-data`, VF-3).
- Curated `corpus/manifest.json` and real local MCP transport drivers (`node-stdio`, `bun-stdio`, `local-http`) — waits for Slice 03 (`03-local-form-factors-and-corpus-runner`, VF-4, VF-7, VF-8, VF-11).
- `docker-stdio`, `docker-http`, and `npm-package` drivers — waits for Slice 04 (`04-docker-and-npm-package-form-factors`, VF-9, VF-10).

## Vocabulary

- **Operator**, **MCP Client**, **Toolset**, **Form Factor**, **Verification Corpus**, **Verification Case**, **Verification Report** _(derived)_, **validate**, **verify**.

## What it reads and writes

| Payload                          | Shape                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FormFactor`                     | `"node-stdio" \| "bun-stdio" \| "local-http" \| "docker-stdio" \| "docker-http" \| "npm-package"`                                                                                                                                                                                                                                              |
| `PythonProfile`                  | `"full" \| "slim-pdf"`                                                                                                                                                                                                                                                                                                                         |
| `FormFactorDescriptor`           | `{ readonly id: FormFactor; readonly transport: "stdio" \| "http"; readonly profile: PythonProfile }`                                                                                                                                                                                                                                          |
| `VerificationCategory`           | `"static-web" \| "spa-html" \| "hosted-binary" \| "youtube-bing" \| "git-repo" \| "local-binary"`                                                                                                                                                                                                                                              |
| `CaseExpectation`                | `{ readonly kind: "ok"; readonly contains?: readonly string[]; readonly notContains?: readonly string[]; readonly requirePath?: boolean; readonly allowEmpty?: boolean } \| { readonly kind: "error"; readonly contains?: readonly string[] }`                                                                                                 |
| `VerificationCase`               | `{ readonly id: string; readonly category: VerificationCategory; readonly tool: string; readonly args: Readonly<Record<string, string \| boolean>>; readonly timeoutMs?: number; readonly expectByProfile: { readonly full: CaseExpectation; readonly "slim-pdf": CaseExpectation }; readonly blockedPatterns?: readonly string[] }`           |
| `VerificationCorpus`             | `{ readonly version: number; readonly cases: readonly VerificationCase[] }`                                                                                                                                                                                                                                                                    |
| `E2eOptions`                     | `{ readonly formFactors: readonly FormFactor[]; readonly categories: readonly VerificationCategory[]; readonly caseIds: readonly string[]; readonly toolset: Toolset; readonly adHoc?: AdHocProbe; readonly json: boolean; readonly preview: boolean; readonly noBuild: boolean; readonly reuseVenv: boolean }`                                |
| `CaseOutcome`                    | `{ readonly formFactor: FormFactor; readonly caseId: string; readonly category: VerificationCategory \| "ad-hoc" \| "contract" \| "transport"; readonly tool: string; readonly status: "PASS" \| "FAIL" \| "BLOCKED"; readonly durationMs: number; readonly detail: string; readonly outputLength?: number; readonly outputPreview?: string }` |
| `VerificationReport` _(derived)_ | `{ readonly total: number; readonly passed: number; readonly failed: number; readonly blocked: number; readonly exitCode: 0 \| 1 \| 2; readonly outcomes: readonly CaseOutcome[] }`                                                                                                                                                            |

## Verbs (`src/e2e-verification/verbs.ts`)

| Function                                            | Rule                                                                                                                                                                                                                                                          | Error                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parseE2eOptions(argv)`                             | Parses CLI flags (`--toolset=`, `--preview`, etc.), defaults `formFactors` to `["node-stdio"]` (`--all` selects all 6), validates Form Factors, categories, Toolsets, and ad-hoc probe flags (`D45`, `D51`)                                                   | `Unknown e2e argument "<arg>"...` / `Unknown Form Factor "<v>"...` / `Unknown category "<v>"...` / `Unknown toolset "<v>"...` / `Cannot specify both --url and --file for an ad-hoc probe` / `Ad-hoc probe requires --tool=<name>` / `Unknown tool "<t>"` / `Invalid flag "<f>": value must not be empty` |
| `parseVerificationCorpus(raw)`                      | Validates manifest JSON structure with Zod: positive `version`, non-empty unique `cases`, valid categories and classic tools (`CLASSIC_MCP_TOOLS`, `D3`, `D38`, `D44`)                                                                                        | `Invalid Verification Corpus: <details>` / `Duplicate Verification Case id "<id>"`                                                                                                                                                                                                                        |
| `selectVerificationCases(corpus, options)`          | Filters corpus by `categories` and `caseIds`, rejecting unknown case ids or empty selection                                                                                                                                                                   | `Unknown Verification Case "<id>"` / `No Verification Cases matched the requested filters`                                                                                                                                                                                                                |
| `classifyCaseOutcome(formFactor, testCase, output)` | Classifies `CaseExecutionOutput` against `expectByProfile[profile]` and `blockedPatterns` (on both `"ok"` and `"error"` expectations) into `PASS`, `FAIL`, or `BLOCKED`, attaching `outputLength`/`outputPreview` when non-empty (`D22`, `D39`, `D44`, `D45`) | _(returns `CaseOutcome`)_                                                                                                                                                                                                                                                                                 |

## Queries (`src/e2e-verification/queries.ts`)

| Function                                              | Definition                                                                                                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `describeFormFactor(formFactor)`                      | Returns `{ id, transport, profile }` for any of the six Form Factors (`D37`, `D44`)                                                                                                   |
| `mapToolToToolset(tool, toolset)`                     | Maps a classic or compact MCP tool name onto the active `Toolset` (`classic` or `compact`, `D51`)                                                                                     |
| `verificationReport(outcomes)`                        | Computes `{ total, passed, failed, blocked, exitCode, outcomes }` with `exitCode` = `1` if `failed > 0`, `2` if `blocked > 0`, else `0` (`D41`, `D54`)                                |
| `formatVerificationReport(report, json, showPreview)` | Renders human-readable summary lines (including truncated previews when `showPreview` is true or `category === "ad-hoc"`) or formatted JSON when `json` is true (`D39`, `D45`, `D46`) |

## Harness

| Command                                                           | Kind   | What it does                                                                                                                                                                               |
| ----------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `e2e parse [flags...]`                                            | domain | Parses `E2eOptions` from `[flags...]` and prints resolved form factors, filters/ad-hoc probe, and flags (including `toolset` and `preview`)                                                |
| `e2e validate-corpus <json>`                                      | domain | Validates a JSON Verification Corpus manifest via `parseVerificationCorpus` and prints `ok: corpus v<n> (<k> cases)`                                                                       |
| `e2e classify <formFactor> <case> <ok\|error\|timeout> [text...]` | domain | Classifies a simulated tool call against built-in Verification Cases (`docx-binary`, `youtube-watch`, `static-html`), records the outcome, and prints `<STATUS> (<form>/<case>): <detail>` |
| `e2e report [--json] [--preview]`                                 | domain | Computes and prints the derived `VerificationReport` over recorded outcomes (text with optional previews or JSON, with exit code)                                                          |

## Placeholders

_(None — all rules are settled by D3, D4, D22, D37–D46.)_

## Tests

- **Example tests** (`src/e2e-verification/e2e-verification.test.ts`): unit tests for `describeFormFactor`, `parseE2eOptions` (defaults, `--all`, filters, ad-hoc, refusals), `parseVerificationCorpus` (valid, duplicate ids, unknown tool, malformed), `selectVerificationCases`, `classifyCaseOutcome` (full vs slim-pdf D22, upstream `BLOCKED`, timeout/transport `FAIL`, missing substring `FAIL`), and `verificationReport` / `formatVerificationReport` (exit `0`/`1`/`2`, text & JSON).
- **Scenario:** `scenarios/verify-across-form-factors/01-e2e-domain-and-corpus.txt`.
