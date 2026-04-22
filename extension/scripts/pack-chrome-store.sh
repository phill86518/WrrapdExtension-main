#!/usr/bin/env bash
# Copy a minimal Chrome Web Store upload tree into ../CHROME WEB STORE/
# Run from repo root: bash extension/scripts/pack-chrome-store.sh
# Or from extension/: bash scripts/pack-chrome-store.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/CHROME WEB STORE"
if [[ ! -f "$ROOT/manifest.json" ]]; then
  echo "Expected manifest.json in $ROOT" >&2
  exit 1
fi
if [[ ! -f "$ROOT/content.js" ]]; then
  echo "Missing content.js — run: cd \"$ROOT\" && npm run build" >&2
  exit 1
fi
mkdir -p "$OUT"
rm -f "$OUT/manifest.json" "$OUT/content.js" "$OUT/rules.json"
rm -rf "$OUT/assets"
mkdir -p "$OUT/assets"
cp "$ROOT/manifest.json" "$ROOT/content.js" "$ROOT/rules.json" "$OUT/"
cp -R "$ROOT/assets/." "$OUT/assets/"
echo "OK: Chrome Web Store pack at \"$OUT\""
echo "Zip from inside that folder: zip -r ../wrrapd-chrome-store.zip manifest.json content.js rules.json assets"
