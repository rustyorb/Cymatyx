#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

PORT=${PORT:-4173}
HOST=${HOST:-0.0.0.0}
LOG_DIR="$ROOT_DIR/../../logs"
PID_FILE="$ROOT_DIR/.cymatyx.pid"
mkdir -p "$LOG_DIR"

if [ ! -d "node_modules" ]; then
  echo "[cymatyx] Installing dependencies..."
  npm install
fi

echo "[cymatyx] Starting dev server on $HOST:$PORT"
nohup npm run dev -- --host "$HOST" --port "$PORT" >"$LOG_DIR/cymatyx-dev.log" 2>&1 &
echo $! > "$PID_FILE"
echo "[cymatyx] PID $(cat "$PID_FILE") (log: $LOG_DIR/cymatyx-dev.log)"
