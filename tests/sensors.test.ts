import { describe, expect, it, vi } from "vitest";
import {
  createHandler,
  validateReading,
} from "../supabase/functions/ingest-reading/handler";
import {
  fetchSensorReadings,
  parseSensorReadings,
  sensorIsFresh,
  sensorZones,
  SensorReading,
} from "../src/services/sensorService";
const now = Date.now();
const reading = {
  sensor_id: "cebu-001",
  reading_id: "469099cc-cf60-4789-90a0-75c161294169",
  water_depth_cm: 23.5,
};
const row: SensorReading = {
  sensor_id: "cebu-001",
  name: "Test",
  affected_road: "Test road",
  latitude: 10.3,
  longitude: 123.9,
  radius_meters: 50,
  water_depth_cm: 23.5,
  observed_at: new Date(now).toISOString(),
  received_at: new Date(now).toISOString(),
};
const post = (body: unknown = reading, token = "a".repeat(64)) =>
  new Request("https://example.test", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-device-token": token },
    body: JSON.stringify(body),
  });
describe("ESP ingestion", () => {
  it.each([-1, 1001, "23", null, NaN])("rejects invalid depths %s", (depth) =>
    expect(() =>
      validateReading({ ...reading, water_depth_cm: depth }),
    ).toThrow(),
  );
  it("sets server timestamp and rejects stale/future/invalid payloads", () => {
    expect(validateReading(reading, now).observed_at).toBe(
      new Date(now).toISOString(),
    );
    expect(() =>
      validateReading(
        { ...reading, observed_at: new Date(now + 120000).toISOString() },
        now,
      ),
    ).toThrow();
    expect(() =>
      validateReading(
        { ...reading, observed_at: new Date(now - 90000000).toISOString() },
        now,
      ),
    ).toThrow();
    expect(() => validateReading({ ...reading, reading_id: "bad" })).toThrow();
  });
  it("requires device token before database access", async () => {
    const fetcher = vi.fn();
    const handler = createHandler(
      { url: "https://example.test", serviceKey: "server-key" },
      fetcher,
    );
    expect((await handler(post(reading, ""))).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects disabled, unknown, inactive or wrong-token devices", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("[]"));
    const response = await createHandler(
      { url: "https://example.test", serviceKey: "server-key" },
      fetcher,
    )(post());
    expect(response.status).toBe(401);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toContain(
      "enabled=eq.true&flood_sensors.active=eq.true",
    );
  });
  it("stores validated readings with idempotency; never sends plaintext token to database", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('[{"sensor_id":"cebu-001"}]'))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    const response = await createHandler(
      { url: "https://example.test", serviceKey: "server-key" },
      fetcher,
    )(post());
    expect(response.status).toBe(202);
    expect(fetcher.mock.calls[0][0]).not.toContain("a".repeat(64));
    expect(fetcher.mock.calls[1][0]).toContain(
      "on_conflict=sensor_id,reading_id",
    );
    expect(fetcher.mock.calls[1][1].headers.Prefer).toContain(
      "ignore-duplicates",
    );
  });
  it("handles storage failure and oversized input", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("error", { status: 500 }));
    const handler = createHandler(
      { url: "https://example.test", serviceKey: "server-key" },
      fetcher,
    );
    expect((await handler(post())).status).toBe(503);
    expect(
      (await handler(post({ ...reading, large: "x".repeat(3000) }))).status,
    ).toBe(413);
  });
});
describe("sensor feed", () => {
  it("validates metadata and does not invent a zero for missing readings", () => {
    expect(parseSensorReadings([row])).toEqual([row]);
    expect(() =>
      parseSensorReadings([{ ...row, water_depth_cm: "10" }]),
    ).toThrow();
    expect(sensorIsFresh({ ...row, water_depth_cm: null }, now)).toBe(false);
    expect(sensorZones([{ ...row, water_depth_cm: null }])).toEqual([]);
  });
  it("tracks observation and receipt age, including disconnected sensors", () => {
    expect(sensorIsFresh(row, now)).toBe(true);
    expect(sensorIsFresh(row, now + 300001)).toBe(false);
    expect(
      sensorIsFresh(
        { ...row, observed_at: new Date(now - 400000).toISOString() },
        now,
      ),
    ).toBe(false);
    expect(
      sensorIsFresh(
        { ...row, received_at: new Date(now + 120000).toISOString() },
        now,
      ),
    ).toBe(false);
  });
  it("keeps positive hazards and clears measured zero only", () => {
    expect(sensorZones([row])[0].depthCm).toBe(23.5);
    expect(sensorZones([{ ...row, water_depth_cm: 0 }])).toEqual([]);
  });
  it("rejects missing config and frontend secret keys", async () => {
    const signal = new AbortController().signal;
    await expect(fetchSensorReadings("", "", signal)).rejects.toThrow(
      "not configured",
    );
    await expect(
      fetchSensorReadings("https://example.test", "sb_secret_test", signal),
    ).rejects.toThrow("publishable");
  });
});
