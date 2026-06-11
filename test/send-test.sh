#!/usr/bin/env bash
# Simulates the GitHub Actions / JSM "send web request" call against the Worker.
# Usage:
#   WORKER_URL=http://localhost:8787 SHARED_SECRET=local-dev-secret ./test/send-test.sh
set -euo pipefail

WORKER_URL="${WORKER_URL:-http://localhost:8787}"
SHARED_SECRET="${SHARED_SECRET:-local-dev-secret}"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "POST $WORKER_URL"
curl -sS -X POST "$WORKER_URL" \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $SHARED_SECRET" \
  --data @"$DIR/sample-payload.json" | python3 -m json.tool
