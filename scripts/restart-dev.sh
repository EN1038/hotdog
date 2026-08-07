#!/usr/bin/env bash
# Restart local Next.js after clearing a broken Turbopack cache.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${1:-3030}"

echo "→ Raising open-file limit…"
ulimit -n 65536 2>/dev/null || ulimit -n 10240 2>/dev/null || true

echo "→ Stopping listeners on port $PORT (if any)…"
if pids=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null); then
  echo "  kill :$PORT → $pids"
  # shellcheck disable=SC2086
  kill -9 $pids 2>/dev/null || true
  sleep 1
fi

echo "→ Clearing .next cache…"
rm -rf .next

echo "→ Prisma generate…"
npx prisma generate

echo "→ Starting Next.js (webpack) on http://127.0.0.1:$PORT …"
export WATCHPACK_POLLING="${WATCHPACK_POLLING:-true}"
exec npx next dev --webpack -H 127.0.0.1 -p "$PORT"
