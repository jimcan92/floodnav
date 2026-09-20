import { useEffect, useRef, useState } from "react";
import {
  SupabaseConfig,
  validateSupabaseConfig,
  saveSupabaseConfig,
  clearSupabaseConfig,
  loadSupabaseConfig,
} from "../../services/supabaseConfig";
import { fetchSensorReadings } from "../../services/sensorService";
export function SupabaseConnection({
  config,
  onConnect,
}: {
  config: SupabaseConfig;
  onConnect: (config: SupabaseConfig) => void;
}) {
  const [url, setUrl] = useState(config.url);
  const [key, setKey] = useState(config.key);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    let next: SupabaseConfig;
    try {
      next = validateSupabaseConfig({ url, key });
    } catch (e) {
      setMessage((e as Error).message);
      return;
    }
    const request = new AbortController();
    controller.current = request;
    const timeout = window.setTimeout(() => request.abort(), 8000);
    setBusy(true);
    try {
      const rows = await fetchSensorReadings(
        next.url,
        next.key,
        request.signal,
      );
      if (request.signal.aborted) return;
      let saved = true;
      try {
        saveSupabaseConfig(next);
      } catch {
        saved = false;
      }
      onConnect(next);
      setMessage(
        `Connected: ${rows.length} sensors found. ${saved ? "Public connection settings saved in this browser." : "Browser storage unavailable; settings apply to this session only."}`,
      );
    } catch (e) {
      setMessage(
        request.signal.aborted
          ? "Connection timed out or cancelled. Existing connection retained."
          : (e as Error).message,
      );
    } finally {
      clearTimeout(timeout);
      if (controller.current === request) setBusy(false);
    }
  };
  return (
    <details open={!config.url || !config.key} className="notice">
      <summary className="cursor-pointer font-semibold">
        Supabase connection
      </summary>
      <form onSubmit={connect} className="space-y-3 mt-3">
        <label>
          Project URL
          <input
            aria-label="Supabase project URL"
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            placeholder="https://your-project.supabase.co"
          />
        </label>
        <label>
          Publishable key
          <input
            aria-label="Supabase publishable key"
            type="password"
            required
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={busy}
            placeholder="sb_publishable_..."
          />
        </label>
        <p>
          Public key only. Requires the FloodNav tables and
          latest_flood_readings view. No service-role or device tokens here.
        </p>
        <button type="submit" disabled={busy}>
          {busy ? "Testing connection…" : "Test and save connection"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            try {
              clearSupabaseConfig();
              const fallback = loadSupabaseConfig();
              setUrl(fallback.url);
              setKey(fallback.key);
              onConnect(fallback);
              setMessage("Saved settings removed; using environment defaults.");
            } catch {
              setMessage("Browser storage could not be cleared.");
            }
          }}
        >
          Use environment defaults
        </button>
        {message && <p role="status">{message}</p>}
      </form>
    </details>
  );
}
