#!/usr/bin/env bash
# Build the three installable tarballs into dist/ and (optionally) install them.
# Usage: ./build.sh            # pack only
#        ./build.sh install    # pack + install into a profile (set PROFILE=web)
set -euo pipefail
cd "$(dirname "$0")"
PROFILE="${PROFILE:-web}"
mkdir -p dist
(cd host && pnpm pack --pack-destination ../dist)
(cd client && pnpm pack --pack-destination ../dist)
(cd bundle && pnpm pack --pack-destination ../dist)
if [ "${1:-}" = install ]; then
  dsh plugin --profile "$PROFILE" add \
    dist/deepseek-ai-dsh-host-zai-quota-*.tgz \
    dist/deepseek-ai-dsh-client-ui-zai-quota-*.tgz \
    dist/dsh-zai-quota-bundle-*.tgz
fi
