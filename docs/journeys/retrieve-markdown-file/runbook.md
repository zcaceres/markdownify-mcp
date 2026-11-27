# Runbook: Retrieve Markdown File

How a person, or an agent, walks the journey by hand. Everything that can be scripted is a scenario, listed below; the
[acceptance criteria](acceptance-criteria.md) each step shows are in brackets.

## Before you start

```bash
bun install --frozen-lockfile
bun run build
bun run harness     # interactive (mock); or bun run harness --live
```

## Scenarios

| Scenario                                                         | Shows                                                                                                                                                                                         |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scenarios/retrieve-markdown-file/01-retrieve-markdown-file.txt` | Request, path shape, case-insensitive `.md`/`.markdown`, HTTP fail-closed, Allowed Paths, escaping & `.md -> .txt` symlink refusal, target stat checks, verbatim read & realpath [RM-1..RM-7] |

```bash
bun run harness run scenarios/retrieve-markdown-file
bun run harness live scenarios/live/retrieve-markdown-file.live.txt
```

| Live suite                                       | Shows                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `scenarios/live/retrieve-markdown-file.live.txt` | Real Markdown File retrieval (`README.md`, `REQUIREMENTS.md`), live `Allowed Paths`, `D17`, `D24`, and `D9`/`D23` [RM-8] |

## By hand

_(No manual steps required — `get-markdown-file` reads local files directly without external CLIs or network access. Live host filesystem and symlink verification is automated in Slice 02.)_
