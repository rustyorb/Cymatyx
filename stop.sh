#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$ROOT_DIR/.cymatyx.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "[cymatyx] No PID file found. Nothing to stop."
  exit 0
fi

PID=$(cat "$PID_FILE")
if ps -p "$PID" > /dev/null 2>&1; then
  echo "[cymatyx] Stopping PID $PID"
  kill "$PID" || true
else
  echo "[cymatyx] Process $PID not running."
fi
rm -f "$PID_FILE"
