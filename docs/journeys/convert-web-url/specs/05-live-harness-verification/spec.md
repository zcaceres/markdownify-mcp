# Slice 05: Live Harness Verification

Part of the [Convert Web URL plan](../../plan.md). Decisions referenced as D# / U# / I# are in
[`REQUIREMENTS.md`](../../../../../REQUIREMENTS.md). Builds on
[slice 04](../04-timeouts-and-size-limits/spec.md).

Exercises [acceptance criteria](../../acceptance-criteria.md) WU-1 through WU-14 against live external systems (real
DNS, real HTTP/HTTPS, real `os.tmpdir()`, and the real `markitdown` CLI).

## Goal

Enable agents and operators to run the exact same DD harness domain commands (`convert`, `config`, `filesystem`,
`network fetch-count`, `markitdown last-input`) against **live** external systems (`--live`), in addition to
deterministic in-memory mocks:

1. Add live adapters (`src/integrations/network/live.ts`, `src/integrations/filesystem/live.ts`,
   `src/integrations/markitdown/live.ts`, `src/integrations/clock/live.ts`) implementing `WebConversionPorts`.
2. Add `--live`, `exec [--live] <command...>`, and `live <file|folder>...` modes to `cli/main.ts`.
3. Add a variance-tolerant live assertion runner (`cli/live.ts`) and live suite
   `scenarios/live/convert-web-url.live.txt` (excluded from offline mock `bun test` and `bun run harness run scenarios`)
   so real-world internet variance can be verified without brittle byte-for-byte HTML/copy diffs.

**Done when:** offline unit tests (`src/integrations/live.test.ts` using `src/sample-data/*`, `cli/live.test.ts`),
`bun run lint`, `bun run build`, `bun run harness run scenarios`, and
`bun run harness live scenarios/live/convert-web-url.live.txt` all pass.

## Scope

**In:** `src/integrations/{network,filesystem,markitdown,clock}/live.ts`, `createLiveWorld` in `cli/world.ts`,
mock-only command guards in `cli/commands/{network,markitdown,clock}.ts`, `cli/live.ts` assertion runner, `--live` /
`exec` / `live` CLI modes in `cli/main.ts`, `.live.txt` exclusion from mock runner and `cli/scenarios.test.ts`, and
`scenarios/live/convert-web-url.live.txt`.

**Out:**

- Local file conversion commands in the harness — belongs to **Convert Local File**.
- Git repository conversion commands in the harness — belongs to **Convert Git Repository**.

## Vocabulary

- **MCP Client**, **Operator**, **Web URL**, **Server Configuration**, **Temporary File**, **Markdown Result** _(derived)_, **convert**, **validate**.

## Live Adapters

| Adapter                               | Implements                                                              | Behavior                                                                                                                                                                                                                                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/integrations/network/live.ts`    | `ResolveHost`, `FetchWebUrl`, `fetchCount`                              | Real `dns.lookup({ all: true, verbatim: true })`, real `fetch(..., { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) })`, streaming byte-cap (`Content-Length` + `ReadableStream` reader abort), skipping body download on `3xx` or canonical YouTube/Bing pass-through (D13, D14, I1) |
| `src/integrations/filesystem/live.ts` | `StageTempFile`, `CleanupTempFile`, `activeTempDirCount`, `stagedCount` | Real `os.tmpdir()` `mkdtempSync("markdownify-")` + `writeFileSync({ flag: "wx" })` + `rmSync({ recursive: true, force: true })` (I4)                                                                                                                                                              |
| `src/integrations/markitdown/live.ts` | `ConvertWithMarkitdown`, `lastInput`                                    | Real `execFile` invoking `resolveMarkitdownPath(projectRoot)` with `maxBuffer: 50 MB` and `timeout: timeoutMs` (D13, I3)                                                                                                                                                                          |
| `src/integrations/clock/live.ts`      | `Now`                                                                   | Real `new Date()`                                                                                                                                                                                                                                                                                 |

## Harness Modes & Live Assertions

| Command                                           | Mode         | What it does                                                                                                                                                                                         |
| ------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run harness`                                 | mock         | Interactive REPL against in-memory mocks                                                                                                                                                             |
| `bun run harness --live`                          | live         | Interactive REPL against live DNS, HTTP, filesystem, and `markitdown`                                                                                                                                |
| `bun run harness exec [--live] <command...>`      | mock or live | Runs one harness command and exits `0` on success or `1` on `error:`                                                                                                                                 |
| `bun run harness run <file\|folder>... [--write]` | mock         | Replays deterministic `.txt` scenarios (skips `.live.txt`)                                                                                                                                           |
| `bun run harness live <file\|folder>...`          | live         | Runs `.live.txt` checks against `createLiveWorld()` using variance-tolerant assertions (`expect ok`, `expect error [substr]`, `expect contains <substr>`, `expect exact <line>`, `expect not-empty`) |

In `--live` mode, mock-only mutators (`network stub`, `network stub-size`, `network content-type`, `network redirect`,
`network fail`, `network slow`, `network dns`, `network dns-fail`, `markitdown stub`, `markitdown empty`,
`markitdown fail`, `markitdown missing`, `markitdown slow`, `clock advance`, `clock set`) return:
`error: <command> is only available in mock mode`.

## Placeholders

_(None.)_

## Tests

- **Live adapter tests (offline, using `src/sample-data/*`)** (`src/integrations/live.test.ts`): verify `createLiveFilesystem` creates a private temp file on disk and deletes its directory on cleanup; verify `createLiveMarkitdown` converts real `src/sample-data/{test.pdf,test.docx,test.xlsx,test.pptx,test.jpg}` and reports `missing` when binary path does not exist; verify live-mode guards refuse mock-only commands.
- **Live runner tests (offline)** (`cli/live.test.ts`): verify parsing and evaluation of `expect ok`, `expect error`, `expect contains`, `expect exact`, and `expect not-empty` assertions (both pass and fail cases).
- **Live suite (online):** `scenarios/live/convert-web-url.live.txt` via `bun run harness live scenarios/live/convert-web-url.live.txt`.
