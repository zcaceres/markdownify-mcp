# Runbook: Serve & Configure Server

How a person, or an agent, walks the journey by hand. Everything that can be scripted is a scenario, listed below; the
[acceptance criteria](acceptance-criteria.md) each step shows are in brackets.

## Before you start

```bash
bun install --frozen-lockfile
bun run build
bun run harness     # interactive (mock)
```

## Scenarios

| Scenario                                                             | Shows                                                                                                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scenarios/serve-and-configure-server/01-config-and-http-guards.txt` | Default & CLI-override Server Configuration, D32 unknown-flag rejection, HTTP 404/405 routing, Host/Origin 403 guards (I5), and startup notices [SC-1, SC-2, SC-4..SC-7] |

```bash
bun run harness run scenarios/serve-and-configure-server
```

## By hand / Opt-in container verification

### 1. Slim Docker container check (`D4, D11, D22, D34`)

Requires a running local Docker daemon:

```bash
bun run harness docker
# or:
bash scripts/docker-smoke-test.sh
```

Expect `tools/list` to return all 11 stable tools (`D3`), `pdf-to-markdown` on `/data/test.pdf` to succeed (`Test PDF content`), `/etc/passwd` to be refused by `MD_ALLOWED_PATHS` (`I2`), and `docx-to-markdown` on the binary `.docx` probe (`/slim-probe/sample.docx`) to fail with the `D22` slim-Docker `markitdown[all]` hint. [SC-9]
