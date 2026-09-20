import { useEffect, useState } from "react";
import {
  fetchSensorReadings,
  SensorReading,
  sensorIsFresh,
} from "../services/sensorService";
const url = import.meta.env.VITE_SUPABASE_URL || "";
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
export const sensorsConfigured = !!url && !!key;
export function useSensorReadings(enabled: boolean) {
  const [rows, setRows] = useState<SensorReading[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let timer: number;
    let controller: AbortController;
    const poll = async () => {
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      setLoading(true);
      try {
        const readings = await fetchSensorReadings(url, key, controller.signal);
        if (!disposed) {
          setRows(readings);
          setError("");
        }
      } catch (e) {
        if (!disposed)
          setError(e instanceof Error ? e.message : "Sensor feed unavailable.");
      } finally {
        clearTimeout(timeout);
        if (!disposed) {
          setLoading(false);
          setNow(Date.now());
          timer = window.setTimeout(poll, 15000);
        }
      }
    };
    void poll();
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(tick);
      controller?.abort();
    };
  }, [enabled, refresh]);
  const freshCount = rows.filter((r) =>
    sensorIsFresh(r, Math.max(now, Date.now())),
  ).length;
  return {
    rows,
    error,
    loading,
    freshCount,
    usable: rows.length > 0 && rows.length === freshCount && !error,
    retry: () => setRefresh((n) => n + 1),
  };
}
