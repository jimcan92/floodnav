import { describe, it, expect, vi, afterEach } from "vitest";
import {
  cumulativeDistances,
  evaluateRoutes,
  fetchRoadRoutes,
  intersectsFlood,
  parseRoadRoutes,
  positionAt,
} from "../src/services/routingService";
import { DEMO_ROADS, scenarioFloods } from "../src/data/demoScenarios";
import { VEHICLE_CATEGORIES } from "../src/data/vehicleCategories";
import { Coordinate, FloodHazardZone } from "../src/types/navigation";
import {
  advanceProgress,
  RequestGate,
  WarningGate,
} from "../src/services/navigationState";
const vehicle = VEHICLE_CATEGORIES[0];
const zone: FloodHazardZone = {
  id: "z",
  center: [0, 0],
  radiusMeters: 100,
  depthCm: 15,
  active: true,
  affectedRoad: "Test",
  name: "Test",
  severity: "ankle",
  reportedTime: "fixture",
  description: "",
};
afterEach(() => vi.unstubAllGlobals());
describe("flood geometry", () => {
  it("detects crossing even when both endpoints are outside", () =>
    expect(
      intersectsFlood(
        [
          [0, -0.01],
          [0, 0.01],
        ],
        zone,
      ),
    ).toBe(true));
  it("includes tangent and ignores inactive/dry hazards", () => {
    expect(
      intersectsFlood(
        [
          [100 / 111320, -0.01],
          [100 / 111320, 0.01],
        ],
        zone,
      ),
    ).toBe(true);
    expect(
      intersectsFlood(
        [
          [0, -0.01],
          [0, 0.01],
        ],
        { ...zone, active: false },
      ),
    ).toBe(false);
    expect(
      intersectsFlood(
        [
          [0, -0.01],
          [0, 0.01],
        ],
        { ...zone, depthCm: 0 },
      ),
    ).toBe(false);
    expect(
      intersectsFlood(
        [
          [0.01, -0.01],
          [0.01, 0.01],
        ],
        zone,
      ),
    ).toBe(false);
  });
  it("handles demo vehicle thresholds including equality", () => {
    const road = {
      ...DEMO_ROADS[0],
      polyline: [
        [0, -0.01],
        [0, 0.01],
      ] as Coordinate[],
    };
    expect(evaluateRoutes([road], vehicle, [zone]).primary?.isPassable).toBe(
      true,
    );
    expect(
      evaluateRoutes([road], vehicle, [{ ...zone, depthCm: 16 }]).primary
        ?.isPassable,
    ).toBe(false);
  });
});
describe("road fixtures and scenarios", () => {
  it("has road geometry and real maneuver progress", () => {
    for (const road of DEMO_ROADS) {
      expect(road.polyline.length).toBeGreaterThan(50);
      expect(road.steps.length).toBeGreaterThan(3);
      expect(road.steps.map((s) => s.progressMeters)).toEqual(
        road.steps.map((s) => s.progressMeters).sort((a, b) => a - b),
      );
    }
  });
  it.each(VEHICLE_CATEGORIES)(
    "provides repeatable dry, bypass and blocked scenarios for $id",
    (v) => {
      expect(
        evaluateRoutes(DEMO_ROADS, v, scenarioFloods("dry")).primary
          ?.isPassable,
      ).toBe(true);
      const bypass = evaluateRoutes(DEMO_ROADS, v, scenarioFloods("bypass"));
      expect(bypass.primary?.isPassable).toBe(false);
      expect(bypass.alternativeSafe?.floodZonesEncountered).toEqual([]);
      const blocked = evaluateRoutes(DEMO_ROADS, v, scenarioFloods("blocked"));
      expect(blocked.primary?.isPassable).toBe(false);
      expect(blocked.alternativeSafe).toBeNull();
    },
  );
  it("does not present a duplicate or flooded route as an alternative", () => {
    expect(
      evaluateRoutes([DEMO_ROADS[0], DEMO_ROADS[0]], vehicle, [])
        .alternativeSafe,
    ).toBeNull();
    expect(evaluateRoutes([], vehicle, [])).toEqual({
      primary: null,
      alternativeSafe: null,
    });
  });
});
describe("API failures", () => {
  it.each([
    null,
    {},
    { code: "NoRoute" },
    { code: "Ok", routes: [] },
    { code: "Ok", routes: [{}] },
  ])("rejects malformed or missing routes", (data) =>
    expect(() => parseRoadRoutes(data, "osrm")).toThrow(),
  );
  it("propagates cancellation and never fabricates a fallback", async () => {
    const controller = new AbortController();
    controller.abort();
    const mock = vi
      .fn()
      .mockRejectedValue(new DOMException("Aborted", "AbortError"));
    vi.stubGlobal("fetch", mock);
    await expect(
      fetchRoadRoutes([0, 0], [1, 1], controller.signal),
    ).rejects.toThrow();
    expect(mock.mock.calls[0][1].signal).toBe(controller.signal);
  });
  it("rejects service failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(
      fetchRoadRoutes([0, 0], [1, 1], new AbortController().signal),
    ).rejects.toThrow("unavailable");
  });
});
describe("navigation state", () => {
  it("ignores stale request generations", () => {
    const gate = new RequestGate();
    const a = gate.next(),
      b = gate.next();
    expect(gate.isCurrent(a)).toBe(false);
    expect(gate.isCurrent(b)).toBe(true);
  });
  it("deduplicates warnings until a trip reset", () => {
    const gate = new WarningGate();
    expect(gate.accept("flood")).toBe(true);
    expect(gate.accept("flood")).toBe(false);
    expect(gate.accept("other")).toBe(true);
    gate.reset();
    expect(gate.accept("flood")).toBe(true);
  });
  it("interpolates by distance across duplicate vertices and clamps arrival", () => {
    const path: Coordinate[] = [
      [0, 0],
      [0, 0],
      [0, 0.01],
    ];
    const total = cumulativeDistances(path).at(-1)!;
    expect(positionAt(path, total / 2)[1]).toBeCloseTo(0.005);
    expect(positionAt(path, total + 10)).toEqual(path.at(-1));
    expect(advanceProgress(total - 5, 20, total)).toBe(total);
    expect(advanceProgress(100, 0, total)).toBe(100);
  });
});
