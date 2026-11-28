# Slice 04: Live Local File Verification

Part of the [Convert Local File plan](../../plan.md). Decisions referenced as D# / U# / I# are in
[`REQUIREMENTS.md`](../../../../../REQUIREMENTS.md). Builds on [slice 03](../03-conversion-timeout-and-limits/spec.md).

Covers [acceptance criterion](../../acceptance-criteria.md) LF-12 and fixes the live-filesystem (`statRealLocalFile`)
and piped-stdin REPL (`cli/main.ts`) bugs queued from `/dd-verify`.

## Goal

Exercise the **Convert Local File** journey end-to-end against the real host filesystem and real `markitdown` CLI
(**D4, D11, D17, I2, I3**):

1. Harden `statRealLocalFile` in `src/integrations/filesystem/live.ts` so `EACCES`/`EPERM` on `statSync` reports
   `unreadable` (instead of `missing`) and non-regular files (`!stats.isFile()`, such as devices/FIFOs/sockets) report
   `not-a-file` (`Path is not a regular file: <path>`, **D17**).
2. Add `{{REPO_ROOT}}` variable expansion to the live suite runner (`cli/live.ts`, `cli/main.ts`) and add
   `scenarios/live/convert-local-file.live.txt` verifying real `src/sample-data/*` conversions (`PDF`, `DOCX`, `XLSX`,
   `PPTX`, `JPG`), live `Allowed Paths` containment, `D24` empty `MD_ALLOWED_PATHS` fail-closed, `D9`/`D23` HTTP
   fail-closed, `D17` directory/missing refusal, and `D13` real subprocess timeout.
3. Verify live symlink escape refusal and in-bounds symlink conversion against real OS symlinks in
   `src/integrations/live.test.ts`.
4. Guard `rl.prompt()` on readline close in `cli/main.ts` so piped stdin into `bun run harness --live` exits cleanly
   without `ERR_USE_AFTER_CLOSE`.

**Done when:** the tests below pass, `bun run lint` and `bun run build` pass, and
`bun run harness live scenarios/live/convert-local-file.live.txt` passes cleanly.

## Scope

**In:** `FileStat` (`not-a-file` variant) in `src/local-file-conversion/{nouns,verbs}.ts`, `statRealLocalFile` in
`src/integrations/filesystem/live.ts`, `parseLive` template variables in `cli/live.ts`, piped-stdin close guard in
`cli/main.ts`, `scenarios/live/convert-local-file.live.txt`, and live filesystem/symlink tests in
`src/integrations/live.test.ts` and `cli/live.test.ts`.

**Out:**

- Slim Docker `markitdown[pdf]` image check — automated via `bun run harness docker` in **Serve & Configure Server** (`D34`).

## Vocabulary

- **MCP Client**, **Operator**, **Local File**, **Allowed Paths**, **Server Configuration**, **Markdown Result** _(derived)_, **convert**, **validate**.

## What it reads and writes

| Payload    | Shape                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FileStat` | `{ readonly kind: "missing" } \| { readonly kind: "directory" } \| { readonly kind: "not-a-file" } \| { readonly kind: "unreadable" } \| { readonly kind: "file" }` |

## Verbs (`src/local-file-conversion/verbs.ts`)

| Function                                   | Rule                                                                                        | Error                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------ |
| `validateReadableFile(resolvedPath, stat)` | Rejects non-regular files (`not-a-file`) alongside missing, directory, and unreadable (D17) | `Path is not a regular file: <path>` |

## Queries (`src/local-file-conversion/queries.ts`)

Unchanged from Slice 01 (`markdownResult`).

## Harness

- `bun run harness live scenarios/live/convert-local-file.live.txt`: runs the offline live verification suite against
  `src/sample-data/*` with `{{REPO_ROOT}}` expanded to the workspace root.
- Piped stdin into `bun run harness` / `bun run harness --live` exits cleanly even when an async live command resolves
  after stdin EOF.

## Placeholders

_(None.)_

## Tests

- **Domain unit test** (`src/local-file-conversion/local-file-conversion.test.ts`): `validateReadableFile` rejects `{ kind: "not-a-file" }`.
- **Live integration tests** (`src/integrations/live.test.ts`): `statRealLocalFile` (`file`, `directory`, `missing`, `unreadable` via `chmod 0o000` and `EACCES` on `statSync`, `not-a-file` via `/dev/null` on POSIX), live symlink escape refusal and in-bounds symlink conversion via `createLiveWorld`, and replaying `scenarios/live/convert-local-file.live.txt`.
- **Live runner & REPL tests** (`cli/live.test.ts`): `parseLive` expands `{{REPO_ROOT}}` variables, and piped stdin into `bun run harness --live` exits cleanly without `ERR_USE_AFTER_CLOSE`.
- **Live suite:** `scenarios/live/convert-local-file.live.txt`.
