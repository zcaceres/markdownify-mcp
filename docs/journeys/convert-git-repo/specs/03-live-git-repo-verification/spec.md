# Slice 03: Live Git Repository Verification

Part of the [Convert Git Repository plan](../../plan.md). Decisions referenced as D# / U# / I# are in
[`REQUIREMENTS.md`](../../../../../REQUIREMENTS.md). Builds on [slice 02](../02-ssrf-and-timeouts/spec.md).

Covers [acceptance criterion](../../acceptance-criteria.md) GR-9.

## Goal

Wire the real `repomix` CLI into the live harness (`src/integrations/repomix/live.ts`, `cli/world.ts`) and verify
**Convert Git Repository** end-to-end against real DNS and the real `repomix` binary (**D3, D11, D28, D29, D31, I1,
I3**):

1. Implement `createLiveRepomix(projectRoot)` using `execFile` (`I3`), `resolveRepomixPath(projectRoot)`, 100 MB stdout
   buffer (`D7`), and `timeout: timeoutMs` (`D28`), mapping `ENOENT`, timeout (`killed`/`ETIMEDOUT`), and non-zero
   stderr/failures to `RepomixError`.
2. Add offline live-adapter unit tests in `src/integrations/live.test.ts` (`REPOMIX_PATH` missing → `missing`, real
   bundled `repomix` binary killed at 1ms → `timeout`, live SSRF / credentials / branch checks via `createLiveWorld`).
3. Add `scenarios/live/convert-git-repo.live.txt` converting `octocat/Hello-World` (default, `--branch=master`,
   `--compress`), verifying live SSRF refusal (`http://127.0.0.1/owner/repo`), `D29` credentials refusal, and `D28`
   timeout abort (`MD_REPOMIX_TIMEOUT_MS=1`).

**Done when:** the offline tests, `bun run lint`, and `bun run build` pass, and
`bun run harness live scenarios/live/convert-git-repo.live.txt` passes cleanly when outbound GitHub network access is
available.

## Scope

**In:** `src/integrations/repomix/live.ts`, `cli/world.ts`, `scenarios/live/convert-git-repo.live.txt`, offline live
`repomix` tests in `src/integrations/live.test.ts`, and `plan.md` / `runbook.md` links.

**Out:** _(None — completes Convert Git Repository.)_

## Vocabulary

- **MCP Client**, **Operator**, **Git Repository**, **Server Configuration**, **Markdown Result** _(derived)_, **convert**, **validate**.

## Harness

- `bun run harness live scenarios/live/convert-git-repo.live.txt`: runs the live Git Repository suite against real
  DNS and the real `repomix` CLI.

## Placeholders

_(None.)_

## Tests

- **Live integration tests** (`src/integrations/live.test.ts`): `createLiveRepomix` returns `missing` when `REPOMIX_PATH` points to a non-existent binary, returns `timeout` when `timeoutMs` is exceeded on the real bundled `repomix` binary, and `createLiveWorld` enforces live SSRF & `D29` credentials checks without invoking `repomix`.
- **Live suite:** `scenarios/live/convert-git-repo.live.txt`.
