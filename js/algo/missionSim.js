/**
 * Mission simulation with fuel constraints.
 *
 * Simulates traversal along a segmented route, checking fuel at each waypoint boundary.
 */

/**
 * @typedef {Object} MissionSegment
 * @property {string[]} path      – node IDs for this leg
 * @property {number}   distanceKm – distance for this leg
 * @property {number}   waypointIdx – index of the destination waypoint in the ordered list
 */

/**
 * @typedef {Object} MissionResult
 * @property {boolean}   aborted         – true if fuel ran out
 * @property {number}    totalDistanceKm – distance actually traveled (including return if aborted)
 * @property {number}    etaHours        – totalDistanceKm / speedKmh
 * @property {string[][]} traveledPaths  – paths for legs that were completed
 * @property {string[]|null} returnPath  – path back to start if aborted
 * @property {number}    returnDistanceKm – distance of return leg (0 if not aborted)
 * @property {number[]}  visitedWaypointIndices   – indices of waypoints reached
 * @property {number[]}  unvisitedWaypointIndices – indices of waypoints not reached
 * @property {string}    abortNodeId     – node where mission was aborted (empty if not aborted)
 */

/**
 * Simulate a mission along segmented route with fuel constraint.
 *
 * @param {MissionSegment[]} segments – ordered route segments (leg 0 = start→wp0, leg 1 = wp0→wp1, …)
 * @param {number} fuelKm      – initial fuel in km
 * @param {number} speedKmh    – vehicle speed in km/h
 * @param {function} dijkstraFn – (startNodeId, goalNodeId) => { distance, path }
 * @returns {MissionResult}
 */
export function simulateMission(segments, fuelKm, speedKmh, dijkstraFn) {
  let remainingFuel = fuelKm;
  const traveledPaths = [];
  const visitedWaypointIndices = [];
  const allWaypointIndices = segments.map((s) => s.waypointIdx);
  let traveledDistance = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    if (remainingFuel < seg.distanceKm) {
      // Fuel insufficient — abort
      const lastNode =
        traveledPaths.length > 0
          ? traveledPaths[traveledPaths.length - 1][traveledPaths[traveledPaths.length - 1].length - 1]
          : seg.path[0]; // start node

      const unvisitedWaypointIndices = allWaypointIndices.filter(
        (idx) => !visitedWaypointIndices.includes(idx)
      );

      // Compute return path
      const startNode = segments[0].path[0];
      let returnPath = null;
      let returnDistanceKm = 0;

      if (lastNode !== startNode && dijkstraFn) {
        const ret = dijkstraFn(lastNode, startNode);
        if (ret && ret.path && ret.path.length >= 2 && Number.isFinite(ret.distance)) {
          returnPath = ret.path;
          returnDistanceKm = ret.distance;
        }
      }

      return {
        aborted: true,
        totalDistanceKm: traveledDistance + returnDistanceKm,
        etaHours: speedKmh > 0 ? (traveledDistance + returnDistanceKm) / speedKmh : Infinity,
        traveledPaths,
        returnPath,
        returnDistanceKm,
        visitedWaypointIndices,
        unvisitedWaypointIndices,
        abortNodeId: lastNode,
      };
    }

    // Travel this segment
    remainingFuel -= seg.distanceKm;
    traveledDistance += seg.distanceKm;
    traveledPaths.push(seg.path);
    visitedWaypointIndices.push(seg.waypointIdx);
  }

  // Mission completed successfully
  return {
    aborted: false,
    totalDistanceKm: traveledDistance,
    etaHours: speedKmh > 0 ? traveledDistance / speedKmh : Infinity,
    traveledPaths,
    returnPath: null,
    returnDistanceKm: 0,
    visitedWaypointIndices,
    unvisitedWaypointIndices: [],
    abortNodeId: '',
  };
}
