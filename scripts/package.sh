#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Rastin — Build / Packaging Script
# ──────────────────────────────────────────────────────────────
# Creates a clean .zip for Chrome Web Store submission.
# Usage:  bash scripts/package.sh
# Output: rastin-v{VERSION}.zip in the project root.
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(grep '"version"' manifest.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
ZIP="rastin-v${VERSION}.zip"

echo "→ Packaging Rastin v${VERSION} ..."

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

rsync -a \
  --exclude='.git/' \
  --exclude='.githooks/' \
  --exclude='.claude/' \
  --exclude='*.log' \
  --exclude='*.crx' \
  --exclude='*.pem' \
  --exclude='node_modules/' \
  --exclude='package*.json' \
  --exclude='yarn*' \
  --exclude='pnpm*' \
  --exclude='build/' \
  --exclude='dist/' \
  . "$TMPDIR"

cd "$TMPDIR"
zip -rq "$ZIP" . -x '*.DS_Store'
mv "$ZIP" "$OLDPWD/$ZIP"

echo "✓ Created:  $ZIP  ($(du -h "$OLDPWD/$ZIP" | cut -f1))"
