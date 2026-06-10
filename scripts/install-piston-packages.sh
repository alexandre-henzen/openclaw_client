#!/bin/sh
# Idempotent installer for Piston language runtimes.
# Runs once per compose up; checks each runtime via /api/v2/runtimes and
# POSTs to /api/v2/packages only when missing. Safe to re-run.
#
# RUN_CODE_TOOL_SPEC §5. Backend default for the run_code native gateway tool.
set -eu

PISTON="${PISTON_URL:-http://piston:2000/api/v2}"

# Wait for piston readiness (depends_on healthy should cover, this is a belt+suspenders).
i=0
until curl -sf "$PISTON/runtimes" >/dev/null 2>&1; do
  i=$((i+1))
  if [ "$i" -gt 30 ]; then
    echo "[piston-packages-setup] timeout waiting for $PISTON" >&2
    exit 1
  fi
  sleep 1
done

RUNTIMES_JSON=$(curl -sf "$PISTON/runtimes")

# Piston reports installed runtimes with their canonical language string,
# which doesn't always match the install-side language ("node" installs as
# language="javascript" with runtime="node"). We pass the runtime listing's
# expected language separately so the idempotency check is reliable.
install_pkg() {
  install_lang="$1"  # language used by POST /packages
  ver="$2"
  runtime_lang="$3" # language as it appears in GET /runtimes
  if echo "$RUNTIMES_JSON" | grep -q "\"language\":\"$runtime_lang\",\"version\":\"$ver\""; then
    echo "[piston-packages-setup] $install_lang $ver already installed"
    return 0
  fi
  echo "[piston-packages-setup] installing $install_lang $ver ..."
  resp=$(curl -sS -X POST -H 'Content-Type: application/json' \
    -d "{\"language\":\"$install_lang\",\"version\":\"$ver\"}" \
    "$PISTON/packages") || true
  echo "[piston-packages-setup] $install_lang $ver: $resp"
  # Verify by re-reading runtimes regardless of POST status (handles races
  # and "already installed" 5xx responses uniformly).
  if curl -sf "$PISTON/runtimes" | grep -q "\"language\":\"$runtime_lang\",\"version\":\"$ver\""; then
    return 0
  fi
  echo "[piston-packages-setup] $install_lang $ver did not appear in /runtimes" >&2
  return 1
}

install_pkg python 3.12.0   python
install_pkg node   20.11.1  javascript
install_pkg bash   5.2.0    bash

echo "[piston-packages-setup] done"
