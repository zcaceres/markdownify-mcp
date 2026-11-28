# Runbook: Verify Across Form Factors

How a person, or an agent, walks the journey by hand. Deterministic domain rules are scripted in mock scenarios; live
multi-form-factor and real-internet verification runs through `bun run harness e2e`. The
[acceptance criteria](acceptance-criteria.md) each step shows are in brackets.

## Before you start

```bash
bun install --frozen-lockfile
bun run build
bun run harness     # interactive (mock)
```

## Scenarios

| Scenario                                                            | Shows                                                                                                                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scenarios/verify-across-form-factors/01-e2e-domain-and-corpus.txt` | E2E CLI flag parsing & refusal, Verification Corpus manifest validation, profile-aware PASS/FAIL/BLOCKED classification, and 0/1/2 Verification Report [VF-1, VF-2, VF-5, VF-6] |

```bash
bun run harness run scenarios/verify-across-form-factors
```

## Opt-in real-internet & multi-form-factor runs

```bash
# Fast local stdio run against all 6 curated corpus categories (with Markdown previews)
bun run harness e2e --form=node-stdio --preview

# Local HTTP transport + real internet categories with JSON output
bun run harness e2e --form=local-http --category=static-web,hosted-binary --json

# Ad-hoc exploratory probe against any URL or local file
bun run harness e2e --form=node-stdio --tool=convert-web-url --url=https://www.iana.org/domains/reserved --json

# Full 6-form-factor matrix (requires running Docker daemon and network access)
bun run harness e2e --all

# Opt-in classic Toolset verification across local Form Factors
bun run harness e2e --form=node-stdio,bun-stdio,local-http --toolset=classic --category=local-binary
```

Exit codes (`D41`): `0` = all checks passed, `1` = one or more server/contract `FAIL`s, `2` = zero `FAIL`s, one or more
upstream `BLOCKED` targets. [VF-4, VF-7..VF-11]

## CI Automation

- **PR gate ([`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml)):** runs offline verification across all 6 Form Factors (`core`: lint, build, unit/HTTP/scenario tests, `node-stdio`/`bun-stdio`/`local-http` `local-binary` in `classic` + `compact`; `docker`: `docker-stdio`/`docker-http`; `npm-package`: packed tarball E2E).
- **Scheduled & manual live E2E ([`.github/workflows/e2e-live.yml`](../../../.github/workflows/e2e-live.yml)):** runs weekly and on `workflow_dispatch` across all 6 Form Factors against live internet categories, honoring `D41` exit codes (`0` pass, `2` warning on upstream `BLOCKED`, `1` fail).
