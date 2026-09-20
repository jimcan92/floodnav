export interface ReadingPayload {
  sensor_id: string;
  reading_id: string;
  water_depth_cm: number;
  observed_at?: string;
}
export function validateReading(
  value: unknown,
  now = Date.now(),
): ReadingPayload {
  const body = value as ReadingPayload;
  if (
    !body ||
    typeof body.sensor_id !== "string" ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(body.sensor_id) ||
    typeof body.reading_id !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      body.reading_id,
    ) ||
    typeof body.water_depth_cm !== "number" ||
    !Number.isFinite(body.water_depth_cm) ||
    body.water_depth_cm < 0 ||
    body.water_depth_cm > 1000
  )
    throw new Error(
      "Expected sensor_id, UUID reading_id and water_depth_cm between 0 and 1000.",
    );
  if (
    body.observed_at !== undefined &&
    (typeof body.observed_at !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$/.test(body.observed_at) ||
      !Number.isFinite(Date.parse(body.observed_at)) ||
      Date.parse(body.observed_at) > now + 60000 ||
      Date.parse(body.observed_at) < now - 86400000)
  )
    throw new Error(
      "observed_at must be an ISO timestamp within the past 24 hours, at most 60 seconds in the future.",
    );
  return {
    sensor_id: body.sensor_id,
    reading_id: body.reading_id,
    water_depth_cm: Math.round(body.water_depth_cm * 100) / 100,
    observed_at: body.observed_at || new Date(now).toISOString(),
  };
}
export function createHandler(
  config: { url: string; serviceKey: string },
  requestFetch: typeof fetch = fetch,
) {
  const respond = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST")
      return respond(405, { error: "POST required" });
    const token = request.headers.get("x-device-token");
    if (!token || !/^[a-f0-9]{64}$/i.test(token))
      return respond(401, { error: "Invalid device credentials" });
    if (!config.url || !config.serviceKey)
      return respond(503, { error: "Ingestion is not configured" });
    if (!request.headers.get("content-type")?.includes("application/json"))
      return respond(415, { error: "JSON required" });
    if (Number(request.headers.get("content-length")) > 2048)
      return respond(413, { error: "Payload too large" });
    let body: ReadingPayload;
    try {
      // Bound streamed input too, including requests without Content-Length.
      const reader = request.body?.getReader();
      if (!reader) return respond(400, { error: "Missing body" });
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 2048) {
          await reader.cancel();
          return respond(413, { error: "Payload too large" });
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      body = validateReading(JSON.parse(new TextDecoder().decode(bytes)));
    } catch (e) {
      return respond(400, {
        error: e instanceof Error ? e.message : "Invalid JSON",
      });
    }
    try {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(token),
      );
      const hash = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const headers = {
        apikey: config.serviceKey,
        Authorization: `Bearer ${config.serviceKey}`,
        "Content-Type": "application/json",
      };
      const credentials = await requestFetch(
        `${config.url}/rest/v1/sensor_devices?select=sensor_id,flood_sensors!inner(active)&sensor_id=eq.${encodeURIComponent(body.sensor_id)}&token_sha256=eq.${hash}&enabled=eq.true&flood_sensors.active=eq.true`,
        { headers, signal: AbortSignal.timeout(8000) },
      );
      if (!credentials.ok)
        return respond(503, { error: "Device lookup unavailable" });
      const devices = await credentials.json();
      if (!Array.isArray(devices) || devices.length !== 1)
        return respond(401, { error: "Invalid device credentials" });
      const result = await requestFetch(
        `${config.url}/rest/v1/flood_readings?on_conflict=sensor_id,reading_id`,
        {
          method: "POST",
          headers: {
            ...headers,
            Prefer: "resolution=ignore-duplicates,return=minimal",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!result.ok)
        return respond(503, { error: "Reading storage unavailable" });
      return respond(202, { accepted: true, reading_id: body.reading_id });
    } catch {
      return respond(503, { error: "Ingestion temporarily unavailable" });
    }
  };
}
