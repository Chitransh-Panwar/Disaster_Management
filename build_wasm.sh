#!/usr/bin/env bash
# build_wasm.sh – compile cpp/algo.cpp → js/algo/wasm/ using Emscripten.
#
# Prerequisites:
#   1. Install Emscripten SDK  https://emscripten.org/docs/getting_started/
#      source /path/to/emsdk/emsdk_env.sh
#   2. Download nlohmann/json header:
#      bash cpp/get_json_dep.sh
#
# Usage:
#   bash build_wasm.sh          # release build
#   bash build_wasm.sh --debug  # debug build (adds -g, source-maps)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$ROOT/js/algo/wasm"
SRC="$ROOT/cpp/algo.cpp"
JSON_HDR="$ROOT/cpp/include/json.hpp"

# ── Dependency check ──────────────────────────────────────────────────────────
if ! command -v emcc &>/dev/null; then
  echo "Error: emcc not found. Install Emscripten and source emsdk_env.sh." >&2
  exit 1
fi

if [ ! -f "$JSON_HDR" ]; then
  echo "nlohmann/json header not found – fetching …"
  bash "$ROOT/cpp/get_json_dep.sh"
fi

mkdir -p "$OUT_DIR"

# ── Build flags ───────────────────────────────────────────────────────────────
OPT="-O2"
EXTRA_FLAGS=""
if [[ "${1:-}" == "--debug" ]]; then
  OPT="-O0 -g"
  EXTRA_FLAGS="-s ASSERTIONS=2 --source-map-base /js/algo/wasm/"
fi

EXPORTED_FUNCTIONS='["_dijkstra_json","_bfs_levels_json","_find_bridges_json","_bounded_knapsack_json","_compute_waypoint_order_json","_simulate_mission_json","_dsu_create","_dsu_find","_dsu_union","_dsu_components","_dsu_destroy","_malloc","_free"]'

echo "Building WASM (${OPT}) …"
emcc "$SRC" \
  -I "$ROOT/cpp/include" \
  -std=c++17 \
  $OPT \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME='createAlgoModule' \
  -s EXPORTED_FUNCTIONS="$EXPORTED_FUNCTIONS" \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s ENVIRONMENT='web,worker' \
  $EXTRA_FLAGS \
  -o "$OUT_DIR/algo_module.js"

echo "✓ Output: $OUT_DIR/algo_module.js  +  $OUT_DIR/algo_module.wasm"
