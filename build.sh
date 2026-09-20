#!/usr/bin/env bash
# Build the three installable tarballs into dist/.
# Usage: ./build.sh
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist
(cd host && pnpm build && pnpm pack --pack-destination ../dist)
(cd client && pnpm build && pnpm pack --pack-destination ../dist)
(cd bundle && pnpm pack --pack-destination ../dist)
