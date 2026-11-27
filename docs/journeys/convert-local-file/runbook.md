# Runbook: Convert Local File

How a person, or an agent, walks the journey by hand: what needs a real filesystem, real symlinks, or a real
`markitdown` installation (local `all` profile vs slim Docker `pdf` profile). Everything that can be scripted is a
scenario, listed below; the [acceptance criteria](acceptance-criteria.md) each step shows are in brackets.

## Before you start

```bash
bun install --frozen-lockfile
bun run build
bun run harness     # interactive (mock); or bun run harness --live
```

## Scenarios

| Scenario                                                            | Shows                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scenarios/convert-local-file/01-basic-local-file.txt`              | Tracer bullet: request & absolute/`~` path validation, pre-validation of missing/directory/unreadable files, conversion across all 6 file tools, empty output, HTML-prefixed text preserved, missing binary, and `MissingDependencyException` hint [LF-1, LF-2, LF-5, LF-6, LF-7, LF-8, LF-9, LF-11] |
| `scenarios/convert-local-file/02-allowed-paths-and-symlinks.txt`    | `MD_ALLOWED_PATHS` containment before existence checks, `..` / prefix-sibling / symlink escape refusal, empty `MD_ALLOWED_PATHS` fail-closed rejection (D24), and HTTP fail-closed disabled policy with D23 opt-out [LF-3, LF-4]                                                                     |
| `scenarios/convert-local-file/03-conversion-timeout-and-limits.txt` | Default `markitdown` timeout (`D7`, `D13`), `MD_MARKITDOWN_TIMEOUT_MS` override, and invalid limit rejection [LF-10]                                                                                                                                                                                 |

```bash
bun run harness run scenarios/convert-local-file
bun run harness live scenarios/live/convert-local-file.live.txt
```

| Live suite                                   | Shows                                                                                                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scenarios/live/convert-local-file.live.txt` | Real `src/sample-data/*` conversions (`PDF`, `DOCX`, `XLSX`, `PPTX`, `JPG`), live `Allowed Paths`, `D13` timeout, `D17` pre-validation, `D24`, and `D9` [LF-12] |

## By hand

### 1. Slim Docker image check (`D4, D11, D22, D34`)

Requires a running local Docker daemon (automated by `D34` in **Serve & Configure Server**):

```bash
bun run harness docker
# or: bash scripts/docker-smoke-test.sh
```

Verifies `pdf-to-markdown` on `/data/test.pdf` [LF-6, LF-11], `MD_ALLOWED_PATHS` blocking `/etc/passwd` [LF-4], and the `D22` slim-Docker `markitdown[all]` hint on `/data/test.docx` [LF-9].
