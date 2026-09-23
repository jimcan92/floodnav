import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bindResearchRouting } from "../client/src/lib/states/research/routing";
import { bindResearchSensors } from "../client/src/lib/states/research/sensors";
import type { ResearchState } from "../client/src/lib/states/research/trip.svelte";
import {
  fetchRoadRoutes,
  type RoadRoute,
} from "../client/src/lib/services/routingService";
import {
  fetchSensorReadings,
  type SensorReading,
} from "../client/src/lib/services/sensorService";
import { DEMO_ROADS } from "../client/src/lib/data/demoScenarios";

vi.mock(
  "../client/src/lib/services/routingService",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../client/src/lib/services/routingService")
    >()),
    fetchRoadRoutes: vi.fn(),
  }),
);
vi.mock("../client/src/lib/services/sensorService", () => ({
  fetchSensorReadings: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// These binders need only the page's I/O state, not a mounted Svelte component.
function researchFixture() {
  return {
    live: true,
    trip: {
      mounted: true,
      mode: "online",
      origin: [10.3, 123.9],
      destination: [10.32, 123.92],
      retry: 0,
      roads: [],
      error: "",
      status: "loading",
      config: { url: "https://example.test", key: "test-key" },
      refresh: 0,
      rows: [],
      sensorError: "",
      sensorLoading: false,
      now: 0,
    },
  } as unknown as ResearchState;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("extracted research request lifecycle", () => {
  it("aborts old routing and ignores its late result after switching to demo", async () => {
    const pending = deferred<RoadRoute[]>();
    vi.mocked(fetchRoadRoutes).mockReturnValueOnce(pending.promise);
    const research = researchFixture();
    const dispose = bindResearchRouting(research);
    const signal = vi.mocked(fetchRoadRoutes).mock.calls[0][2];
    dispose?.();
    expect(signal?.aborted).toBe(true);
    research.trip.mode = "demo";
    bindResearchRouting(research);
    pending.resolve([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(research.trip.roads).toBe(DEMO_ROADS);
    expect(research.trip.status).toBe("ready");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("allows a fresh page instance to load without interference from the disposed page", async () => {
    const oldRequest = deferred<RoadRoute[]>();
    const freshRequest = deferred<RoadRoute[]>();
    vi.mocked(fetchRoadRoutes)
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(freshRequest.promise);
    const previous = researchFixture();
    bindResearchRouting(previous)?.();
    const current = researchFixture();
    const dispose = bindResearchRouting(current);
    freshRequest.resolve(DEMO_ROADS);
    oldRequest.resolve([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(current.trip.roads).toBe(DEMO_ROADS);
    expect(current.trip.status).toBe("ready");
    expect(previous.trip.roads).toEqual([]);
    dispose?.();
  });

  it("aborts sensor requests and does not rearm polling after cleanup", async () => {
    const pending = deferred<SensorReading[]>();
    vi.mocked(fetchSensorReadings).mockReturnValueOnce(pending.promise);
    const research = researchFixture();
    const dispose = bindResearchSensors(research);
    const signal = vi.mocked(fetchSensorReadings).mock.calls[0][2];
    dispose?.();
    expect(signal?.aborted).toBe(true);
    pending.resolve([{ sensor_id: "late" } as SensorReading]);
    await vi.advanceTimersByTimeAsync(60000);
    expect(research.trip.rows).toEqual([]);
    expect(fetchSensorReadings).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears scheduled sensor polling on unmount", async () => {
    vi.mocked(fetchSensorReadings).mockResolvedValue([]);
    const dispose = bindResearchSensors(researchFixture());
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    dispose?.();
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetchSensorReadings).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
