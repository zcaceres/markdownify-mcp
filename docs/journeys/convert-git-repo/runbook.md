# Runbook: Convert Git Repository

How a person, or an agent, walks the journey by hand. Everything that can be scripted is a scenario, listed below; the
[acceptance criteria](acceptance-criteria.md) each step shows are in brackets.

## Before you start

```bash
bun install --frozen-lockfile
bun run build
bun run harness     # interactive (mock); or bun run harness --live
```

## Scenarios

| Scenario                                              | Shows                                                                                                                                                                                        |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scenarios/convert-git-repo/01-basic-git-repo.txt`    | Tracer bullet: request, repo URL/shorthand (incl. D29 credentials refusal), branch validation, repomix arg building, error & empty-stdout handling, HTTP mode [GR-1..GR-3, GR-5, GR-6, GR-8] |
| `scenarios/convert-git-repo/02-ssrf-and-timeouts.txt` | DNS SSRF blocking on explicit `http(s)` repo URLs (`I1`), default 120s `repomix` timeout, `MD_REPOMIX_TIMEOUT_MS` override, and invalid limit rejection [GR-4, GR-7]                         |

```bash
bun run harness run scenarios/convert-git-repo
bun run harness live scenarios/live/convert-git-repo.live.txt
```

| Live suite                                 | Shows                                                                                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `scenarios/live/convert-git-repo.live.txt` | Live `octocat/Hello-World` conversion (default, `--branch=master`, `--compress`), live SSRF, `D29` credentials, and `D28` timeout [GR-9] |

## By hand

_(Live GitHub repository conversion requires outbound network access and is automated as an opt-in live suite in Slice 03: `bun run harness live scenarios/live/convert-git-repo.live.txt`.)_
