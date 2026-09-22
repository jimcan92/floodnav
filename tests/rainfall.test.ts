import { describe, expect, it, vi } from "vitest";
import {
  assessRoutes,
  cellCenter,
  contains,
  gridCell,
  loadLoggingPreference,
  MODEL,
  routeCells,
  sampleRate,
} from "../client/src/lib/services/rainfallAssessment";
import {
  parseHazards,
  parseRoads,
  parseWeather,
  RainfallService,
} from "../client/src/lib/server/rainfall";
import type {
  AssessmentRoad,
  HazardData,
  HazardFeature,
  WeatherData,
} from "../client/src/lib/types/rainfall";

const now = Date.parse("2026-09-22T01:00:00Z");
const road: AssessmentRoad = {
  key: "road_0",
  polyline: [
    [10.301, 123.901],
    [10.301, 123.919],
  ],
  distanceMeters: 2000,
  durationSeconds: 300,
};
const rectangle = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  susceptibility: "LF" | "MF" | "HF" | "VHF" = "LF",
): HazardFeature => ({
  type: "Feature",
  properties: { id: `${x1}:${y1}:${susceptibility}`, susceptibility },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [x1, y1],
        [x2, y1],
        [x2, y2],
        [x1, y2],
        [x1, y1],
      ],
    ],
  },
});
const forecast = {
  list: [
    {
      dt: (now + 7200000) / 1000,
      rain: { "3h": 12 },
      pop: 0.8,
      weather: [{ id: 500 }],
    },
  ],
};
const current = {
  dt: now / 1000,
  coord: { lat: 10.31, lon: 123.91 },
  rain: { "1h": 2 },
  weather: [{ id: 500 }],
};
const sample = parseWeather(
  current,
  forecast,
  gridCell(road.polyline[0]),
  new Date(now).toISOString(),
  new Date(now).toISOString(),
);
const weather: WeatherData = { samples: [sample], errors: [] };
const hazards: HazardData = {
  features: [rectangle(123.89, 10.29, 123.93, 10.34)],
  source: "MGB",
  fetchedAt: new Date(now).toISOString(),
  verified: true,
};

describe("weather validation", () => {
  it("keeps mm/hour, mm/3h and probability separate", () => {
    expect(sample.rainMmH).toBe(2);
    expect(sample.forecast[0]).toMatchObject({
      rainMm3h: 12,
      probability: 0.8,
    });
    expect(sampleRate(sample, now)).toBe(4);
  });
  it("allows omitted rain only for valid non-rain conditions", () => {
    expect(
      parseWeather(
        { ...current, rain: undefined, weather: [{ id: 800 }] },
        forecast,
        sample.cell,
        sample.fetchedAt,
        sample.forecastFetchedAt,
      ).rainMmH,
    ).toBe(0);
    for (const data of [
      { ...current, rain: undefined },
      { ...current, rain: { "1h": -1 } },
      { ...current, coord: null },
      { ...current, dt: "bad" },
    ])
      expect(() =>
        parseWeather(
          data,
          forecast,
          sample.cell,
          sample.fetchedAt,
          sample.forecastFetchedAt,
        ),
      ).toThrow();
    expect(() =>
      parseWeather(
        current,
        { list: [{ ...forecast.list[0], pop: 2 }] },
        sample.cell,
        sample.fetchedAt,
        sample.forecastFetchedAt,
      ),
    ).toThrow();
  });
  it("rejects stale observations, expired forecasts and missing upcoming interval", () => {
    expect(sampleRate(sample, now + 31 * 60000)).toBeNull();
    expect(
      sampleRate(
        { ...sample, forecastFetchedAt: new Date(now - 3600000).toISOString() },
        now,
      ),
    ).toBeNull();
    expect(sampleRate({ ...sample, forecast: [] }, now)).toBeNull();
  });
});

describe("geometry and experimental ranking", () => {
  it("samples every crossed grid cell, not just road vertices", () => {
    const cells = routeCells([
      {
        ...road,
        polyline: [
          [10.301, 123.901],
          [10.301, 123.961],
        ],
      },
    ]);
    expect(cells).toHaveLength(4);
    expect(gridCell(cellCenter(cells[0]))).toBe(cells[0]);
  });
  it("splits at polygon boundaries and selects highest overlapping class without double count", () => {
    const result = assessRoutes(
      [road],
      weather,
      {
        ...hazards,
        features: [
          ...hazards.features,
          rectangle(123.91, 10.29, 123.93, 10.34, "VHF"),
        ],
      },
      now,
    ).routes[0];
    expect(result.coverage).toBeCloseTo(1);
    expect(result.distanceByClass.LF).toBeCloseTo(
      result.distanceByClass.VHF,
      5,
    );
    expect(result.score).toBeCloseTo(
      (result.distanceByClass.LF + 4 * result.distanceByClass.VHF) * 1.4,
      6,
    );
  });
  it("handles holes, boundary-collinear lines and MultiPolygons", () => {
    const outer = rectangle(123.89, 10.29, 123.93, 10.34);
    if (outer.geometry.type !== "Polygon") throw new Error();
    const hole = rectangle(123.909, 10.3, 123.911, 10.302);
    if (hole.geometry.type !== "Polygon") throw new Error();
    outer.geometry.coordinates.push(hole.geometry.coordinates[0]);
    expect(contains(outer, [10.301, 123.91])).toBe(false);
    expect(
      assessRoutes([road], weather, { ...hazards, features: [outer] }, now)
        .routes[0].score,
    ).toBeNull();
    expect(
      assessRoutes(
        [
          {
            ...road,
            polyline: [
              [10.29, 123.901],
              [10.29, 123.919],
            ],
          },
        ],
        {
          samples: [{ ...sample, cell: gridCell([10.29, 123.901]) }],
          errors: [],
        },
        {
          ...hazards,
          features: [
            {
              ...outer,
              geometry: {
                type: "MultiPolygon",
                coordinates: [outer.geometry.coordinates],
              },
            },
          ],
        },
        now,
      ).routes[0].coverage,
    ).toBe(1);
  });
  it("recommends lower susceptibility under identical rain and ignores duplicate routes", () => {
    const alt = {
      ...road,
      key: "road_1",
      polyline: [
        [10.305, 123.901],
        [10.305, 123.919],
      ] as [number, number][],
    };
    const data = {
      ...hazards,
      features: [
        ...hazards.features,
        rectangle(123.89, 10.3, 123.93, 10.302, "VHF"),
      ],
    };
    expect(assessRoutes([road, alt], weather, data, now).recommendedKey).toBe(
      "road_1",
    );
    expect(
      assessRoutes([road, { ...road, key: "road_1" }], weather, data, now)
        .recommendedKey,
    ).toBeNull();
    expect(
      assessRoutes([road, alt], weather, { ...data, verified: false }, now)
        .recommendedKey,
    ).toBeNull();
    expect(
      assessRoutes([road, alt], { samples: [], errors: ["timeout"] }, data, now)
        .recommendedKey,
    ).toBeNull();
  });
  it("does not suggest a longer equally susceptible route or fabricate absent alternatives", () => {
    const longer = {
      ...road,
      key: "road_1",
      polyline: [
        [10.302, 123.9],
        [10.302, 123.919],
      ] as [number, number][],
    };
    expect(
      assessRoutes([road, longer], weather, hazards, now).recommendedKey,
    ).toBeNull();
    expect(
      assessRoutes([road], weather, hazards, now).recommendedKey,
    ).toBeNull();
  });
  it("validates input bounds, classes and closed geometry", () => {
    expect(() =>
      parseRoads({
        roads: [
          {
            ...road,
            polyline: [
              [0, 0],
              [1, 1],
            ],
          },
        ],
      }),
    ).toThrow();
    expect(() => parseRoads({ roads: [road, road] })).toThrow();
    expect(() =>
      parseHazards({
        type: "FeatureCollection",
        features: [
          { ...hazards.features[0], properties: { FloodSusc: "UNKNOWN" } },
        ],
      }),
    ).toThrow();
  });
});

describe("logging contract", () => {
  it("defaults browser preference on, and restores disabled before requests", () => {
    expect(loadLoggingPreference({ getItem: () => null })).toBe(true);
    expect(loadLoggingPreference({ getItem: () => "false" })).toBe(false);
  });
  function service() {
    const request = vi.fn(async () => new Response("{}", { status: 200 }));
    const service = new RainfallService(
      () => ({
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "server-secret",
      }),
      request,
      () => now,
    );
    vi.spyOn(service, "weather").mockResolvedValue({
      data: weather,
      snapshots: [
        { id: "a".repeat(64), kind: "weather", payload: { raw: current } },
      ],
    });
    vi.spyOn(service, "hazards").mockResolvedValue({
      data: hazards,
      snapshots: [
        {
          id: "b".repeat(64),
          kind: "hazard",
          payload: { features: hazards.features },
        },
      ],
    });
    return { service, request };
  }
  const body = {
    roads: [road],
    assessmentId: "469099cc-cf60-4789-90a0-75c161294169",
  };
  it("makes ZERO research requests for false, missing or string-true flags, including retries", async () => {
    const { service: s, request } = service();
    for (const loggingEnabled of [undefined, false, "true", false])
      expect(
        (await s.assessment({ ...body, loggingEnabled })).loggingStatus,
      ).toBe("disabled");
    expect(request).not.toHaveBeenCalled();
  });
  it("enabling after a cache hit saves snapshots, and retries preserve the ID and payload", async () => {
    const { service: s, request } = service();
    await s.assessment({ ...body, loggingEnabled: false });
    expect(
      (await s.assessment({ ...body, loggingEnabled: true })).loggingStatus,
    ).toBe("saved");
    await s.assessment({ ...body, loggingEnabled: true });
    expect(
      (request.mock.calls as unknown as [string, RequestInit][])[0][1].body,
    ).toEqual(
      (request.mock.calls as unknown as [string, RequestInit][])[1][1].body,
    );
    const saved = JSON.parse(
      (request.mock.calls as unknown as [string, RequestInit][])[0][1]
        .body as string,
    ).p_batch;
    expect(saved.snapshots).toHaveLength(2);
    expect(saved.model).toEqual(MODEL);
    await s.assessment({ ...body, loggingEnabled: false });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("database failures do not remove scores and do not leak secrets", async () => {
    const { service: s, request } = service();
    request.mockRejectedValue(new Error("server-secret"));
    const result = await s.assessment({ ...body, loggingEnabled: true });
    expect(result.loggingStatus).toBe("failed");
    expect(result.routes[0].score).not.toBeNull();
    expect(JSON.stringify(result)).not.toContain("server-secret");
  });
});

describe("provider acquisition", () => {
  it("deduplicates cached requests without database writes", async () => {
    const request = vi.fn(
      async (input: string | URL | Request) =>
        new Response(
          JSON.stringify(
            String(input).includes("/forecast?") ? forecast : current,
          ),
          { status: 200 },
        ),
    );
    const service = new RainfallService(
      () => ({ OPENWEATHER_API_KEY: "private-test-key" }),
      request,
      () => now,
    );
    const [a, b] = await Promise.all([
      service.weather([road]),
      service.weather([road]),
    ]);
    expect(a.data.samples).toHaveLength(1);
    expect(a.snapshots.map((s) => s.id)).toEqual(b.snapshots.map((s) => s.id));
    expect(request).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(a)).not.toContain("private-test-key");
  });
  it("keeps current data if forecast fails, without fabricating a forecast snapshot", async () => {
    const request = vi.fn(async (input: string | URL | Request) =>
      String(input).includes("/forecast?")
        ? new Response("{}", { status: 401 })
        : new Response(JSON.stringify(current)),
    );
    const service = new RainfallService(
      () => ({ OPENWEATHER_API_KEY: "private-test-key" }),
      request,
      () => now,
    );
    const result = await service.weather([road]);
    expect(result.data.samples[0].rainMmH).toBe(2);
    expect(result.data.samples[0].forecast).toEqual([]);
    expect(result.snapshots).toHaveLength(1);
    expect(sampleRate(result.data.samples[0], now)).toBeNull();
  });
  it("rate-limit failures become unavailable with cooldown, never zero rainfall", async () => {
    const request = vi.fn(
      async () =>
        new Response("{}", { status: 429, headers: { "retry-after": "120" } }),
    );
    const service = new RainfallService(
      () => ({ OPENWEATHER_API_KEY: "private-test-key" }),
      request,
      () => now,
    );
    const result = await service.weather([road]);
    expect(result.data.samples).toEqual([]);
    expect(result.data.errors.length).toBeGreaterThan(0);
    const calls = request.mock.calls.length;
    await service.weather([road]);
    expect(request).toHaveBeenCalledTimes(calls);
  });
  it("rejects incomplete MGB pagination rather than assessing partial polygons", async () => {
    const request = vi.fn(
      async (input: string | URL | Request) =>
        new Response(
          JSON.stringify(
            String(input).includes("returnCountOnly")
              ? { count: 2 }
              : { type: "FeatureCollection", features: [] },
          ),
        ),
    );
    const service = new RainfallService(
      () => ({ MGB_DATA_VERIFIED: "true" }),
      request,
      () => now,
    );
    const result = await service.hazards([road]);
    expect(result.data.verified).toBe(false);
    expect(result.data.error).toContain("pagination incomplete");
    expect(result.snapshots).toHaveLength(0);
  });
});
