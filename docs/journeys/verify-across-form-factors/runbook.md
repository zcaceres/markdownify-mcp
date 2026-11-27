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
bun run harness e2e --form=node-stdio --tool=webpage-to-markdown --url=https://www.iana.org/domains/reserved --json

# Full 6-form-factor matrix (requires running Docker daemon and network access)
bun run harness e2e --all
```

Exit codes (`D41`): `0` = all checks passed, `1` = one or more server/contract `FAIL`s, `2` = zero `FAIL`s, one or more
upstream `BLOCKED` targets. [VF-4, VF-7..VF-11]
