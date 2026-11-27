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

| Scenario                                                         | Shows                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scenarios/convert-local-file/01-basic-local-file.txt`           | Tracer bullet: request & absolute/`~` path validation, pre-validation of missing/directory/unreadable files, conversion across all 6 file tools, empty output, HTML-prefixed text preserved, missing binary, and `MissingDependencyException` hint [LF-1, LF-2, LF-5, LF-6, LF-7, LF-8, LF-9, LF-11] |
| `scenarios/convert-local-file/02-allowed-paths-and-symlinks.txt` | `MD_ALLOWED_PATHS` containment before existence checks, `..` / prefix-sibling / symlink escape refusal, empty `MD_ALLOWED_PATHS` fail-closed rejection (D24), and HTTP fail-closed disabled policy with D23 opt-out [LF-3, LF-4]                                                                     |

```bash
bun run harness run scenarios/convert-local-file
```

## By hand

### 1. Slim Docker image check (`markitdown[pdf]`)

1. Build and run the Docker image with `src/sample-data` mounted read-only at `/data` and `MD_ALLOWED_PATHS=/data` (or run `bash scripts/docker-smoke-test.sh`).
2. Call `pdf-to-markdown` with `/data/test.pdf`.
   - Expect Markdown containing `Test PDF content`, no `Output file:` line, and `isError: false`. [LF-6, LF-11]
3. Call `audio-to-markdown` inside the slim Docker container.
   - Expect `isError: true` with an actionable hint noting that the format requires `markitdown[all]` (local install) rather than the slim Docker `pdf` profile. [LF-9]
