# Slice 01: Basic Git Repository Conversion

Part of the [Convert Git Repository plan](../../plan.md). Decisions referenced as D# / U# / I# are in
[`REQUIREMENTS.md`](../../../../../REQUIREMENTS.md).

Covers [acceptance criteria](../../acceptance-criteria.md) GR-1, GR-2, GR-3, GR-5, GR-6, and GR-8.

## Goal

Wire the narrowest end-to-end path an **MCP Client** recognizes for **Convert Git Repository**: validate
`git-repo-to-markdown` arguments (**D3, D8**), validate Git Repository URLs (public `http(s)` without embedded
credentials, **D29**) and GitHub `owner/repo` shorthands (blocking `file://`, `ssh://`, scp-style SSH, shell
metacharacters, and flag injection, **I1, I3**), validate optional branch/tag/commit refs (**I3**), build an explicit
`repomix` argument array (**I3**), run `repomix` via the mock adapter, reject empty or whitespace-only stdout
(**D30**), format missing-binary and non-zero exit errors cleanly (**D31**), confirm availability in HTTP mode when
`MD_ALLOWED_PATHS` is unset (**D6, D9**), and align `src/utils.ts`, `src/Markdownify.ts`, and `src/server.ts`.

**Done when:** the tests below pass, `bun run lint` and `bun run build` pass, and
`scenarios/convert-git-repo/01-basic-git-repo.txt` replays cleanly
(`bun run harness run scenarios/convert-git-repo/01-basic-git-repo.txt`).

## Scope

**In:** `src/git-repo-conversion/` (`nouns.ts`, `ports.ts`, `queries.ts`, `verbs.ts`, `git-repo-conversion.test.ts`),
`src/integrations/repomix/mock.ts` (and stub/live placeholder wiring in `cli/world.ts`), `cli/commands/repomix.ts`,
extending `convert` in `cli/commands/web-conversion.ts` for `git-repo-to-markdown`, and aligning `src/utils.ts`,
`src/Markdownify.ts`, and `src/server.ts` (`D29, D30, D31`).

**Out:**

- DNS SSRF resolution (`resolveHost`) on explicit `http(s)` repository URLs and `MD_REPOMIX_TIMEOUT_MS` timeout enforcement — waits for Slice 02 (`02-ssrf-and-timeouts`, GR-4, GR-7).
- Live `repomix` adapter (`src/integrations/repomix/live.ts`) and `scenarios/live/convert-git-repo.live.txt` — waits for Slice 03 (`03-live-git-repo-verification`, GR-9).

## Vocabulary

- **MCP Client**, **Git Repository**, **Markdown Result** _(derived)_, **convert**, **validate**.

## What it reads and writes

| Payload                      | Shape                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `GitRepoIdentifier`          | `Brand<string, "GitRepoIdentifier">`                                                                   |
| `GitBranchName`              | `Brand<string, "GitBranchName">`                                                                       |
| `GitRepoConversionRequest`   | `{ readonly repoUrl: GitRepoIdentifier; readonly branch?: GitBranchName; readonly compress: boolean }` |
| `MarkdownResult` _(derived)_ | `{ readonly text: string }` (no `path`; D5)                                                            |

## Verbs (`src/git-repo-conversion/verbs.ts`)

| Function                                        | Rule                                                                                                                                                                                                                                                                                                                                  | Error                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validateGitRepoRequest(url, branch, compress)` | Requires non-empty string `url` (public `http(s)` without embedded credentials per D29, or valid GitHub shorthand per `isValidRemoteValue`, rejecting `file://`, `ssh://`, scp-style SSH, private IPs/localhost, shell metacharacters, flag injection), optional safe `branch` ref, and optional boolean `compress` (D8, D29, I1, I3) | `Repository URL is required` / `Only http: and https: repository URLs are allowed.` / `Repository URLs with embedded credentials are not allowed.` / `Fetching <url> is potentially dangerous, aborting.` / `Repository shorthand "<url>" uses scp-style SSH syntax, which is not allowed. Use an http(s) URL (e.g. https://github.com/owner/repo).` / `Invalid repository URL or shorthand: <url>. Use a GitHub URL (https://github.com/owner/repo) or shorthand (owner/repo).` / `Invalid branch name: must not be empty.` / `Invalid branch name "<branch>". Branch names must not start with "-" or contain unsafe characters.` / `Invalid compress option: must be a boolean` |
| `buildRepomixArgs(request)`                     | Builds `["--remote", repoUrl, "--style", "markdown", "--stdout", "--quiet"]` plus `["--remote-branch", branch]` if set and `["--compress"]` if `compress` is true (I3)                                                                                                                                                                | _(infallible)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `checkRepomixOutput(stdout, stderr)`            | Rejects empty or whitespace-only stdout (D30)                                                                                                                                                                                                                                                                                         | `repomix produced no output` / `repomix produced no output: <stderr>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `formatRepomixError(error)`                     | Formats `missing`, `timeout`, and `failed` errors cleanly (D8, D31)                                                                                                                                                                                                                                                                   | `repomix executable not found` / `Conversion timed out after <ms>ms` / `Conversion failed: <reason>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `convertGitRepo(request, ports, options)`       | Builds args, runs `ports.runRepomix`, validates non-empty output (D30), returns `gitRepoMarkdownResult(stdout)` (D5, I3)                                                                                                                                                                                                              | Errors from `formatRepomixError` and `checkRepomixOutput`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## Queries (`src/git-repo-conversion/queries.ts`)

| Function                      | Definition                              |
| ----------------------------- | --------------------------------------- |
| `gitRepoMarkdownResult(text)` | Computes `{ text }` with no `path` (D5) |

## Harness

| Command                                                             | Kind   | What it does                                                                                                            |
| ------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| `convert git-repo-to-markdown [repo] [--branch=<ref>] [--compress]` | domain | Validates request, invokes mock `repomix`, prints `ok: git-repo-to-markdown (path: none)` + `\| <line>` or `error: ...` |
| `repomix stub <text...>`                                            | world  | Sets the mock `repomix` stdout returned on the next conversion                                                          |
| `repomix empty`                                                     | world  | Makes mock `repomix` exit 0 with whitespace-only stdout                                                                 |
| `repomix fail <reason...>`                                          | world  | Makes mock `repomix` fail with a non-zero exit error                                                                    |
| `repomix missing`                                                   | world  | Makes mock `repomix` return `ENOENT` (executable not found)                                                             |
| `repomix slow <duration>`                                           | world  | Sets simulated latency for mock `repomix`                                                                               |
| `repomix last-args`                                                 | world  | Prints the argument array passed to the last `repomix` invocation (or `(none)`)                                         |

## Placeholders

_(None — all rules in Slice 01 are settled by D3, D5, D6, D8, D9, D29, D30, D31, I1, and I3.)_

## Tests

- **Example tests** (`src/git-repo-conversion/git-repo-conversion.test.ts`): unit tests for `validateGitRepoRequest` (shorthand, `https://` URL, missing/blank, `file://`, `ssh://`, scp-style SSH, embedded credentials D29, localhost/private IP, shell/flag injection, valid/invalid branches, invalid compress), `buildRepomixArgs`, `checkRepomixOutput` (empty & whitespace-only D30), `formatRepomixError` (missing, timeout, failed D31), and `convertGitRepo`.
- **Utils, Markdownify & MCP boundary tests** (`src/utils.test.ts`, `src/Markdownify.test.ts`, `src/server.test.ts`): verify `validateRepoUrl` rejects embedded credentials (`D29`), `server.ts` routes `git-repo-to-markdown` through `validateGitRepoRequest`, and `git-repo-to-markdown` is NOT blocked in HTTP mode when `MD_ALLOWED_PATHS` is unset (`D9`).
- **Scenario:** `scenarios/convert-git-repo/01-basic-git-repo.txt`.
