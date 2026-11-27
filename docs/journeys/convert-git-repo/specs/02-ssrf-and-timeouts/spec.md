# Slice 02: Git Repository SSRF DNS Validation and Timeouts

Part of the [Convert Git Repository plan](../../plan.md). Decisions referenced as D# / U# / I# are in
[`REQUIREMENTS.md`](../../../../../REQUIREMENTS.md). Builds on [slice 01](../01-basic-git-repo/spec.md).

Covers [acceptance criteria](../../acceptance-criteria.md) GR-4 and GR-7.

## Goal

Enforce DNS-based SSRF validation (**I1**) on explicit `http(s)` Git Repository URLs and bounded `repomix` subprocess
timeouts (**D7, D28, D31**) across `src/git-repo-conversion/`, the DD harness, and `src/Markdownify.ts`:

1. Resolve DNS for explicit `http(s)` Git Repository URLs via `resolveHost` before invoking `repomix`, refusing
   unresolvable hosts and hostnames resolving to private, loopback, link-local, or reserved IP addresses (**I1**).
2. Parse `MD_REPOMIX_TIMEOUT_MS` (120s default, positive integer) via `parseGitRepoLimits`, rejecting invalid values
   before invoking `repomix` and aborting conversions exceeding the limit with `Conversion timed out after <ms>ms`
   (**D7, D8, D28, D31**).

**Done when:** the tests below pass, `bun run lint` and `bun run build` pass, and
`scenarios/convert-git-repo/02-ssrf-and-timeouts.txt` replays cleanly
(`bun run harness run scenarios/convert-git-repo/02-ssrf-and-timeouts.txt`).

## Scope

**In:** `ResolveHost` port (`src/git-repo-conversion/ports.ts`), `validateRepoDestination` and `parseGitRepoLimits`
(`src/git-repo-conversion/verbs.ts`), wiring both into `convertGitRepo`, `cli/commands/web-conversion.ts`, and
`src/Markdownify.ts`, and `scenarios/convert-git-repo/02-ssrf-and-timeouts.txt`.

**Out:**

- Live `repomix` adapter (`src/integrations/repomix/live.ts`) and `scenarios/live/convert-git-repo.live.txt` — waits for Slice 03 (`03-live-git-repo-verification`, GR-9).

## Vocabulary

- **MCP Client**, **Operator**, **Git Repository**, **Server Configuration**, **Markdown Result** _(derived)_, **convert**, **validate**.

## What it reads and writes

Uses `GitRepoConversionLimits` (`{ readonly repomixTimeoutMs: number }`) from `src/git-repo-conversion/nouns.ts`.

## Verbs (`src/git-repo-conversion/verbs.ts`)

| Function                                        | Rule                                                                                                                                            | Error                                                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `validateRepoDestination(repoUrl, resolveHost)` | For explicit `http(s)` repo URLs, resolves DNS and blocks unresolvable hosts or any private/reserved resolved IP before invoking `repomix` (I1) | `Could not resolve host "<host>" for <url>.` / `Fetching <url> is potentially dangerous, aborting.` |
| `parseGitRepoLimits(env)`                       | Parses `MD_REPOMIX_TIMEOUT_MS` as a positive integer, defaulting to `DEFAULT_REPOMIX_TIMEOUT_MS` (`120_000`) (D7, D28)                          | `Invalid MD_REPOMIX_TIMEOUT_MS "<raw>": must be a positive integer`                                 |
| `convertGitRepo(request, ports, options)`       | Runs `validateRepoDestination` before `ports.runRepomix(args, timeoutMs)` (I1, D28)                                                             | Errors from `validateRepoDestination`, `formatRepomixError`, and `checkRepomixOutput`               |

## Queries (`src/git-repo-conversion/queries.ts`)

Unchanged from Slice 01 (`markdownResult`).

## Harness

Uses existing `network dns <host> <ip...>`, `network dns-fail <host>`, `config set MD_REPOMIX_TIMEOUT_MS <value>`,
`repomix slow <duration>`, `clock`, and `convert git-repo-to-markdown`.

## Placeholders

_(None — default 120s timeout and `MD_REPOMIX_TIMEOUT_MS` override are settled by D28.)_

## Tests

- **Example tests** (`src/git-repo-conversion/git-repo-conversion.test.ts`): unit tests for `validateRepoDestination` (shorthand skipped, public IP passes, private resolved IP blocked, DNS failure blocked), `parseGitRepoLimits` (default `120_000`, positive integer, whitespace, rejecting `0`, negative, float, non-numeric, unsafe integer), and `convertGitRepo` (DNS SSRF checked before `runRepomix`, timeout enforcement).
- **Markdownify tests** (`src/Markdownify.test.ts`): verify invalid `MD_REPOMIX_TIMEOUT_MS` fails `Markdownify.fromRepo` before invoking `repomix`.
- **Scenario:** `scenarios/convert-git-repo/02-ssrf-and-timeouts.txt`.
