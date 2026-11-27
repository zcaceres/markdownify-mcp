#!/usr/bin/env bash
# End-to-end slim Docker container check: delegates to the DD harness (D34).
set -euo pipefail

cd "$(dirname "$0")/.."
exec bun run harness docker "$@"
