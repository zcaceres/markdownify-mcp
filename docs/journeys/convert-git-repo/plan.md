# Convert Git Repository: Plan

How the journey is built, slice by slice. What it must do is in its [acceptance criteria](acceptance-criteria.md);
decisions (D#) and questions (U#) are in [`REQUIREMENTS.md`](../../../REQUIREMENTS.md).

## Sources

The designs and existing code behind this journey, from its design session (2026-11-26).

- [REQUIREMENTS.md](../../../REQUIREMENTS.md): system decisions D1–D31, invariants I1–I5 (U2 resolved by D28).
- [src/tools.ts](../../../src/tools.ts), [src/server.ts](../../../src/server.ts), [src/Markdownify.ts](../../../src/Markdownify.ts), [src/utils.ts](../../../src/utils.ts): existing `git-repo-to-markdown` tool, `Markdownify.fromRepo`, `validateRepoUrl`, `validateBranchName`, and `resolveRepomixPath`.
- [src/shared/ip.ts](../../../src/shared/ip.ts) & [src/integrations/network/](../../../src/integrations/network/): existing SSRF IP helpers and `resolveHost` port/adapters.

## Shape

An **MCP Client** calls `git-repo-to-markdown` with `{ url, branch?, compress? }`. The server validates the request
arguments (`D8`), validates the **Git Repository** identifier (public `http(s)` URL without embedded credentials,
`D29`, or GitHub `owner/repo` shorthand; rejecting `file://`, `ssh://`, scp-style SSH, shell metacharacters, and flag
injection, `I1, I3`) and optional branch/tag/commit ref (`I3`), validates DNS on explicit `http(s)` URLs against SSRF
rules (`I1`), parses `MD_REPOMIX_TIMEOUT_MS` (120s default, `D7, D28`), invokes `repomix` via `execFile` (`I3`) with a
100 MB stdout buffer (`D7`), rejects empty or whitespace-only output (`D30`), formats missing/timeout/non-zero failures
cleanly (`D31`), and returns a derived **Markdown Result** (`text` only, `D5`) or a structured MCP tool error
(`isError: true`, `D8`), remaining available in HTTP mode even when `MD_ALLOWED_PATHS` is unset (`D6, D9`).

## Contexts, verbs and queries

Where this journey lives in the code. Each noun is a type in the context's `nouns.ts`. Each verb is a function in its
`verbs.ts`, and each derived noun a function in its `queries.ts`.

| Context                    | Nouns                                                                                                         | Verbs                                                                                                                                                       | Queries          | Harness commands                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------- |
| `src/git-repo-conversion/` | `GitRepoIdentifier`, `GitBranchName`, `GitRepoConversionRequest`, `GitRepoConversionLimits`, `MarkdownResult` | `validateGitRepoRequest`, `validateRepoDestination`, `parseGitRepoLimits`, `buildRepomixArgs`, `formatRepomixError`, `checkRepomixOutput`, `convertGitRepo` | `markdownResult` | `convert git-repo-to-markdown <repo> [--branch=<ref>] [--compress]` |

## External systems

Every system outside ours is mocked in `src/integrations/<system>/` (with live counterparts in `live.ts`); world
commands make it do what the journey needs.

| System    | What we need from it                                                                          | World commands                                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `repomix` | Run `repomix` with an explicit argument array and timeout to pack a remote repo into Markdown | `repomix stub <text...>`, `repomix empty`, `repomix fail <reason>`, `repomix missing`, `repomix slow <duration>`, `repomix last-args` |
| `network` | Resolve hostnames for SSRF validation on explicit `http(s)` Git Repository URLs               | `network dns <host> <ip...>`, `network dns-fail <host>`                                                                               |
| `clock`   | Deterministic time for `repomix` timeout checks                                               | `clock`, `clock advance <duration>`, `clock set <time>`                                                                               |
| `config`  | `MD_REPOMIX_TIMEOUT_MS` and `MCP_TRANSPORT`                                                   | `config set <VAR> <value>`, `config clear <VAR>`                                                                                      |

## Slices

Each slice is one capability, wired through every part of the system (harness commands, verbs, ports, mocks) with a
scenario that runs it. Each has a [spec](specs/) and a scenario in `scenarios/convert-git-repo/`.

### Done

1. **01-basic-git-repo.** Tracer bullet: validate `git-repo-to-markdown` request, repository URL/shorthand (blocking schemes, scp-SSH, embedded credentials D29, flag/shell injection) and optional branch/compress, build explicit `repomix` argument array (`I3`), run via mock `repomix` adapter, reject empty/whitespace output (`D30`), format errors cleanly (`D31`), verify HTTP availability when `MD_ALLOWED_PATHS` is unset (`D9`), and align `src/utils.ts`, `src/Markdownify.ts`, and `src/server.ts`. Covers GR-1, GR-2, GR-3, GR-5, GR-6, GR-8.
   ([spec](specs/01-basic-git-repo/spec.md), `scenarios/convert-git-repo/01-basic-git-repo.txt`)
2. **02-ssrf-and-timeouts.** Enforce DNS SSRF validation (`I1`) on explicit `http(s)` Git Repository URLs via `resolveHost` and enforce `MD_REPOMIX_TIMEOUT_MS` (120s default, `D28`) with deterministic clock advancement and invalid limit rejection. Covers GR-4, GR-7.
   ([spec](specs/02-ssrf-and-timeouts/spec.md), `scenarios/convert-git-repo/02-ssrf-and-timeouts.txt`)
3. **03-live-git-repo-verification.** Add `src/integrations/repomix/live.ts`, `scenarios/live/convert-git-repo.live.txt`, and live `repomix` tests verifying `octocat/Hello-World` (with branch & compress), live SSRF blocking, and real subprocess timeout. Covers GR-9.
   ([spec](specs/03-live-git-repo-verification/spec.md), `scenarios/live/convert-git-repo.live.txt`)

### Next

_(All planned slices for Convert Git Repository are complete; 9/9 acceptance criteria hold.)_

## Deferred

- Private repository authentication tokens or custom Git credentials (explicitly excluded by D29).
- Packing local directories via `repomix` (remote Git Repositories only).
- Custom `repomix` include/ignore glob filters or non-Markdown output styles.
