#!/usr/bin/env bash
# get_json_dep.sh – download nlohmann/json single-header if not already present.
# Run once before building:  bash cpp/get_json_dep.sh
set -euo pipefail

DEST="cpp/include/json.hpp"
URL="https://github.com/nlohmann/json/releases/download/v3.11.3/json.hpp"

if [ -f "$DEST" ]; then
  echo "✓ $DEST already present – skipping download."
  exit 0
fi

echo "Downloading nlohmann/json v3.11.3 → $DEST …"
mkdir -p "$(dirname "$DEST")"
if command -v curl &>/dev/null; then
  curl -fsSL "$URL" -o "$DEST"
elif command -v wget &>/dev/null; then
  wget -qO "$DEST" "$URL"
else
  echo "Error: neither curl nor wget found." >&2
  exit 1
fi
echo "✓ Done."
