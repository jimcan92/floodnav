import {
  Coordinate,
  FloodHazardZone,
  NavigationStep,
  RouteOption,
  VehicleCategory,
} from "../types/navigation";
import { generateTrafficDots, haversineDistanceKm } from "./trafficService";

export interface RoadRoute {
  key: string;
  polyline: Coordinate[];
  distanceMeters: number;
  durationSeconds: number;
  steps: NavigationStep[];
  source: "osrm" | "fixture";
}

// Project to local meters: accurate enough for the small Cebu hazard circles.
export function intersectsFlood(
  path: Coordinate[],
  zone: FloodHazardZone,
): boolean {
  if (!zone.active || zone.depthCm <= 0) return false;
  const project = ([lat, lng]: Coordinate) => [
    (lng - zone.center[1]) *
      111320 *
      Math.cos((zone.center[0] * Math.PI) / 180),
    (lat - zone.center[0]) * 111320,
  ];
  return path.some((point, i) => {
    const a = project(point),
      b = project(path[Math.min(i + 1, path.length - 1)]);
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const length2 = dx * dx + dy * dy;
    const t = length2
      ? Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / length2))
      : 0;
    return Math.hypot(a[0] + t * dx, a[1] + t * dy) <= zone.radiusMeters;
  });
}

export function cumulativeDistances(path: Coordinate[]): number[] {
  const result = [0];
  for (let i = 1; i < path.length; i++)
    result.push(
      result[i - 1] + haversineDistanceKm(path[i - 1], path[i]) * 1000,
    );
  return result;
}

export function positionAt(path: Coordinate[], meters: number): Coordinate {
  if (!path.length) return [0, 0];
  const distances = cumulativeDistances(path);
  for (let i = 1; i < path.length; i++) {
    if (distances[i] >= meters && distances[i] > distances[i - 1]) {
      const t = Math.max(
        0,
        (meters - distances[i - 1]) / (distances[i] - distances[i - 1]),
      );
      return [
        path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t,
        path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t,
      ];
    }
  }
  return path[path.length - 1];
}

export function parseRoadRoutes(
  data: unknown,
  source: RoadRoute["source"],
): RoadRoute[] {
  const response = data as { code?: string; routes?: unknown[] };
  if (
    response?.code !== "Ok" ||
    !Array.isArray(response.routes) ||
    !response.routes.length
  )
    throw new Error("No road route found. Choose another destination.");
  return response.routes.map((raw, index) => {
    const route = raw as {
      distance: number;
      duration: number;
      geometry: { coordinates: number[][] };
      legs: {
        steps: {
          distance: number;
          duration: number;
          name: string;
          maneuver: { type: string; modifier?: string; location: number[] };
        }[];
      }[];
    };
    if (
      !Number.isFinite(route.distance) ||
      route.distance <= 0 ||
      !Number.isFinite(route.duration) ||
      route.duration < 0 ||
      !Array.isArray(route.geometry?.coordinates) ||
      route.geometry.coordinates.length < 2 ||
      !Array.isArray(route.legs)
    )
      throw new Error("Invalid routing response. Please retry.");
    const polyline: Coordinate[] = route.geometry.coordinates.map((p) => {
      if (
        p.length < 2 ||
        !p.every(Number.isFinite) ||
        Math.abs(p[0]) > 180 ||
        Math.abs(p[1]) > 90
      )
        throw new Error("Invalid route coordinates.");
      return [p[1], p[0]];
    });
    const cumulative = cumulativeDistances(polyline);
    let previousIndex = 0;
    const steps: NavigationStep[] = route.legs
      .flatMap((l) => l.steps)
      .map((s, i) => {
        if (
          !s?.maneuver?.location ||
          !s.maneuver.location.every(Number.isFinite) ||
          !Number.isFinite(s.distance) ||
          !Number.isFinite(s.duration)
        )
          throw new Error("Invalid route maneuvers.");
        const coordinate: Coordinate = [
          s.maneuver.location[1],
          s.maneuver.location[0],
        ];
        let nearest = previousIndex;
        for (let j = previousIndex; j < polyline.length; j++)
          if (
            haversineDistanceKm(polyline[j], coordinate) <
            haversineDistanceKm(polyline[nearest], coordinate)
          )
            nearest = j;
        previousIndex = nearest;
        const modifier = s.maneuver.modifier || "";
        const maneuver: NavigationStep["maneuver"] =
          s.maneuver.type === "arrive"
            ? "arrive"
            : modifier === "uturn"
              ? "u-turn"
              : modifier.includes("left")
                ? modifier.includes("slight")
                  ? "slight-left"
                  : "turn-left"
                : modifier.includes("right")
                  ? modifier.includes("slight")
                    ? "slight-right"
                    : "turn-right"
                  : "straight";
        const street = s.name || "unnamed road";
        const action =
          maneuver === "arrive"
            ? "Arrive at your destination"
            : s.maneuver.type === "depart"
              ? "Depart"
              : s.maneuver.type.includes("roundabout") ||
                  s.maneuver.type === "rotary"
                ? "Follow the roundabout"
                : maneuver === "u-turn"
                  ? "Make a U-turn"
                  : maneuver.includes("left")
                    ? "Turn left"
                    : maneuver.includes("right")
                      ? "Turn right"
                      : "Continue";
        const instruction =
          maneuver === "arrive" ? action : `${action} on ${street}`;
        return {
          id: `step_${i}`,
          instruction,
          cebuanoInstruction:
            maneuver === "arrive"
              ? "Miabot na sa destinasyon"
              : `${maneuver.includes("left") ? "Sa wala" : maneuver.includes("right") ? "Sa tuo" : "Padayon"} — ${street}`,
          distanceMeters: s.distance,
          durationSeconds: s.duration,
          maneuver,
          coordinate,
          streetName: street,
          progressMeters: cumulative[nearest],
        };
      });
    if (!steps.length) throw new Error("No route instructions returned.");
    return {
      key: `road_${index}`,
      polyline,
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      steps,
      source,
    };
  });
}

export async function fetchRoadRoutes(
  origin: Coordinate,
  destination: Coordinate,
  signal: AbortSignal,
): Promise<RoadRoute[]> {
  const url = `https://router.project-osrm.org/route/v1/driving/${origin[1]},${origin[0]};${destination[1]},${destination[0]}?alternatives=true&overview=full&geometries=geojson&steps=true`;
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(
      "Routing service unavailable. Retry or use Demo scenarios.",
    );
  return parseRoadRoutes(await response.json(), "osrm");
}

export function evaluateRoutes(
  roads: RoadRoute[],
  vehicle: VehicleCategory,
  floods: FloodHazardZone[],
  source: "sensor" | "simulated" = "simulated",
): { primary: RouteOption | null; alternativeSafe: RouteOption | null } {
  const evaluate = (road: RoadRoute, id: RouteOption["id"]): RouteOption => {
    const encountered = floods.filter((f) => intersectsFlood(road.polyline, f));
    const depth = Math.max(0, ...encountered.map((f) => f.depthCm));
    const passable = depth <= vehicle.maxSafeWaterDepthCm;
    return {
      id,
      source: road.source,
      name:
        id === "primary" ? "Primary road route" : "Flood-avoiding alternative",
      isAlternativeSafeRoute: id !== "primary",
      polyline: road.polyline,
      distanceKm: road.distanceMeters / 1000,
      durationMinutes: road.durationSeconds / 60,
      steps: road.steps,
      trafficDots: generateTrafficDots(road.polyline),
      floodZonesEncountered: encountered,
      maxWaterDepthCm: depth,
      isPassable: passable,
      summary:
        source === "sensor"
          ? depth > 0
            ? "Blocked by sensor-reported water"
            : "No intersection with reported water — coverage is limited"
          : !passable
            ? "Blocked by simulated flood"
            : depth > 0
              ? "Within demo threshold — simulated assessment only"
              : "No intersection with simulated flood zones",
    };
  };
  const primary = roads[0] ? evaluate(roads[0], "primary") : null;
  const alternativeSafe =
    roads
      .slice(1)
      .filter(
        (r) => JSON.stringify(r.polyline) !== JSON.stringify(roads[0].polyline),
      )
      .map((r) => evaluate(r, "alternative_safe"))
      .filter((r) => r.floodZonesEncountered.length === 0)
      .sort((a, b) => a.durationMinutes - b.durationMinutes)[0] || null;
  return { primary, alternativeSafe };
}
