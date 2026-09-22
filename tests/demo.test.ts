import { describe, it, expect } from "vitest";
import { validateConditions } from "../client/src/lib/server/simulationValidation";
import {
  timedSegments,
  secondsRemaining,
  advanceTimed,
  remainingPath,
  floodZones,
  evaluateSimulation,
  rankSimulationRoutes,
  formatTravelTime,
} from "../client/src/lib/services/demoSimulation";
import {
  cumulativeDistances,
  intersectsFlood,
  type RoadRoute,
} from "../client/src/lib/services/routingService";
import { parseTomTomRoutes } from "../client/src/lib/services/tomtomRoutes";
import type { Conditions, SimulationZone } from "../client/src/lib/types/demo";
const road: RoadRoute = {
  key: "test",
  source: "osrm",
  polyline: [
    [0, 0],
    [0, 0.01],
  ],
  durationSeconds: 100,
  distanceMeters: 1112,
  steps: [],
};
const zone: SimulationZone = {
  id: "a",
  kind: "traffic",
  center: [0, 0.005],
  name: "Test",
  enabled: true,
  radiusMeters: 111.32,
  level: "heavy",
  depthCm: 80,
  rainMmH: 10,
};
const conditions: Conditions = {
  trafficSimulation: true,
  floodSimulation: true,
  zones: [zone],
};
describe("shared condition validation", () => {
  it("rejects invalid values and duplicate zone IDs", () => {
    expect(() =>
      validateConditions({ ...conditions, zones: [{ ...zone, depthCm: NaN }] }),
    ).toThrow();
    expect(() =>
      validateConditions({
        ...conditions,
        zones: [{ ...zone, radiusMeters: 1001 }],
      }),
    ).toThrow();
    expect(() =>
      validateConditions({ ...conditions, zones: [zone, zone] }),
    ).toThrow();
    expect(() => validateConditions(null as unknown as Conditions)).toThrow();
  });
});
describe("segment simulation", () => {
  it("charges only intersecting portions and does not stack overlapping traffic", () => {
    const segments = timedSegments(road, [zone]);
    expect(secondsRemaining(segments, 0)).toBeCloseTo(130, 4);
    expect(
      secondsRemaining(timedSegments(road, [zone, { ...zone, id: "b" }]), 0),
    ).toBeCloseTo(130, 4);
    expect(
      secondsRemaining(timedSegments(road, [{ ...zone, enabled: false }]), 0),
    ).toBeCloseTo(100);
  });
  it("ETA and playback consume the same time through boundaries", () => {
    const segments = timedSegments(road, [zone]);
    const next = advanceTimed(segments, 0, 60);
    expect(secondsRemaining(segments, next)).toBeCloseTo(70);
    expect(advanceTimed(segments, next, 70)).toBeCloseTo(
      cumulativeDistances(road.polyline).at(-1)!,
    );
  });
  it("floods behind traveler do not block remaining route", () => {
    const flood = floodZones([
      { ...zone, kind: "flood", center: [0, 0.001], radiusMeters: 50 },
    ])[0];
    expect(intersectsFlood(road.polyline, flood)).toBe(true);
    expect(intersectsFlood(remainingPath(road.polyline, 500), flood)).toBe(
      false,
    );
  });
});
describe("TomTom normalization", () => {
  it("keeps geometry and live timing from the same route", () => {
    const routes = parseTomTomRoutes({
      routes: [
        {
          summary: {
            lengthInMeters: 1112,
            travelTimeInSeconds: 150,
            noTrafficTravelTimeInSeconds: 100,
            trafficDelayInSeconds: 50,
          },
          legs: [
            {
              points: [
                { latitude: 0, longitude: 0 },
                { latitude: 0, longitude: 0.01 },
              ],
            },
          ],
        },
      ],
    });
    expect(routes[0].source).toBe("tomtom");
    expect(routes[0].durationSeconds).toBe(150);
    expect(routes[0].baseDurationSeconds).toBe(100);
    expect(routes[0].steps.at(-1)?.maneuver).toBe("arrive");
    expect(() => parseTomTomRoutes({ routes: [] })).toThrow();
  });
});

describe("shared route evaluation", () => {
  it("adds shallow flood delay, combines traffic, and blocks only above the vehicle threshold", () => {
    const shallow = { ...zone, id: "f", kind: "flood" as const, depthCm: 10 };
    const c = { ...conditions, zones: [shallow] };
    expect(evaluateSimulation(road, c, 20).seconds).toBeCloseTo(110, 4);
    expect(evaluateSimulation(road, c, 10).seconds).toBeCloseTo(120, 4);
    expect(evaluateSimulation(road, c, 10).blocked).toBe(false);
    expect(evaluateSimulation(road, c, 9).etaSeconds).toBeNull();
    expect(
      evaluateSimulation(road, { ...c, zones: [shallow, zone] }, 20).seconds,
    ).toBeCloseTo(155, 4);
    expect(
      evaluateSimulation(
        road,
        { ...c, zones: [shallow, { ...shallow, id: "duplicate" }] },
        20,
      ).seconds,
    ).toBeCloseTo(110, 4);
  });
  it("uses only enabled simulated conditions and the remaining path", () => {
    expect(
      evaluateSimulation(road, { ...conditions, trafficSimulation: false }, 15)
        .seconds,
    ).toBeCloseTo(100);
    expect(
      evaluateSimulation(
        road,
        { ...conditions, zones: [{ ...zone, level: "light" }] },
        15,
      ).seconds,
    ).toBeCloseTo(104, 4);
    expect(
      evaluateSimulation(
        road,
        { ...conditions, zones: [{ ...zone, center: [1, 1] }] },
        15,
      ).seconds,
    ).toBeCloseTo(100);
    const c = { ...conditions, zones: [{ ...zone, kind: "flood" as const }] };
    expect(
      evaluateSimulation(road, { ...c, floodSimulation: false }, 15).blocked,
    ).toBe(false);
    expect(evaluateSimulation(road, c, 15, 900).blocked).toBe(false);
    expect(evaluateSimulation(road, c, 15, 900).delaySeconds).toBeCloseTo(0);
    expect(
      evaluateSimulation(
        road,
        { ...c, zones: [{ ...c.zones[0], depthCm: 0 }] },
        15,
      ).seconds,
    ).toBeCloseTo(100);
  });
  it("ranks a faster unexposed alternative above a delayed or blocked route", () => {
    const alternate = {
      ...road,
      key: "alternate",
      durationSeconds: 120,
      polyline: [
        [0.01, 0],
        [0.01, 0.01],
      ] as [number, number][],
    };
    expect(
      rankSimulationRoutes([road, alternate], conditions, 15)[0].road.key,
    ).toBe("alternate");
    expect(
      rankSimulationRoutes(
        [road, alternate],
        { ...conditions, zones: [] },
        15,
      )[0].road.key,
    ).toBe("test");
    expect(
      rankSimulationRoutes(
        [road, alternate],
        { ...conditions, zones: [{ ...zone, kind: "flood" }] },
        15,
      )[1].etaSeconds,
    ).toBeNull();
  });
  it("keeps playback and ETA consistent for mixed flood/traffic and displays small delays", () => {
    const c = {
      ...conditions,
      zones: [zone, { ...zone, id: "f", kind: "flood" as const, depthCm: 10 }],
    };
    const before = evaluateSimulation(road, c, 20);
    const progress = advanceTimed(before.segments, 0, 70);
    expect(evaluateSimulation(road, c, 20, progress).seconds).toBeCloseTo(
      before.seconds - 70,
    );
    expect(formatTravelTime(104)).toBe("1 min 44 s");
    expect(formatTravelTime(100.00000000001)).toBe("1 min 40 s");
  });
});

it("does not block an already completed journey", () => {
  const atEnd = {
    ...conditions,
    zones: [{ ...zone, kind: "flood" as const, center: road.polyline.at(-1)! }],
  };
  const result = evaluateSimulation(
    road,
    atEnd,
    15,
    cumulativeDistances(road.polyline).at(-1)!,
  );
  expect(result.blocked).toBe(false);
  expect(result.etaSeconds).toBe(0);
});

describe("vehicle travel estimates", () => {
  it("changes dry-road ETA by vehicle and keeps playback consistent", () => {
    const dry = { ...conditions, zones: [] };
    const car = evaluateSimulation(road, dry, 15, 0, "low_clearance");
    const motorcycle = evaluateSimulation(road, dry, 15, 0, "motorcycle");
    const truck = evaluateSimulation(road, dry, 15, 0, "high_clearance");
    const bicycle = evaluateSimulation(road, dry, 15, 0, "bicycle");
    expect(motorcycle.seconds).toBeLessThan(car.seconds);
    expect(truck.seconds).toBeGreaterThan(car.seconds);
    expect(bicycle.seconds).toBeGreaterThan(truck.seconds);
    for (const result of [car, motorcycle, truck, bicycle]) {
      const progress = advanceTimed(result.segments, 0, 30);
      expect(secondsRemaining(result.segments, progress)).toBeCloseTo(result.seconds - 30);
      expect(result.delaySeconds).toBe(0);
    }
    expect(rankSimulationRoutes([road], dry, 15, "bicycle")[0].seconds).toBe(bicycle.seconds);
  });
  it("keeps flooded routes blocked for vehicle estimates", () => {
    const flooded = { ...conditions, zones: [{ ...zone, kind: "flood" as const }] };
    const result = evaluateSimulation(road, flooded, 15, 0, "motorcycle");
    expect(result.blocked).toBe(true);
    expect(result.etaSeconds).toBeNull();
  });
});
