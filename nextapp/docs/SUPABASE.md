# Supabase + ESP flood readings

Ang data flow: **ESP → ingest-reading Edge Function → flood_readings → FloodNav**.
The ESP already calculates water depth in centimeters; no distance-to-water conversion is applied here.

## 1. Create the cloud project

1. Sign in at https://supabase.com/dashboard and create a new project in your organization. Choose your region and store the database password privately.
2. Open **SQL Editor** and run `supabase/migrations/202609200001_flood_sensors.sql` once in the new project.
3. Under the project's API settings / Connect dialog, copy the **project URL** and **publishable key**. Enter these browser-safe values in the FloodNav **Supabase connection** form. A local `.env` copied from `.env.example` is also supported.
4. Restart `npm run dev`. Online mode will default to **Supabase ESP sensors** when both variables exist. Demo scenarios always stay isolated from sensor readings.

Do not place a service-role or secret key in `.env`, frontend code, ESP firmware, screenshots or chat. The Edge Function uses its server-only built-in `SUPABASE_SERVICE_ROLE_KEY`.

## 2. Register the first sensor

Edit the name, road and coordinates to the actual installation before running this SQL. The example location is illustrative and does not claim a real sensor exists there. `radius_meters` is a manually configured influence radius, not measured flood extent.

```sql
insert into public.flood_sensors (id, name, affected_road, latitude, longitude, radius_meters)
values ('cebu-001', 'First ESP flood sensor', 'REPLACE WITH ACTUAL ROAD', 10.3117, 123.8938, 50);

-- Generate a unique device token; copy the returned value into that ESP only.
-- Only its SHA-256 hash is stored in the database.
with token as (select encode(extensions.gen_random_bytes(32), 'hex') as value),
created as (
  insert into public.sensor_devices (sensor_id, token_sha256)
  select 'cebu-001', encode(extensions.digest(value, 'sha256'), 'hex') from token
  returning sensor_id
)
select created.sensor_id, token.value as device_token from created cross join token;
```

Keep the returned token private. Use a different token for every sensor. Never put this token in FloodNav's frontend. Sensor metadata and readings are deliberately public-read for active sensors; credentials and all client writes are blocked by table privileges and RLS.

## 3. Deploy the ingestion function

From this repository, using the Supabase CLI:

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy ingest-reading
```

The checked-in function config sets `verify_jwt = false` because devices use the `x-device-token` header instead of a Supabase user JWT. The handler hashes and checks the token against an enabled device belonging to an active sensor before accepting any write. Do not deploy an unprotected replacement handler.

If you prefer the Dashboard function editor, create `ingest-reading`, include both `index.ts` and `handler.ts`, and disable gateway JWT verification for this function. Keep the handler's device-token check enabled.

## 4. Send a test reading

Use HTTPS POST to:

`https://YOUR_PROJECT_REF.supabase.co/functions/v1/ingest-reading`

Headers:

```text
Content-Type: application/json
x-device-token: YOUR_SENSOR_TOKEN
```

Body:

```json
{
  "sensor_id": "cebu-001",
  "reading_id": "469099cc-cf60-4789-90a0-75c161294169",
  "water_depth_cm": 23.5
}
```

Generate a new UUID v4 `reading_id` for each new measurement. Reuse that ID when retrying the same reading: duplicate posts are accepted without inserting another row. HTTP 202 means accepted. A different payload with the same sensor/reading ID does not overwrite the original.

`observed_at` is optional. If omitted, the server timestamps receipt as the observation time; therefore only omit it for an immediate measurement, not buffered readings. If included, use a timezone-bearing ISO timestamp; data older than 24 hours or more than 60 seconds in the future is rejected. Depth must be a finite JSON number from 0 to 1000 cm. Do not convert sensor errors to zero: zero means a measured dry reading.

Example PowerShell (replace placeholders locally):

```powershell
$headers = @{ 'x-device-token' = 'YOUR_SENSOR_TOKEN' }
$payload = @{ sensor_id = 'cebu-001'; reading_id = [guid]::NewGuid().ToString(); water_depth_cm = 23.5 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/ingest-reading' -Headers $headers -ContentType 'application/json' -Body $payload
```

## 5. ESP behavior

Send a valid measurement about every 30 seconds. Use the platform's HTTPS client with certificate verification and a unique UUID per observation. On a network error or 503, retry the same reading ID with bounded backoff. On 400, fix the measurement/payload; on 401, check device ID/token and enabled status. Never log tokens.

This repository defines the wire contract; board firmware and sensor pin/calibration logic depend on your actual ESP model and sensor hardware and are not flashed by this setup.

## 6. Verify in FloodNav

1. In Supabase's Table Editor, check that `flood_readings` contains the test row and `latest_flood_readings` shows it.
2. In FloodNav, choose **Online routes → Supabase ESP sensors**. The status shows fresh sensor count and checks every 15 seconds after the previous request finishes.
3. Pick a route crossing the configured sensor radius. Any positive measured depth blocks that route in sensor mode, regardless of illustrative vehicle thresholds. A returned road alternative is offered only if it avoids reported-water circles.
4. Send a new reading of `0` only when the sensor actually measures dry ground. The hazard circle clears on the next refresh.
5. Stop sending data: after five minutes the feed becomes stale and simulation pauses. Missing, stale or failed feeds never silently become dry conditions. Last known positive hazards stay visible.

Five-minute freshness checks both observation and receipt times. Any active sensor with no fresh reading pauses the sensor-backed simulator. Sensor coverage remains limited; a route without an intersecting observation is not verified safe. There is no live traffic or live GPS driving guidance.

## Device maintenance

To revoke a device: `update public.sensor_devices set enabled = false where sensor_id = 'cebu-001';`.
To remove it from public map coverage: `update public.flood_sensors set active = false where id = 'cebu-001';`.
To rotate a token, generate a fresh 32-byte hex token and replace `token_sha256` with its SHA-256 hash, then provision the device with the new token.

Readings are append-only through ingestion. There is no automatic retention cleanup yet; monitor database growth and function usage during a pilot. This milestone does not include device management UI, anti-abuse rate limiting, private per-user sensor access or hardware calibration.

## Sources

- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/views
- https://supabase.com/docs/guides/functions/function-configuration

Cloud deployment and on-device validation require your Supabase project and actual sensor hardware. Local automated tests use mocked requests and do not prove a deployed RLS configuration.

## Configure directly in the app

The app now defaults to the Supabase sensor source. In **Online routes → Supabase ESP sensors → Supabase connection**, enter your project URL and publishable key and choose **Test and save connection**. The app tests the `latest_flood_readings` view before activating the connection. An empty table is a valid connection, but does not enable simulation until fresh readings arrive.

Only public connection values are saved in this browser's local storage. A different browser/device must be configured separately. **Use environment defaults** clears that saved override and restores the Vite environment configuration; `.env` remains supported for deployment. Secret/service-role keys are rejected before any request or persistence.

The sensor panel lists the reported depth, road and observation timestamp. Readings refresh every 15 seconds. The PlatformIO source is in [firmware/esp32](../firmware/esp32/README.md). Physical sensor wiring/driver selection still requires the exact sensor model.
