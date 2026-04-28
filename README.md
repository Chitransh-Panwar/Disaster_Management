# Disaster Management – IDRPS (India Disaster Response Planning System)

An interactive browser-based tool for disaster response route planning, resource allocation, and network analysis.  Algorithm logic is implemented in **C++** (see `cpp/algo.cpp`) and compiled to **WebAssembly** via [Emscripten](https://emscripten.org).  When the WASM module is not yet built, the app automatically falls back to equivalent pure-JavaScript implementations so it always runs out of the box.

---

## Algorithms

| Algorithm | C++ function(s) | JS file |
|-----------|-----------------|---------|
| Dijkstra shortest path | `dijkstra_json` | `js/algo/dijkstra.js` |
| BFS spread / flood levels | `bfs_levels_json` | `js/algo/bfsSpread.js` |
| Tarjan bridge finding | `find_bridges_json` | `js/algo/tarjanBridges.js` |
| Bounded knapsack (resource packing) | `bounded_knapsack_json` | `js/algo/knapsack.js` |
| Waypoint order (nearest-neighbour + 2-opt) | `compute_waypoint_order_json` | `js/algo/waypointOrder.js` |
| Mission simulation (fuel-constrained route) | `simulate_mission_json` | `js/algo/missionSim.js` |
| DSU / Union–Find | `dsu_create/find/union/components/destroy` | `js/algo/dsu.js` |

All seven algorithms are implemented in `cpp/algo.cpp` and compiled to a single WASM module (`js/algo/wasm/algo_module.{js,wasm}`).

---

## Running the app

Open `index.html` in a browser (or serve the repo root with any static file server, e.g. `npx serve .`).

- **Without building WASM**: the app works immediately using the pure-JavaScript algorithm implementations.
- **With WASM built**: the app loads the compiled C++ module on startup; all algorithm calls are dispatched to the WASM module automatically.

---

## Building the WebAssembly module

### Prerequisites

1. **Emscripten SDK** – install and activate once:

   ```bash
   git clone https://github.com/emscripten-core/emsdk.git
   cd emsdk
   ./emsdk install latest
   ./emsdk activate latest
   source ./emsdk_env.sh   # run this in every new shell session
   cd ..
   ```

2. **nlohmann/json** single-header (downloaded automatically by the build script, or manually):

   ```bash
   bash cpp/get_json_dep.sh
   ```

### Build

```bash
# Release build (optimised)
npm run build:wasm
# or directly:
bash build_wasm.sh

# Debug build (adds -g, assertions, source maps)
npm run build:wasm:debug
# or:
bash build_wasm.sh --debug
```

The build outputs two files:

```
js/algo/wasm/algo_module.js    ← Emscripten JS glue
js/algo/wasm/algo_module.wasm  ← compiled WebAssembly binary
```

These are listed in `.gitignore` and must be regenerated locally after any changes to `cpp/algo.cpp`.

### Verify

Open `index.html` (or serve with `npx serve .`) and check the browser console.  You should see no errors; algorithm buttons (Dijkstra ▶, BFS Spread ▶, etc.) will exercise the WASM module.

---

## Project structure

```
├── cpp/
│   ├── algo.cpp            ← C++ implementations of all algorithms
│   ├── get_json_dep.sh     ← downloads nlohmann/json.hpp
│   └── include/            ← place for json.hpp (git-ignored)
├── js/
│   ├── algo/
│   │   ├── wasmBridge.js   ← WASM loader + thin JS wrappers
│   │   ├── dijkstra.js     ← WASM-backed (JS fallback)
│   │   ├── dsu.js          ← WASM-backed (JS fallback)
│   │   ├── bfsSpread.js    ← WASM-backed (JS fallback)
│   │   ├── knapsack.js     ← WASM-backed (JS fallback)
│   │   ├── tarjanBridges.js← WASM-backed (JS fallback)
│   │   ├── waypointOrder.js← WASM-backed (JS fallback)
│   │   ├── missionSim.js   ← WASM-backed (JS fallback)
│   │   └── wasm/           ← generated build artifacts (git-ignored)
│   ├── app.js              ← app entry-point (calls initWasm on startup)
│   └── …                   ← UI, state, domain modules (unchanged)
├── build_wasm.sh           ← Emscripten build script
├── package.json            ← npm scripts: build:wasm, test
├── index.html
└── tests/                  ← node:test unit tests (work with or without WASM)
```

---

## Running tests

```bash
npm test
# or:
node --test tests/*.test.js
```

Tests run with the pure-JavaScript fallbacks (no WASM required).

---

## How the WASM integration works

1. `js/app.js` calls `await initWasm()` on startup.
2. `initWasm()` (in `js/algo/wasmBridge.js`) tries to dynamically import the Emscripten module (`js/algo/wasm/algo_module.js`).  If the file is absent or fails to load, it silently sets the module to `null`.
3. Each algorithm module (`dijkstra.js`, `dsu.js`, …) checks `getWasmModule()` at call time:
   - **Module available** → serialises arguments to JSON, calls the corresponding `ccall` export, deserialises the result.
   - **Module null** → runs the inline pure-JavaScript implementation.

This means the app always works and the switch to WASM is transparent.
