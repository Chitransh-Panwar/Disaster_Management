# Disaster Management – IDRPS (India Disaster Response Planning System)

An interactive, browser-based disaster-response planning tool focused on:

- **Route planning** (shortest safe paths, return-to-base routing)
- **Spread / reachability analysis** (how impact propagates through a network)
- **Critical network detection** (bridges / single points of failure)
- **Resource allocation** (packing relief supplies under constraints)
- **Multi-stop planning** (good waypoint visitation order)
- **Connectivity / clustering** (DSU / Union-Find)

This project is designed to run **fully in the browser** and supports **two execution modes**:

1. **Pure JavaScript mode (default):** works immediately after cloning.
2. **C++ → WebAssembly mode (optional):** the same algorithms run in a compiled WASM module for speed; if WASM artifacts are missing, the app automatically falls back to JS.

---

## Live / Run locally

### Quick run (no build required)
Just open `index.html` in a browser, or serve the repo root:

```bash
npx serve .
# then open the shown URL
```

### Run tests
```bash
npm test
# or:
node --test tests/*.test.js
```

> Tests run using the JavaScript implementations (WASM is not required).

---

## Project structure (high level)

```
.
├── index.html
├── css/                      # UI styles
├── js/
│   ├── app.js                # App entry point (initializes app + tries initWasm)
│   ├── algo/
│   │   ├── wasmBridge.js     # Loads WASM + provides wrappers to C++ exports
│   │   ├── dijkstra.js       # Shortest path (WASM-backed with JS fallback)
│   │   ├── bfsSpread.js      # BFS levels / spread simulation
│   │   ├── tarjanBridges.js  # Bridge-finding (Tarjan)
│   │   ├── knapsack.js       # Bounded knapsack
│   │   ├── waypointOrder.js  # Nearest-neighbor + 2-opt refinement
│   │   ├── missionSim.js     # Fuel constrained mission simulation (+ return path)
│   │   ├── dsu.js            # Union-Find (connectivity)
│   │   └── wasm/             # build output (generated, git-ignored)
├── cpp/
│   ├── algo.cpp              # C++ implementations of all algorithms
│   ├── get_json_dep.sh       # downloads nlohmann/json.hpp
│   └── include/              # json.hpp goes here (generated, git-ignored)
├── build_wasm.sh             # Emscripten build script
└── tests/
```

---

## Core idea: Same algorithms, two engines

Each algorithm exists in two forms:

- A **JavaScript implementation** (always available)
- A **C++ implementation** compiled to **WebAssembly** (optional, faster)

At runtime the algorithm modules do:

- If the WASM module loaded successfully → call into WASM
- Else → use the built-in JS algorithm

So the app is **never blocked** by missing WebAssembly artifacts.

---

## Algorithms used (what + why)

### 1) Dijkstra shortest path (weighted graphs)
**Goal:** Find the minimum-distance/weight route between two nodes (e.g., shelters, hospitals, depots).

- **Used for:** route planning; also used inside **Mission Simulation** to compute the **return-to-base** path if a mission aborts.
- **Complexity:** `O((V+E) log V)` with a priority queue.

**C++ export:** `dijkstra_json`  
**JS file:** `js/algo/dijkstra.js`

**How it works (implementation notes):**
- Maintains `dist[node]` and `prev[node]`
- Uses a min-priority queue keyed by distance
- Reconstructs the path from `prev` if reachable

---

### 2) BFS spread / flood levels (unweighted reachability)
**Goal:** Compute “levels” from a start node: distance in **number of hops**.

- **Used for:** spread modeling (e.g., how quickly an effect can propagate in a road/communication graph), reachability, zone expansion.
- **Complexity:** `O(V+E)`.

**C++ export:** `bfs_levels_json`  
**JS file:** `js/algo/bfsSpread.js`

**How it works:**
- Standard queue-based BFS
- Produces a map `node -> level`

---

### 3) Tarjan bridge finding (critical links)
**Goal:** Find edges whose removal disconnects the graph (bridges).

- **Used for:** identifying **critical roads/links** (single points of failure).
- **Complexity:** `O(V+E)`.

**C++ export:** `find_bridges_json`  
**JS file:** `js/algo/tarjanBridges.js`

**How it works:**
- DFS assigns discovery times `disc[u]`
- Computes `low[u]` (lowest reachable discovery time)
- An edge `(u,v)` is a bridge if `low[v] > disc[u]`

---

### 4) Bounded knapsack (resource packing)
**Goal:** Choose quantities of items (each with weight/value and limited quantity) to maximize value under a max weight.

- **Used for:** loading relief supplies into vehicles with capacity constraints.
- **Approach:** **Binary splitting** converts bounded items into multiple 0/1 items, then classic 0/1 DP.
- **Complexity:** roughly `O(W * N')` where `N'` is split item count, `W` is max weight.

**C++ export:** `bounded_knapsack_json`  
**JS file:** `js/algo/knapsack.js`

**How it works:**
- For each item with quantity `q`, split into bundles of sizes `1,2,4,...`
- Run 0/1 DP from `W=maxWeight` down to bundle weight
- Track choices to reconstruct the chosen quantities

---

### 5) Waypoint order (multi-stop routing heuristic)
**Goal:** Given pairwise distances between waypoints, output a good visitation order (approximate TSP-like ordering).

- **Used for:** ordering multiple relief stops efficiently.
- **Approach:**  
  1. **Nearest Neighbor** heuristic to get an initial route  
  2. **2-opt** local improvement to reduce crossings and improve cost
- **Complexity:** Nearest neighbor `O(n^2)`, 2-opt typically `O(iter * n^2)`.

**C++ export:** `compute_waypoint_order_json`  
**JS file:** `js/algo/waypointOrder.js`

**How it works:**
- Start at waypoint 0
- Repeatedly pick nearest unvisited
- Apply 2-opt: reverse segments if it reduces total path cost

> Note: This is a heuristic (fast and practical), not guaranteed optimal.

---

### 6) Mission simulation (fuel-constrained planning)
**Goal:** Simulate traveling along planned segments with limited fuel/range, compute ETA, and decide whether mission aborts.

- **Used for:** operational planning: “Can we complete all stops with fuel X?”
- **Key behavior:** If fuel is insufficient mid-plan, it:
  - marks mission as **aborted**
  - determines last reachable node
  - computes **return path** to base using **Dijkstra** on the adjacency graph
- **Complexity:** linear in number of segments + one Dijkstra if abort occurs.

**C++ export:** `simulate_mission_json`  
**JS file:** `js/algo/missionSim.js`

**Outputs (conceptually):**
- total distance traveled (including return if aborted)
- ETA = distance / speed
- traveled paths
- visited vs unvisited waypoints
- abort node id and return path (if available)

---

### 7) DSU / Union-Find (connectivity)
**Goal:** Maintain components under union operations: “Which nodes are connected?”

- **Used for:** connectivity analysis, clustering, quickly testing if two nodes are in the same connected region.
- **Optimizations:** path compression + union by rank.
- **Amortized complexity:** ~`α(n)` per operation (almost constant).

**C++ exports:** `dsu_create`, `dsu_find`, `dsu_union`, `dsu_components`, `dsu_destroy`  
**JS file:** `js/algo/dsu.js`

**Important detail (WASM mode):**
- DSU is **instance-based** in C++: JS creates a DSU and receives an integer handle, then uses it for operations, then destroys it.

---

## WebAssembly + Emscripten: how it works in this project

### What Emscripten does
Emscripten compiles `cpp/algo.cpp` into two outputs:

- `js/algo/wasm/algo_module.wasm` → the WebAssembly binary
- `js/algo/wasm/algo_module.js` → the JS “glue” loader/runtime

The glue code provides a **Module** object with functions like `ccall` that allow JavaScript to call compiled C/C++ functions.

### Why JSON is used for inputs/outputs
Passing complex data structures across JS ↔ WASM can be painful (manual memory allocation, pointer management, struct layouts).

This project avoids that by using a **string boundary**:

- JS serializes inputs to JSON strings
- C++ parses JSON (via `nlohmann/json`)
- C++ returns results as JSON strings
- JS parses JSON back into objects

This makes the interface stable and easy to extend.

### The “automatic fallback” design
`js/algo/wasmBridge.js` is responsible for loading WASM:

- It uses a **dynamic import**:
  - If `js/algo/wasm/algo_module.js` exists and loads → WASM enabled
  - If not (fresh clone) → it catches the error and sets module to `null`

Each algorithm file checks availability at call time and routes to:
- WASM wrapper (fast path), or
- JS implementation (fallback path)

So **the app always runs**, regardless of whether you built WASM.

---

## Building the WASM module (optional)

### Prerequisites
1) Install and activate Emscripten SDK:
```bash
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
cd ..
```

2) Fetch `nlohmann/json` header:
```bash
bash cpp/get_json_dep.sh
```

### Build
Release build:
```bash
npm run build:wasm
# or:
bash build_wasm.sh
```

Debug build (symbols, assertions, source maps):
```bash
npm run build:wasm:debug
# or:
bash build_wasm.sh --debug
```

### Output files (generated)
```
js/algo/wasm/algo_module.js
js/algo/wasm/algo_module.wasm
```

These are typically **git-ignored** and regenerated locally.

---

## Emscripten build flags used (what they mean)

The build script (`build_wasm.sh`) uses key Emscripten settings:

- `-std=c++17` → compile as C++17
- `-O2` (or `-O0 -g` debug) → optimization / debug
- `-s WASM=1` → emit WebAssembly
- `-s MODULARIZE=1` → export as a factory function
- `-s EXPORT_NAME='createAlgoModule'` → name of the factory
- `-s EXPORTED_FUNCTIONS=[...]` → which C functions are callable from JS
- `-s EXPORTED_RUNTIME_METHODS=["ccall","cwrap"]` → allow JS calls by name/signature
- `-s ALLOW_MEMORY_GROWTH=1` → let WASM memory grow as needed
- `-s ENVIRONMENT='web,worker'` → intended runtime environments

---

## How to extend (add a new algorithm)

1) Add C++ implementation in `cpp/algo.cpp`
2) Export a `extern "C"` function that accepts/returns JSON strings (recommended)
3) Add the function name to `EXPORTED_FUNCTIONS` in `build_wasm.sh`
4) Create a wrapper in `js/algo/wasmBridge.js`
5) Add/keep a JS fallback in `js/algo/<yourAlgo>.js`
6) Rebuild WASM (`npm run build:wasm`) and test

---

## Notes / limitations

- Waypoint ordering is heuristic, not exact TSP.
- JSON marshaling is convenient but adds overhead; WASM still often wins on heavy computations.
- The shared result buffer technique in C++ is safe under the expected single-threaded browser usage.

---

## License
No license file is currently included. If you want this to be open-source, add a `LICENSE` (MIT/Apache-2.0/GPL etc.).
