#!/usr/bin/env bash
# Build and install the three tarballs into a dsh profile (default: web).
# Usage: ./install.sh            # PROFILE=web
#        PROFILE=desktop ./install.sh
set -euo pipefail
cd "$(dirname "$0")"
PROFILE="${PROFILE:-web}"
./build.sh
# Locate the dsh CLI: on PATH, npx cache checkout, or ~/.dsh runtimes.
DSH_BIN="${DSH_BIN:-$(command -v dsh || true)}"
if [ -z "$DSH_BIN" ]; then
  DSH_BIN="$(ls -1 "$HOME"/.npm/_npx/*/node_modules/.bin/dsh 2>/dev/null | head -1 || true)"
fi
if [ -z "$DSH_BIN" ]; then
  echo "error: dsh CLI not found; set DSH_BIN=/path/to/dsh and retry" >&2
  exit 1
fi
"$DSH_BIN" plugin --profile "$PROFILE" add \
  "$PWD/dist/deepseek-ai-dsh-host-zai-quota-"*.tgz \
  "$PWD/dist/deepseek-ai-dsh-client-ui-zai-quota-"*.tgz \
  "$PWD/dist/dsh-zai-quota-bundle-"*.tgz
echo "Installed into profile '$PROFILE'. Restart dsh and hard-refresh the page (Ctrl+Shift+R)."
