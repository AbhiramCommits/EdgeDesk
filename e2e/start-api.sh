#!/usr/bin/env bash
# Starts a fresh local EdgeDesk API for the Playwright suite.
# Deletes all local Wrangler state so D1, KV, and Durable Objects start clean.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

rm -rf packages/api/.wrangler

pnpm migrate
pnpm seed

cd packages/api
exec ./node_modules/.bin/wrangler dev --local --ip 127.0.0.1 --port 8787
