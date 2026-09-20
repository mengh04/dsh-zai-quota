#!/usr/bin/env bash
# Remove the three plugins from a dsh profile (default: web).
# Usage: ./uninstall.sh
set -euo pipefail
cd "$(dirname "$0")"
PROFILE="${PROFILE:-web}"
DSH_BIN="${DSH_BIN:-$(command -v dsh || true)}"
if [ -z "$DSH_BIN" ]; then
  DSH_BIN="$(ls -1 "$HOME"/.npm/_npx/*/node_modules/.bin/dsh 2>/dev/null | head -1 || true)"
fi
if [ -z "$DSH_BIN" ]; then
  echo "error: dsh CLI not found; set DSH_BIN=/path/to/dsh and retry" >&2
  exit 1
fi
"$DSH_BIN" plugin --profile "$PROFILE" remove \
  @deepseek-ai/dsh-host-zai-quota \
  @deepseek-ai/dsh-client-ui-zai-quota \
  dsh-zai-quota-bundle
echo "Removed from profile '$PROFILE'. Restart dsh to take effect."
