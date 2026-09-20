import { validateSupabaseConfig } from "./supabaseConfig";
import { Coordinate, FloodHazardZone } from "../types/navigation";
export interface SensorReading {
  sensor_id: string;
  name: string;
  affected_road: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  water_depth_cm: number | null;
  observed_at: string | null;
  received_at: string | null;
}
export const SENSOR_STALE_MS = 5 * 60 * 1000;
export function parseSensorReadings(data: unknown): SensorReading[] {
  if (!Array.isArray(data)) throw new Error("Invalid sensor response.");
  return data.map((r: SensorReading) => {
    if (
      !r ||
      typeof r.sensor_id !== "string" ||
      typeof r.name !== "string" ||
      typeof r.affected_road !== "string" ||
      !Number.isFinite(r.latitude) ||
      Math.abs(r.latitude) > 90 ||
      !Number.isFinite(r.longitude) ||
      Math.abs(r.longitude) > 180 ||
      !Number.isFinite(r.radius_meters) ||
      r.radius_meters <= 0 ||
      (r.water_depth_cm !== null &&
        (!Number.isFinite(r.water_depth_cm) ||
          r.water_depth_cm < 0 ||
          r.water_depth_cm > 1000)) ||
      (r.observed_at !== null && !Number.isFinite(Date.parse(r.observed_at))) ||
      (r.received_at !== null && !Number.isFinite(Date.parse(r.received_at)))
    )
      throw new Error("Invalid sensor reading.");
    return r;
  });
}
export function sensorIsFresh(r: SensorReading, now = Date.now()): boolean {
  if (r.water_depth_cm === null || !r.observed_at || !r.received_at)
    return false;
  const observed = Date.parse(r.observed_at),
    received = Date.parse(r.received_at);
  return (
    observed <= now + 60000 &&
    received <= now + 60000 &&
    now - observed <= SENSOR_STALE_MS &&
    now - received <= SENSOR_STALE_MS
  );
}
export function sensorZones(readings: SensorReading[]): FloodHazardZone[] {
  return readings
    .filter((r) => r.water_depth_cm !== null && r.water_depth_cm > 0)
    .map((r) => ({
      id: r.sensor_id,
      name: r.name,
      center: [r.latitude, r.longitude] as Coordinate,
      radiusMeters: r.radius_meters,
      depthCm: r.water_depth_cm!,
      severity: "impassable",
      affectedRoad: r.affected_road,
      reportedTime: r.observed_at || "No reading",
      description:
        "ESP sensor observation. Coverage radius is configured, not measured flood extent.",
      active: true,
    }));
}
export async function fetchSensorReadings(
  url: string,
  key: string,
  signal: AbortSignal,
): Promise<SensorReading[]> {
  if (!url || !key)
    throw new Error(
      "Supabase is not configured. Open Supabase connection below, or set the VITE_SUPABASE variables.",
    );
  ({ url, key } = validateSupabaseConfig({ url, key }));
  const response = await fetch(
    `${url.replace(/\/$/, "")}/rest/v1/latest_flood_readings?select=*&order=sensor_id.asc&limit=1000`,
    {
      signal,
      headers: {
        apikey: key,
        ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
      },
    },
  );
  if (!response.ok)
    throw new Error(
      `Sensor feed unavailable (${response.status}). Check Supabase setup and RLS policies.`,
    );
  const rows = parseSensorReadings(await response.json());
  if (rows.length >= 1000)
    throw new Error(
      "Sensor limit reached; pagination is required before using this feed.",
    );
  return rows;
}
