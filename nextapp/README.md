# FloodNav

Cebu navigation prototype using React, TypeScript, Vite and Leaflet with Google Hybrid, Satellite and Streets basemaps. Hybrid is the default, matching the Resilience project.

## Run

Use Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
npm run build
npm run preview
```

The development server uses port 3000. Google tiles and Online routing require internet. No API key is used by the inherited Resilience tile setup.

## Demo walkthrough

1. Choose **Demo scenarios**. The bundled trip is Fuente Osmeña to SM City Cebu; the bypass travels via Ayala.
2. Select **Dry roads**, then **Start / resume simulation**. Progress uses distance along the road geometry, at accelerated demo speed (80 meters per second).
3. Select **Flooded primary / bypass available**. The primary becomes blocked and playback pauses. Apply the flood-avoiding alternative, then start playback.
4. Switch Google Hybrid / Satellite / Streets. Route selection, trip progress and map viewport are preserved.
5. Select **All routes blocked**. No alternative is offered and playback cannot continue.
6. **Reset trip** returns the vehicle to the beginning of the selected route. Reset the scenario to Dry roads and choose the primary if the selected alternative is unavailable.

Online mode accepts preset destinations or a map click and a preset/GPS origin. It uses actual OSRM geometry, distance, duration and maneuvers. Vehicle changes and mock hazard evaluation do not refetch road routes. Failed requests show Retry and a Demo option; no straight-line route is substituted.

## Data and behavior

- Demo floods, traffic and vehicle thresholds are simulated. Online mode can instead use ESP observations via Supabase. Neither establishes real-world road safety; Google basemaps supply no flood or traffic readings.
- The primary is the first OSRM candidate. The alternative is the fastest distinct returned candidate with no intersection against any active mock flood circle. No candidate means no alternative; this does not prove no other route exists.
- Flood detection checks every line segment, including circle boundary contact. A primary is blocked above the selected simulation threshold; equality is within the demo threshold only.
- Navigation is a simulator, not live GPS tracking. Remaining distance follows geometry and remaining time is proportional to OSRM duration, not live traffic. Changing trip inputs or route selection pauses and resets progress. A newly blocked route pauses in place.
- Speech depends on browser voices. Repeated identical alerts are suppressed for a trip. GPS errors retain the existing origin.
- Demo routes are bundled and work without the routing API. Basemap tiles still require internet; unavailable tiles show a retry notice without disabling demo controls.
- All routing currently uses the driving profile, including motorcycle and bicycle examples. These vehicle choices only change the illustrative flood threshold.
- Geocoding, accounts, public deployment, live GPS guidance and arbitrary road-graph hazard avoidance are outside this milestone. Supabase sensor storage and protected ingestion have been added; cloud provisioning is still required.

## Fixtures

`src/data/demoRoutes.json` and `demoBypass.json` are OSRM responses captured on 2026-09-20, including road geometries and maneuvers. Endpoints are Fuente Osmeña (10.3117, 123.8938) and SM City Cebu (10.3121, 123.9184); the bypass includes Ayala (10.3177, 123.9054). Underlying road data is OpenStreetMap; routing is OSRM. Synthetic scenario circles are chosen deterministically from these geometries and never represent actual flood observations.

Map tiles use the existing Resilience Google tile URLs, not the Google Maps JavaScript API. This direct endpoint is an inherited prototype dependency; provider availability is not guaranteed. Before a public rollout, validate the intended Google Maps integration and provider terms, routing capacity and verified hazard sources.

## Verification

```sh
npm test
npm run test:e2e
npm run build
```

Unit tests cover segment intersections, thresholds, deterministic scenarios, malformed API responses, cancellation, stale request generations, warning deduplication and distance interpolation. Browser tests run against a local Vite server and mock routing/tiles for repeatability, covering map layers, scenarios, progress, arrival, GPS denial, tile/API failure and mobile width.

Browser tests default to installed Microsoft Edge. Set `PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome. Browser screenshots are written to ignored `test-results/`.

## Development baseline

This folder uses a local Git repository; no remote or deployment is configured. Keep dependency lockfile and captured demo fixtures in version control; do not commit build outputs, reports or local environment files.

## Supabase ESP sensor setup

See [docs/SUPABASE.md](docs/SUPABASE.md) for project creation, SQL migration, per-device token registration, Edge Function deployment, frontend environment variables and test readings. Depth arrives directly in centimeters. The frontend polls every 15 seconds and pauses simulation on missing/stale readings; sensor mode avoids all positive water observations regardless of demo vehicle thresholds.

## ESP32 firmware

Open [firmware/esp32](firmware/esp32/README.md) as a PlatformIO project. The serial commissioning environment sends measured centimeters through verified HTTPS; the hardware adapter is isolated for your actual sensor. In the web app, **Supabase connection → Test and save connection** configures the public feed without rebuilding or editing `.env`.
