# 🚨 IDRPS — India Disaster Response Planning System

> An interactive, browser-based tool for disaster response route planning, resource allocation, and infrastructure network analysis — built around real Indian disaster scenarios and powered by high-performance algorithms compiled to **WebAssembly via Emscripten**.

---

## 📋 Table of Contents

- [Project Overview](#-project-overview)
- [Live Scenarios](#-live-scenarios)
- [Architecture Overview](#-architecture-overview)
- [Project Structure](#-project-structure)
- [Algorithms — Deep Dive](#-algorithms--deep-dive)
  - [Dijkstra's Shortest Path](#1-dijkstras-shortest-path)
  - [BFS Spread / Flood Level Analysis](#2-bfs-spread--flood-level-analysis)
  - [Tarjan's Bridge Finding](#3-tarjans-bridge-finding)
  - [Bounded Knapsack (Resource Packing)](#4-bounded-knapsack-resource-packing)
  - [Waypoint Order — Nearest Neighbour + 2-Opt](#5-waypoint-order--nearest-neighbour--2-opt)
  - [Mission Simulation (Fuel-Constrained Route)](#6-mission-simulation-fuel-constrained-route)
  - [DSU / Union–Find](#7-dsu--unionfind)
- [How Emscripten Works in This Project](#-how-emscripten-works-in-this-project)
  - [What is Emscripten?](#what-is-emscripten)
  - [Compilation Pipeline](#compilation-pipeline)
  - [WASM Bridge — wasmBridge.js](#wasm-bridge--wasmbridgejs)
  - [JS ↔ C++ Communication via ccall](#js--c-communication-via-ccall)
  - [Graceful JS Fallback](#graceful-js-fallback)
- [UI & Map Layer](#-ui--map-layer)
- [Data Layer](#-data-layer)
- [Running the App](#-running-the-app)
- [Building the WebAssembly Module](#-building-the-webassembly-module)
- [Running Tests](#-running-tests)
- [Technology Stack](#-technology-stack)

---

## 🗺 Project Overview

IDRPS is a front-end-only disaster response planning tool. It puts a Leaflet.js interactive map at the center of the UI and lets emergency coordinators:

- **Plan evacuation routes** between affected zones and relief camps using shortest-path algorithms.
- **Simulate disaster spread** (flood inundation, cyclone impact radius) using BFS level-order traversal.
- **Identify critical infrastructure** that, if destroyed, would disconnect the relief network (bridge detection).
- **Allocate resources** (food, medicine, manpower) optimally under capacity constraints using bounded knapsack.
- **Order multi-stop helicopter/convoy waypoints** to minimize total travel distance.
- **Simulate fuel-constrained missions** to check whether a route is feasible before dispatching.
- **Track connected components** in real time as roads become flooded or blocked using Union–Find.

The application covers **five real Indian disaster events** as scenario presets, each loading a distinct geographic graph, resource data, and log history.

---

## 🌍 Live Scenarios

| Scenario Button | Event | Type |
|---|---|---|
| **Kerala 2018** | 2018 Kerala floods | Floods |
| **Uttarakhand 2013** | Kedarnath flash floods | Flash Flood / Landslide |
| **Gujarat 2001** | Bhuj earthquake | Earthquake |
| **Chennai 2015** | Chennai floods | Urban Floods |
| **Fani 2019** | Cyclone Fani (Odisha) | Cyclone |

Each scenario loads its own road network graph, resource inventory, event log, and affected zone polygons onto the map.

---

## 🏗 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (index.html)                 │
│                                                             │
│  ┌──────────────┐   ┌───────────────────┐  ┌────────────┐  │
│  │  Leaflet.js  │   │   UI / Panels     │  │ Scenario   │  │
│  │  Map Layer   │   │ (Tools / Data /   │  │  Loader    │  │
│  │              │   │  Log / Stats)     │  │            │  │
│  └──────┬───────┘   └────────┬──────────┘  └─────┬──────┘  │
│         │                   │                    │          │
│         └───────────────────▼────────────────────┘          │
│                         app.js                              │
│                      (entry point)                          │
│                           │                                 │
│              ┌────────────▼──────────────┐                  │
│              │       wasmBridge.js        │                  │
│              │  (loads WASM or sets null) │                  │
│              └────────────┬──────────────┘                  │
│                           │                                 │
│      ┌────────────────────┼───────────────────────┐         │
│      │                    │                       │         │
│  dijkstra.js          knapsack.js          tarjanBridges.js │
│  bfsSpread.js         waypointOrder.js     missionSim.js    │
│  dsu.js                                                     │
│      │                    │                       │         │
│      │     ┌──────────────▼───────────┐           │         │
│      └────►│  algo_module.wasm (C++)  │◄──────────┘         │
│            │   or inline JS fallback  │                     │
│            └──────────────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

The WASM module is a **single compiled binary** containing all seven algorithms. The JavaScript modules are thin wrappers that either call into WASM or fall back to equivalent pure-JS implementations transparently.

---

## 📁 Project Structure

```
Disaster_Management/
│
├── index.html               ← Single-page app shell; loads Leaflet + app.js
│
├── css/
│   └── styles.css           ← Layout, panel, topbar, tab, map styles
│
├── js/
│   ├── app.js               ← Entry point; calls initWasm(), wires up UI
│   │
│   └── algo/
│       ├── wasmBridge.js    ← WASM loader; exposes getWasmModule()
│       ├── dijkstra.js      ← Shortest path (WASM + JS fallback)
│       ├── bfsSpread.js     ← Flood/spread simulation (WASM + JS fallback)
│       ├── tarjanBridges.js ← Critical bridge detection (WASM + JS fallback)
│       ├── knapsack.js      ← Bounded knapsack allocator (WASM + JS fallback)
│       ├── waypointOrder.js ← Multi-stop route optimizer (WASM + JS fallback)
│       ├── missionSim.js    ← Fuel-constrained mission check (WASM + JS fallback)
│       ├── dsu.js           ← Union–Find (WASM + JS fallback)
│       └── wasm/            ← ⚠ Git-ignored; generated by build
│           ├── algo_module.js   ← Emscripten JS glue code
│           └── algo_module.wasm ← Compiled C++ binary
│
├── cpp/
│   ├── algo.cpp             ← All algorithms in C++; exported via EMSCRIPTEN_KEEPALIVE
│   ├── get_json_dep.sh      ← Downloads nlohmann/json.hpp
│   └── include/             ← json.hpp lives here (git-ignored)
│
├── data/                    ← Scenario JSON files (road networks, resources, logs)
├── docs/                    ← Additional documentation / diagrams
├── tests/                   ← node:test unit tests for all algorithms
├── build_wasm.sh            ← Emscripten build script
└── package.json             ← npm scripts: build:wasm, build:wasm:debug, test
```

---

## 🧠 Algorithms — Deep Dive

All algorithms have two implementations that are always kept in sync:
1. **C++ in `cpp/algo.cpp`** — compiled to WebAssembly for maximum speed.
2. **Pure JavaScript in `js/algo/*.js`** — used automatically when WASM is not built.

---

### 1. Dijkstra's Shortest Path

**File:** `js/algo/dijkstra.js` | **C++ fn:** `dijkstra_json`  
**Use case:** Finding the fastest/shortest evacuation route from a source node (e.g., flooded village) to a destination node (e.g., relief camp or hospital).

**How it works:**

Dijkstra's algorithm operates on a **weighted directed graph** where nodes represent locations (junctions, camps, hospitals) and edges represent roads with a travel cost (distance or time).

1. A **min-priority queue** (min-heap) is initialized with the source node at distance `0`; all other nodes at `∞`.
2. At each step, the node with the smallest known distance is extracted from the heap.
3. For every neighbor of that node, the algorithm checks: *"Is the path through the current node shorter than the previously known path?"*
4. If yes, the neighbor's distance is updated and it's re-added to the heap.
5. The algorithm terminates when the destination is reached (or all reachable nodes are settled).
6. The **shortest path is reconstructed** by backtracking through a `previous[]` array.

**Time complexity:** O((V + E) log V) with a binary heap  
**Space complexity:** O(V + E)

**In disaster context:** When a road segment is blocked (e.g., a bridge washed away), its edge weight is set to `Infinity` to dynamically reroute around it.

---

### 2. BFS Spread / Flood Level Analysis

**File:** `js/algo/bfsSpread.js` | **C++ fn:** `bfs_levels_json`  
**Use case:** Simulating how a disaster (flood water, earthquake tremors, cyclone wind radius) spreads outward from an epicenter over time. Each BFS "level" represents one time-step of spread.

**How it works:**

BFS (Breadth-First Search) naturally explores a graph **layer by layer** from the source:

1. The origin node (e.g., point of flood origin) is enqueued at level `0`.
2. All directly connected neighbors are visited at level `1` — these are zones affected in the first time step.
3. Their unvisited neighbors are visited at level `2`, and so on.
4. The algorithm returns a map of `{ nodeId → level }`, which the UI renders as concentric colored rings on the map — darker for earlier impact, lighter for later spread.

**Time complexity:** O(V + E)  
**Space complexity:** O(V)

**In disaster context:** Used for real-time flood progression visualization — emergency managers can see which zones will be hit in the next N hours and pre-position resources accordingly.

---

### 3. Tarjan's Bridge Finding

**File:** `js/algo/tarjanBridges.js` | **C++ fn:** `find_bridges_json`  
**Use case:** Identifying **critical road segments** (bridges) whose failure would disconnect parts of the relief network. In a disaster, a single destroyed bridge can cut off thousands of people.

**How it works:**

Tarjan's bridge-finding algorithm uses a single DFS traversal and two key values per node:

- `disc[u]` — the discovery time (order in which the DFS visited node `u`)
- `low[u]` — the lowest discovery time reachable from the subtree rooted at `u` (via back-edges)

An edge `(u, v)` is a **bridge** if and only if:
```
low[v] > disc[u]
```
This means there is no back-edge from `v`'s subtree to `u` or any of `u`'s ancestors — so removing `(u, v)` disconnects the graph.

**Time complexity:** O(V + E)  
**Space complexity:** O(V)

**In disaster context:** Bridges (critical edges) are highlighted on the map in red. Relief planners can pre-deploy alternative routes or prioritize protecting/repairing these segments. This is especially critical in flood scenarios where physical bridges over rivers are literal graph bridges.

---

### 4. Bounded Knapsack (Resource Packing)

**File:** `js/algo/knapsack.js` | **C++ fn:** `bounded_knapsack_json`  
**Use case:** Given limited vehicle/helicopter cargo capacity, determine the optimal combination of supplies (food, water, medicine, blankets, rescue equipment) to maximize the total utility delivered to a disaster zone.

**How it works:**

This is the **Bounded Knapsack Problem** — a variant of the classic 0/1 knapsack where each item type has a maximum count (bounded supply).

1. The DP table `dp[w]` stores the maximum utility achievable for cargo weight `w`.
2. For each item type `i` with weight `w_i`, value `v_i`, and count limit `c_i`:
   - For each possible capacity `w` from `W` down to `0`:
     - Try placing `1, 2, ..., c_i` copies of item `i` (as long as they fit).
3. The solution is reconstructed by backtracking through the DP table.

**Time complexity:** O(W × Σ c_i) where W is total capacity  
**Space complexity:** O(W)

**In disaster context:** A helicopter departing for Kerala 2018 flood zones has a max payload. The knapsack solver determines which combination of supplies maximizes the number of people helped per sortie.

---

### 5. Waypoint Order — Nearest Neighbour + 2-Opt

**File:** `js/algo/waypointOrder.js` | **C++ fn:** `compute_waypoint_order_json`  
**Use case:** A convoy or helicopter must visit multiple relief distribution points. This algorithm finds a near-optimal visiting order to minimize total distance — a variant of the **Travelling Salesman Problem (TSP)**.

**How it works:**

This uses a two-phase heuristic:

**Phase 1 — Nearest Neighbour (greedy construction):**
1. Start from the depot (base).
2. At each step, move to the closest unvisited waypoint.
3. Return to the depot at the end.
This produces a decent initial route quickly in O(n²) time.

**Phase 2 — 2-Opt Local Search (improvement):**
1. For every pair of edges `(A→B)` and `(C→D)` in the route:
   - Check if swapping them to `(A→C)` and `(B→D)` (i.e., reversing the segment between B and C) reduces total distance.
2. Apply the improvement if yes, then restart scanning.
3. Repeat until no improving swap exists (local optimum).

**Time complexity:** Nearest neighbour O(n²); 2-Opt O(n²) per pass, multiple passes  
**Space complexity:** O(n)

**In disaster context:** A relief convoy visiting 8 villages finds the most efficient order automatically, saving fuel and critical time. The route is drawn as a polyline on the map.

---

### 6. Mission Simulation (Fuel-Constrained Route)

**File:** `js/algo/missionSim.js` | **C++ fn:** `simulate_mission_json`  
**Use case:** Before dispatching a helicopter on a multi-waypoint mission, verify whether the vehicle can complete the entire route given its fuel tank size. Simulate the mission step by step, accounting for fuel consumption per segment.

**How it works:**

1. The algorithm takes an **ordered list of waypoints** (from the waypoint ordering step), the vehicle's **total fuel**, and a **fuel cost per unit distance** parameter.
2. It walks the route segment by segment:
   - At each step, it checks: *"Do we have enough fuel to reach the next waypoint?"*
   - If yes, deduct the fuel cost and move forward.
   - If no, the mission fails at this waypoint — the result includes how far the vehicle got and the remaining fuel deficit.
3. A **feasibility report** is returned: success/failure, segment-by-segment fuel log, and remaining fuel at destination.

**Time complexity:** O(n) where n is the number of waypoints  
**Space complexity:** O(n)

**In disaster context:** Before Cyclone Fani rescue operations, mission planners verify helicopter routes are feasible, avoiding dangerous mid-mission fuel-outs over the Bay of Bengal.

---

### 7. DSU / Union–Find

**File:** `js/algo/dsu.js` | **C++ fns:** `dsu_create`, `dsu_find`, `dsu_union`, `dsu_components`, `dsu_destroy`  
**Use case:** Efficiently tracking **which parts of the road network remain connected** as roads get blocked (by floods, landslides, or debris). Also used to cluster affected villages into administrative relief zones.

**How it works:**

DSU (Disjoint Set Union) maintains a **forest of trees** where each tree represents a connected component:

- **`find(x)`** — returns the root (representative) of the component containing `x`. Uses **path compression**: flattens the tree so future finds are O(1) amortized.
- **`union(x, y)`** — merges the components of `x` and `y`. Uses **union by rank**: attaches the smaller tree under the larger one to keep trees shallow.
- **`components()`** — returns all distinct root nodes, i.e., the current set of disconnected clusters.

Path compression + union by rank together give an amortized time of **O(α(n)) ≈ O(1)** per operation, where α is the inverse Ackermann function.

**Time complexity:** O(α(n)) per union/find — effectively constant  
**Space complexity:** O(n)

**In disaster context:** As earthquake aftershocks in Gujarat 2001 block roads one by one, DSU tracks in real time how many isolated clusters exist and which villages are in each cluster, enabling targeted airlift planning.

---

## ⚙ How Emscripten Works in This Project

### What is Emscripten?

Emscripten is a **complete compiler toolchain** that takes C/C++ source code and compiles it to **WebAssembly (WASM)** — a binary instruction format that browsers execute at near-native speed, typically 10–40× faster than equivalent JavaScript for compute-heavy tasks.

Instead of `gcc` or `clang` producing a native binary, `emcc` (Emscripten's compiler) produces:
- `algo_module.wasm` — the compiled binary (runs in the browser's WASM engine)
- `algo_module.js` — a JS "glue" file generated by Emscripten that handles memory management, type marshalling, and module initialization

---

### Compilation Pipeline

```
cpp/algo.cpp
      │
      │  emcc (Emscripten compiler)
      │  flags: -O2 -s WASM=1 -s EXPORTED_FUNCTIONS=[...]
      │         -s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']
      │         -s MODULARIZE=1 -s EXPORT_NAME='AlgoModule'
      ▼
js/algo/wasm/
  ├── algo_module.js    ← Emscripten JS glue (module loader, memory bridge)
  └── algo_module.wasm  ← WebAssembly binary (all 7 algorithms)
```

The `cpp/algo.cpp` file marks each exported function with `EMSCRIPTEN_KEEPALIVE`:

```cpp
#include <emscripten.h>
#include "include/json.hpp"   // nlohmann/json for JSON serialization

extern "C" {

EMSCRIPTEN_KEEPALIVE
const char* dijkstra_json(const char* graph_json, int source, int target) {
    // Parse JSON graph, run Dijkstra, return result as JSON string
    auto graph = nlohmann::json::parse(graph_json);
    // ... algorithm logic ...
    static std::string result = output.dump();
    return result.c_str();
}

EMSCRIPTEN_KEEPALIVE
const char* bfs_levels_json(const char* graph_json, int source) { ... }

// ... all other algorithms ...
}
```

**Why `extern "C"`?** C++ mangles function names (e.g., `dijkstra_json` becomes `_Z13dijkstra_jsonPKci`). `extern "C"` disables name mangling so JavaScript can call the function by its plain name.

**Why JSON as interface?** WASM and JavaScript share a linear memory space but cannot directly exchange complex data structures (graphs, arrays of objects). The pattern used here is:
1. JS serializes its data structures to a JSON string.
2. Passes the string's pointer into WASM memory.
3. C++ parses the JSON (using **nlohmann/json**, a header-only C++ JSON library).
4. Runs the algorithm.
5. Serializes results back to a JSON string and returns a `const char*` pointer.
6. JS reads back the string from WASM memory and parses it.

---

### WASM Bridge — wasmBridge.js

`js/algo/wasmBridge.js` is the **single point of truth** for WASM availability in the app:

```javascript
// Simplified illustration of wasmBridge.js

let wasmModule = null;

export async function initWasm() {
    try {
        // Dynamic import — fails gracefully if file doesn't exist
        const { default: AlgoModuleFactory } = await import('./wasm/algo_module.js');
        wasmModule = await AlgoModuleFactory();   // Emscripten async init
        console.log('[WASM] Module loaded successfully');
    } catch (err) {
        console.warn('[WASM] Module not found, using JS fallbacks:', err.message);
        wasmModule = null;
    }
}

export function getWasmModule() {
    return wasmModule;   // null if not loaded
}
```

`app.js` calls `await initWasm()` once on startup before any algorithm is invoked.

---

### JS ↔ C++ Communication via ccall

Each algorithm module uses Emscripten's `ccall` helper to invoke the C++ function:

```javascript
// Simplified illustration from dijkstra.js

import { getWasmModule } from './wasmBridge.js';

export function dijkstra(graph, source, target) {
    const wasm = getWasmModule();

    if (wasm) {
        // ── WASM path ──────────────────────────────────────
        const graphJson = JSON.stringify(graph);        // JS object → JSON string
        const resultJson = wasm.ccall(
            'dijkstra_json',                            // C function name
            'string',                                   // return type
            ['string', 'number', 'number'],             // arg types
            [graphJson, source, target]                 // arg values
        );
        return JSON.parse(resultJson);                  // JSON string → JS object
    }

    // ── JS fallback path ───────────────────────────────────
    return dijkstraJS(graph, source, target);
}
```

`ccall` handles all the low-level work:
- Copying the JSON string into WASM's linear memory
- Converting JavaScript numbers to C `int` / `double`
- Calling the function at its memory address
- Reading the returned `const char*` back as a JavaScript string

---

### Graceful JS Fallback

Every single algorithm module (`dijkstra.js`, `dsu.js`, etc.) contains **two complete implementations**:

| Condition | What runs |
|---|---|
| `algo_module.wasm` exists (built with Emscripten) | C++ via WASM — fast |
| `algo_module.wasm` absent / failed to load | Inline JavaScript — always works |

This means the app runs **out-of-the-box in any browser** without any build step. The WASM build is an optional performance upgrade, not a requirement.

---

## 🗺 UI & Map Layer

The UI is a **single HTML file** (`index.html`) with three main regions:

### Top Bar
A navigation bar with five **scenario buttons** (`Kerala 2018`, `Uttarakhand 2013`, etc.). Clicking one loads that scenario's data, redraws the map, and repopulates all panels.

### Left Panel — Tools
A collapsible sidebar (toggle button `◀ Tools`) containing algorithm controls:
- Dijkstra route planner (source/target node selectors + run button)
- BFS spread simulator (origin + depth slider)
- Bridge finder (run button — highlights critical edges in red)
- Knapsack resource allocator (cargo capacity input)
- Waypoint order optimizer (waypoint list + run button)
- Mission simulation (fuel parameter + run button)
- DSU component viewer (real-time cluster count display)

### Right Panel — Data (3 tabs)
A collapsible sidebar (`▶ Data`) with tabbed content:
- **Resources tab** — current inventory of supplies per zone
- **Stats tab** — algorithm output statistics (path length, affected zones, component count, etc.)
- **Log tab** — timestamped event log for the active scenario

### Map
A full-screen **Leaflet.js** map renders:
- Road network graph as polylines (edges)
- Location nodes as circle markers (click to select as source/target)
- Algorithm results overlaid as colored polylines (shortest paths), heat zones (BFS levels), or red edges (bridges)
- Disaster zone polygons showing affected areas
- Resource camp and hospital markers with popup cards

---

## 📦 Data Layer

The `data/` directory contains scenario JSON files structured as:

```json
{
  "nodes": [
    { "id": 0, "name": "Ernakulam", "lat": 9.9816, "lng": 76.2999 }
  ],
  "edges": [
    { "from": 0, "to": 1, "weight": 45.2, "blocked": false }
  ],
  "resources": {
    "food": { "units": 500, "weight": 1.0, "value": 3 },
    "medicine": { "units": 200, "weight": 0.5, "value": 5 }
  },
  "log": [
    { "time": "2018-08-16T06:00:00Z", "event": "Flood alert issued for Alappuzha district" }
  ]
}
```

Edges with `"blocked": true` are excluded from graph traversal (treated as `weight = Infinity`), simulating dynamically destroyed roads.

---

## 🚀 Running the App

**No build required.** Open `index.html` in any modern browser, or use a local server:

```bash
# Option 1: npx serve (zero install)
npx serve .

# Option 2: Python built-in server
python3 -m http.server 8080

# Option 3: VS Code Live Server extension
# Right-click index.html → Open with Live Server
```

Then open `http://localhost:3000` (or whichever port is used) in your browser.

---

## 🔨 Building the WebAssembly Module

Building WASM replaces the JavaScript fallbacks with the faster C++ implementations. The app behavior is identical either way — only performance changes.

### Prerequisites

**1. Install Emscripten SDK:**
```bash
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh   # Add to .bashrc/.zshrc for persistence
cd ..
```

**2. Download nlohmann/json (C++ JSON library):**
```bash
bash cpp/get_json_dep.sh
```
This downloads the single-header `json.hpp` into `cpp/include/`.

### Build Commands

```bash
# Release build (optimized with -O2)
npm run build:wasm
# equivalent to:
bash build_wasm.sh

# Debug build (with -g, assertions, source maps for browser DevTools)
npm run build:wasm:debug
# equivalent to:
bash build_wasm.sh --debug
```

### Build Output

```
js/algo/wasm/
├── algo_module.js     ← Emscripten-generated JS glue (~100KB)
└── algo_module.wasm   ← Compiled binary (~50-80KB gzipped)
```

> **Note:** These files are in `.gitignore` and must be regenerated locally after any changes to `cpp/algo.cpp`.

### Verify WASM is Active

Open the browser console after loading the app. You should see:
```
[WASM] Module loaded successfully
```
If you see:
```
[WASM] Module not found, using JS fallbacks
```
The WASM build is absent and the app is running on JS fallbacks (still fully functional).

---

## 🧪 Running Tests

Tests cover all seven algorithms using **Node.js's built-in test runner** (`node:test`). They run entirely on the pure-JavaScript implementations — no WASM build required.

```bash
npm test
# equivalent to:
node --test tests/*.test.js
```

Test files:
- `tests/dijkstra.test.js`
- `tests/bfsSpread.test.js`
- `tests/tarjanBridges.test.js`
- `tests/knapsack.test.js`
- `tests/waypointOrder.test.js`
- `tests/missionSim.test.js`
- `tests/dsu.test.js`

---

## 🛠 Technology Stack

| Layer | Technology | Role |
|---|---|---|
| **Map rendering** | [Leaflet.js 1.9.4](https://leafletjs.com) | Interactive tile map + vector overlays |
| **Algorithm logic** | C++ (cpp/algo.cpp) | High-performance graph / DP algorithms |
| **WebAssembly** | [Emscripten](https://emscripten.org) | Compiles C++ → `.wasm` binary |
| **JSON bridge** | [nlohmann/json](https://github.com/nlohmann/json) | C++ JSON parsing (header-only) |
| **JS fallbacks** | Vanilla ES Modules | Pure-JS algorithm implementations |
| **UI Shell** | HTML5 + CSS3 | Single-page layout, panel toggles, tabs |
| **Testing** | node:test (Node.js built-in) | Unit tests for all algorithms |
| **Dev server** | `npx serve` / Python | Static file serving for local development |

---

## 📄 License

This project was built as an educational tool demonstrating integration of systems programming (C++/WASM) with browser-based GIS and disaster management domain logic.

---

*Built with ❤️ for India's disaster response community.*
