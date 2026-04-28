/**
 * algo.cpp – C++ implementations of all Disaster Management algorithms.
 *
 * Compiled to WebAssembly with Emscripten (see build_wasm.sh).
 * Each exported function receives and returns a JSON string so that the
 * JavaScript glue layer can marshal complex data without manual memory
 * management (Emscripten's ccall/cwrap handles char* ↔ JS string for us).
 *
 * Exported C functions:
 *   dijkstra_json          (const char*) → const char*
 *   bfs_levels_json        (const char*) → const char*
 *   find_bridges_json      (const char*) → const char*
 *   bounded_knapsack_json  (const char*) → const char*
 *   compute_waypoint_order_json (const char*) → const char*
 *   simulate_mission_json  (const char*) → const char*
 *
 *   dsu_create    (const char*) → int   – allocate DSU instance, return handle
 *   dsu_find      (int, const char*) → const char*
 *   dsu_union     (int, const char*, const char*) → int (0=already same, 1=merged)
 *   dsu_components (int) → int
 *   dsu_destroy   (int) → void
 */

#include <string>
#include <vector>
#include <unordered_map>
#include <queue>
#include <stack>
#include <set>
#include <algorithm>
#include <limits>
#include <cmath>
#include <cassert>
#include <stdexcept>

#include "json.hpp"   // nlohmann/json – single-header, fetched by build_wasm.sh

using json = nlohmann::json;
using std::string;
using std::vector;
using std::unordered_map;

/* ─────────────────────────────────────────────────────────────────────────────
   Shared result buffer.
   All exported functions write their result here and return g_result.c_str().
   Safe in single-threaded WASM / JavaScript environment.
───────────────────────────────────────────────────────────────────────────── */

static string g_result;
static string g_str_result;   // secondary buffer for dsu_find

static const char* put_result(string s) {
    g_result = std::move(s);
    return g_result.c_str();
}

/* ─────────────────────────────────────────────────────────────────────────────
   DIJKSTRA
   Input JSON:
     { "graph": { "A": [{"to":"B","w":1.0}, ...], ... },
       "start": "A",
       "goal":  "C" }
   Output JSON:
     { "distance": 2.0, "path": ["A","B","C"] }   – finite path
     { "distance": null, "path": [] }               – unreachable
───────────────────────────────────────────────────────────────────────────── */

struct DEdge { string to; double w; };
using Graph = unordered_map<string, vector<DEdge>>;

struct DijkResult { double dist; vector<string> path; };

static DijkResult dijkstra_impl(const Graph& graph,
                                const string& start,
                                const string& goal) {
    if (start == goal) return {0.0, {start}};

    unordered_map<string, double> dist;
    unordered_map<string, string> prev;
    auto get_d = [&](const string& n) {
        auto it = dist.find(n);
        return it != dist.end() ? it->second : std::numeric_limits<double>::infinity();
    };
    dist[start] = 0.0;

    using PQE = std::pair<double, string>;
    std::priority_queue<PQE, vector<PQE>, std::greater<PQE>> pq;
    pq.push({0.0, start});

    std::set<string> visited;
    while (!pq.empty()) {
        auto [d, cur] = pq.top(); pq.pop();
        if (visited.count(cur)) continue;
        visited.insert(cur);
        if (cur == goal) break;
        if (d != get_d(cur)) continue;

        auto it = graph.find(cur);
        if (it == graph.end()) continue;
        for (const auto& e : it->second) {
            double nd = d + e.w;
            if (nd < get_d(e.to)) {
                dist[e.to] = nd;
                prev[e.to] = cur;
                pq.push({nd, e.to});
            }
        }
    }

    double d = get_d(goal);
    if (!std::isfinite(d)) return {std::numeric_limits<double>::infinity(), {}};

    vector<string> path;
    string cur = goal;
    while (true) {
        path.push_back(cur);
        if (cur == start) break;
        auto it = prev.find(cur);
        if (it == prev.end()) return {std::numeric_limits<double>::infinity(), {}};
        cur = it->second;
    }
    std::reverse(path.begin(), path.end());
    return {d, path};
}

static Graph parse_graph(const json& jg) {
    Graph g;
    for (auto& [node, edges] : jg.items()) {
        auto& ev = g[node];
        for (const auto& e : edges)
            ev.push_back({e.at("to").get<string>(), e.at("w").get<double>()});
    }
    return g;
}

/* ─────────────────────────────────────────────────────────────────────────────
   BFS SPREAD
   Input JSON:
     { "adj": { "A": [{"to":"B"}, ...], ... }, "start": "A" }
   Output JSON:
     { "levels": { "A": 0, "B": 1, ... } }
───────────────────────────────────────────────────────────────────────────── */

static unordered_map<string, int>
bfs_impl(const unordered_map<string, vector<string>>& adj, const string& start) {
    unordered_map<string, int> levels;
    levels[start] = 0;
    std::queue<string> q;
    q.push(start);
    while (!q.empty()) {
        string u = q.front(); q.pop();
        int lu = levels.at(u);
        auto it = adj.find(u);
        if (it == adj.end()) continue;
        for (const auto& v : it->second) {
            if (!levels.count(v)) {
                levels[v] = lu + 1;
                q.push(v);
            }
        }
    }
    return levels;
}

/* ─────────────────────────────────────────────────────────────────────────────
   TARJAN BRIDGES
   Input JSON:
     { "adj": { "A": [{"to":"B","edgeId":"e1"}, ...], ... } }
   Output JSON:
     { "bridges": ["e1", ...] }
───────────────────────────────────────────────────────────────────────────── */

struct TEdge { string to; string edgeId; };
using TAdjList = unordered_map<string, vector<TEdge>>;

static vector<string> tarjan_bridges_impl(const TAdjList& adj) {
    unordered_map<string, int> disc, low;
    std::set<string> bridges_set;
    int timer = 0;

    std::function<void(const string&, const string&)> dfs =
        [&](const string& u, const string& parent) {
        disc[u] = low[u] = ++timer;
        auto it = adj.find(u);
        if (it == adj.end()) return;
        for (const auto& e : it->second) {
            if (!disc.count(e.to)) {
                dfs(e.to, u);
                low[u] = std::min(low[u], low[e.to]);
                if (low[e.to] > disc[u])
                    bridges_set.insert(e.edgeId);
            } else if (e.to != parent) {
                low[u] = std::min(low[u], disc[e.to]);
            }
        }
    };

    for (auto& [node, _] : adj) {
        if (!disc.count(node))
            dfs(node, "");
    }
    return vector<string>(bridges_set.begin(), bridges_set.end());
}

/* ─────────────────────────────────────────────────────────────────────────────
   BOUNDED KNAPSACK  (binary splitting → 0/1 DP)
   Input JSON:
     { "items": [{"id":"x","weight":2,"value":3,"quantity":5},...],
       "maxWeight": 10 }
   Output JSON:
     { "maxValue": 15, "chosen": { "x": 5 } }
───────────────────────────────────────────────────────────────────────────── */

struct KItem { string id; int weight; int value; int count; };

struct KResult { int maxValue; unordered_map<string, int> chosen; };

static KResult knapsack_impl(const vector<KItem>& base_items, int maxW) {
    // binary splitting
    vector<KItem> split;
    for (const auto& it : base_items) {
        int left = it.count;
        int k = 1;
        while (left > 0) {
            int take = std::min(k, left);
            split.push_back({it.id, it.weight * take, it.value * take, take});
            left -= take;
            k *= 2;
        }
    }

    vector<int> dp(maxW + 1, 0);
    vector<int> prevW(maxW + 1, -1);
    vector<int> prevI(maxW + 1, -1);

    for (int i = 0; i < (int)split.size(); i++) {
        const auto& s = split[i];
        for (int W = maxW; W >= s.weight; W--) {
            int cand = dp[W - s.weight] + s.value;
            if (cand > dp[W]) {
                dp[W] = cand;
                prevW[W] = W - s.weight;
                prevI[W] = i;
            }
        }
    }

    int bestW = 0;
    for (int W = 1; W <= maxW; W++) {
        if (dp[W] > dp[bestW] || (dp[W] == dp[bestW] && W < bestW))
            bestW = W;
    }

    unordered_map<string, int> chosen;
    int curW = bestW;
    while (curW >= 0 && prevI[curW] != -1) {
        const auto& s = split[prevI[curW]];
        chosen[s.id] += s.count;
        curW = prevW[curW];
    }
    return {dp[bestW], chosen};
}

/* ─────────────────────────────────────────────────────────────────────────────
   WAYPOINT ORDER  (nearest-neighbour + 2-opt)
   Input JSON:  [[0,1.5,2.0],[1.5,0,1.0],[2.0,1.0,0]]   (distance matrix)
   Output JSON: [0,2,1]                                   (visitation order)
───────────────────────────────────────────────────────────────────────────── */

static vector<int> nearest_neighbor(const vector<vector<double>>& dm) {
    int n = (int)dm.size();
    if (n == 0) return {};
    if (n == 1) return {0};
    vector<bool> visited(n, false);
    vector<int> order;
    order.push_back(0);
    visited[0] = true;
    while ((int)order.size() < n) {
        int cur = order.back();
        int best = -1;
        double bestD = std::numeric_limits<double>::infinity();
        for (int j = 0; j < n; j++) {
            if (!visited[j] && dm[cur][j] < bestD) {
                bestD = dm[cur][j];
                best = j;
            }
        }
        if (best == -1) break;
        visited[best] = true;
        order.push_back(best);
    }
    return order;
}

static double path_cost(const vector<vector<double>>& dm, const vector<int>& ord) {
    double cost = 0;
    for (int i = 0; i + 1 < (int)ord.size(); i++)
        cost += dm[ord[i]][ord[i + 1]];
    return cost;
}

static vector<int> two_opt(const vector<vector<double>>& dm,
                           vector<int> order, int maxIter = 100) {
    int n = (int)order.size();
    if (n <= 3) return order;
    bool improved = true;
    int iter = 0;
    while (improved && iter < maxIter) {
        improved = false;
        iter++;
        for (int i = 1; i < n - 1; i++) {
            for (int j = i + 1; j < n; j++) {
                double before = dm[order[i - 1]][order[i]] +
                    (j + 1 < n ? dm[order[j]][order[j + 1]] : 0.0);
                double after = dm[order[i - 1]][order[j]] +
                    (j + 1 < n ? dm[order[i]][order[j + 1]] : 0.0);
                if (after < before - 1e-9) {
                    std::reverse(order.begin() + i, order.begin() + j + 1);
                    improved = true;
                }
            }
        }
    }
    return order;
}

/* ─────────────────────────────────────────────────────────────────────────────
   MISSION SIMULATION
   Input JSON:
     { "segments": [{"path":["A","B"],"distanceKm":1.5,"waypointIdx":0},...],
       "fuelKm": 10.0,
       "speedKmh": 60.0,
       "adj": { "A": [{"to":"B","w":1.5},...], ... }   ← for return-path Dijkstra
     }
   Output JSON:  (MissionResult shape matching missionSim.js)
     { "aborted": false,
       "totalDistanceKm": 1.5,
       "etaHours": 0.025,
       "traveledPaths": [["A","B"]],
       "returnPath": null,
       "returnDistanceKm": 0,
       "visitedWaypointIndices": [0],
       "unvisitedWaypointIndices": [],
       "abortNodeId": "" }
───────────────────────────────────────────────────────────────────────────── */

struct MSegment {
    vector<string> path;
    double distanceKm;
    int waypointIdx;
};

struct MResult {
    bool aborted;
    double totalDistanceKm;
    double etaHours;
    vector<vector<string>> traveledPaths;
    vector<string> returnPath;   // empty = no return
    double returnDistanceKm;
    vector<int> visitedWaypointIndices;
    vector<int> unvisitedWaypointIndices;
    string abortNodeId;
};

static MResult simulate_mission_impl(const vector<MSegment>& segments,
                                     double fuelKm,
                                     double speedKmh,
                                     const Graph& adj) {
    double remaining = fuelKm;
    vector<vector<string>> traveledPaths;
    vector<int> visitedIdx;
    vector<int> allIdx;
    for (const auto& s : segments) allIdx.push_back(s.waypointIdx);
    double traveledDist = 0;

    for (int i = 0; i < (int)segments.size(); i++) {
        const auto& seg = segments[i];
        if (remaining < seg.distanceKm) {
            // Abort
            string lastNode = traveledPaths.empty()
                ? seg.path[0]
                : traveledPaths.back().back();

            vector<int> unvisited;
            for (int idx : allIdx) {
                bool v = false;
                for (int vi : visitedIdx) if (vi == idx) { v = true; break; }
                if (!v) unvisited.push_back(idx);
            }

            // Compute return path via Dijkstra
            string startNode = segments[0].path[0];
            vector<string> retPath;
            double retDist = 0;
            if (lastNode != startNode) {
                auto r = dijkstra_impl(adj, lastNode, startNode);
                if (std::isfinite(r.dist) && r.path.size() >= 2) {
                    retPath = r.path;
                    retDist = r.dist;
                }
            }

            double total = traveledDist + retDist;
            double eta = speedKmh > 0 ? total / speedKmh : std::numeric_limits<double>::infinity();
            return {true, total, eta, traveledPaths, retPath, retDist,
                    visitedIdx, unvisited, lastNode};
        }
        remaining -= seg.distanceKm;
        traveledDist += seg.distanceKm;
        traveledPaths.push_back(seg.path);
        visitedIdx.push_back(seg.waypointIdx);
    }

    double eta = speedKmh > 0 ? traveledDist / speedKmh : std::numeric_limits<double>::infinity();
    return {false, traveledDist, eta, traveledPaths, {}, 0, visitedIdx, {}, ""};
}

/* ─────────────────────────────────────────────────────────────────────────────
   DSU  (Disjoint Set Union / Union–Find)
   Instance-based: JS calls dsu_create → gets an integer handle, then calls
   dsu_find / dsu_union / dsu_components with that handle, finally dsu_destroy.
───────────────────────────────────────────────────────────────────────────── */

struct DSUInstance {
    unordered_map<string, string> parent;
    unordered_map<string, int>    rank;
    int components;

    void init(const vector<string>& items) {
        components = 0;
        for (const auto& x : items) {
            parent[x] = x;
            rank[x]   = 0;
            components++;
        }
    }

    const string& find(const string& x) {
        auto it = parent.find(x);
        if (it == parent.end()) throw std::runtime_error("DSU find: unknown item");
        if (it->second == x) return it->second;
        it->second = find(it->second);  // path compression
        return it->second;
    }

    bool unite(const string& a, const string& b) {
        const string ra = find(a);
        const string rb = find(b);
        if (ra == rb) return false;
        int rA = rank.at(ra), rB = rank.at(rb);
        if (rA < rB)       parent[ra] = rb;
        else if (rA > rB)  parent[rb] = ra;
        else { parent[rb] = ra; rank[ra]++; }
        components--;
        return true;
    }
};

static unordered_map<int, DSUInstance> g_dsu_instances;
static int g_dsu_next_id = 1;

/* ─────────────────────────────────────────────────────────────────────────────
   C EXPORTS
───────────────────────────────────────────────────────────────────────────── */

extern "C" {

/* ---- Dijkstra ------------------------------------------------------------ */
const char* dijkstra_json(const char* input) {
    try {
        auto inp   = json::parse(input);
        auto graph = parse_graph(inp.at("graph"));
        auto start = inp.at("start").get<string>();
        auto goal  = inp.at("goal").get<string>();

        auto r = dijkstra_impl(graph, start, goal);

        json out;
        if (!std::isfinite(r.dist)) {
            out["distance"] = nullptr;
            out["path"]     = json::array();
        } else {
            out["distance"] = r.dist;
            out["path"]     = r.path;
        }
        return put_result(out.dump());
    } catch (...) {
        return put_result("{\"error\":\"dijkstra_json failed\"}");
    }
}

/* ---- BFS levels ---------------------------------------------------------- */
const char* bfs_levels_json(const char* input) {
    try {
        auto inp   = json::parse(input);
        auto start = inp.at("start").get<string>();

        unordered_map<string, vector<string>> adj;
        for (auto& [node, edges] : inp.at("adj").items()) {
            auto& ev = adj[node];
            for (const auto& e : edges) {
                auto to = e.at("to").get<string>();
                ev.push_back(to);
            }
        }

        auto levels = bfs_impl(adj, start);

        json out = json::object();
        for (auto& [k, v] : levels) out[k] = v;
        return put_result(out.dump());
    } catch (...) {
        return put_result("{\"error\":\"bfs_levels_json failed\"}");
    }
}

/* ---- Tarjan bridges ------------------------------------------------------ */
const char* find_bridges_json(const char* input) {
    try {
        auto inp = json::parse(input);

        TAdjList adj;
        for (auto& [node, edges] : inp.at("adj").items()) {
            auto& ev = adj[node];
            for (const auto& e : edges) {
                ev.push_back({e.at("to").get<string>(),
                              e.at("edgeId").get<string>()});
            }
        }

        auto bridges = tarjan_bridges_impl(adj);

        json out;
        out["bridges"] = bridges;
        return put_result(out.dump());
    } catch (...) {
        return put_result("{\"error\":\"find_bridges_json failed\"}");
    }
}

/* ---- Bounded knapsack ---------------------------------------------------- */
const char* bounded_knapsack_json(const char* input) {
    try {
        auto inp  = json::parse(input);
        int  maxW = inp.at("maxWeight").get<int>();

        vector<KItem> items;
        for (const auto& it : inp.at("items")) {
            items.push_back({it.at("id").get<string>(),
                             it.at("weight").get<int>(),
                             it.at("value").get<int>(),
                             it.at("quantity").get<int>()});
        }

        auto r = knapsack_impl(items, maxW);

        json out;
        out["maxValue"] = r.maxValue;
        json chosen = json::object();
        for (auto& [k, v] : r.chosen)
            if (v > 0) chosen[k] = v;
        out["chosen"] = chosen;
        return put_result(out.dump());
    } catch (...) {
        return put_result("{\"error\":\"bounded_knapsack_json failed\"}");
    }
}

/* ---- Waypoint order ------------------------------------------------------ */
const char* compute_waypoint_order_json(const char* input) {
    try {
        auto inp = json::parse(input);
        vector<vector<double>> dm;
        for (const auto& row : inp) {
            vector<double> r;
            for (double v : row) r.push_back(v);
            dm.push_back(r);
        }
        auto order = two_opt(dm, nearest_neighbor(dm));
        json out = order;
        return put_result(out.dump());
    } catch (...) {
        return put_result("[0]");
    }
}

/* ---- Mission simulation -------------------------------------------------- */
const char* simulate_mission_json(const char* input) {
    try {
        auto inp     = json::parse(input);
        double fuel  = inp.at("fuelKm").get<double>();
        double speed = inp.at("speedKmh").get<double>();

        vector<MSegment> segs;
        for (const auto& s : inp.at("segments")) {
            MSegment ms;
            for (const auto& p : s.at("path")) ms.path.push_back(p.get<string>());
            ms.distanceKm  = s.at("distanceKm").get<double>();
            ms.waypointIdx = s.at("waypointIdx").get<int>();
            segs.push_back(std::move(ms));
        }

        Graph adj = parse_graph(inp.at("adj"));
        auto r = simulate_mission_impl(segs, fuel, speed, adj);

        json out;
        out["aborted"]         = r.aborted;
        out["totalDistanceKm"] = r.totalDistanceKm;
        out["etaHours"]        = std::isfinite(r.etaHours) ? json(r.etaHours) : json(nullptr);
        out["traveledPaths"]   = r.traveledPaths;
        out["returnPath"]      = r.returnPath.empty() ? json(nullptr) : json(r.returnPath);
        out["returnDistanceKm"]            = r.returnDistanceKm;
        out["visitedWaypointIndices"]      = r.visitedWaypointIndices;
        out["unvisitedWaypointIndices"]    = r.unvisitedWaypointIndices;
        out["abortNodeId"]     = r.abortNodeId;
        return put_result(out.dump());
    } catch (...) {
        return put_result("{\"error\":\"simulate_mission_json failed\"}");
    }
}

/* ---- DSU instance management -------------------------------------------- */
int dsu_create(const char* items_json) {
    try {
        auto arr = json::parse(items_json);
        vector<string> items;
        for (const auto& x : arr) items.push_back(x.get<string>());

        int id = g_dsu_next_id++;
        g_dsu_instances[id].init(items);
        return id;
    } catch (...) {
        return -1;
    }
}

const char* dsu_find(int handle, const char* x) {
    try {
        auto it = g_dsu_instances.find(handle);
        if (it == g_dsu_instances.end()) return "";
        const string& root = it->second.find(string(x));
        g_str_result = root;
        return g_str_result.c_str();
    } catch (...) {
        return "";
    }
}

int dsu_union(int handle, const char* a, const char* b) {
    try {
        auto it = g_dsu_instances.find(handle);
        if (it == g_dsu_instances.end()) return 0;
        return it->second.unite(string(a), string(b)) ? 1 : 0;
    } catch (...) {
        return 0;
    }
}

int dsu_components(int handle) {
    auto it = g_dsu_instances.find(handle);
    if (it == g_dsu_instances.end()) return 0;
    return it->second.components;
}

void dsu_destroy(int handle) {
    g_dsu_instances.erase(handle);
}

}  // extern "C"
