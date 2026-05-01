#!/usr/bin/env bash
# End-to-end smoke test: build the image, mount sample-data, convert a PDF
# over the MCP stdio transport, assert the output looks right.
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE="${IMAGE:-markdownify-mcp:smoke}"
SAMPLE_DIR="$PWD/src/sample-data"
EXPECTED_SUBSTRING="Test PDF content"

if [[ ! -f "$SAMPLE_DIR/test.pdf" ]]; then
  echo "missing $SAMPLE_DIR/test.pdf" >&2
  exit 1
fi

echo "==> building $IMAGE"
docker build -t "$IMAGE" . >/dev/null

echo "==> running pdf-to-markdown via stdio"
output=$({
  printf '%s\n' \
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
    '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
    '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"pdf-to-markdown","arguments":{"filepath":"/data/test.pdf"}}}'
  sleep 5
} | docker run --rm -i \
    -v "$SAMPLE_DIR:/data:ro" \
    -e MD_ALLOWED_PATHS=/data \
    "$IMAGE")

echo "$output"

if ! grep -q '"id":2' <<<"$output"; then
  echo "FAIL: no response to tools/call" >&2
  exit 1
fi

if grep -q '"isError":true' <<<"$output"; then
  echo "FAIL: tools/call returned isError:true" >&2
  exit 1
fi

if ! grep -q "$EXPECTED_SUBSTRING" <<<"$output"; then
  echo "FAIL: expected output to contain '$EXPECTED_SUBSTRING'" >&2
  exit 1
fi

echo "==> PASS"
