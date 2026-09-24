# FloodNav

**A Cebu-focused routing and flood-context prototype with live GPS, satellite observations, and shared travel simulations.**

**Live site:** [floodnav-blue.vercel.app](https://floodnav-blue.vercel.app)

**Research interface:** [floodnav-blue.vercel.app/research](https://floodnav-blue.vercel.app/research)

**Developer:** Jimboy “jimcan” Cantila · **License:** [MIT](LICENSE)

FloodNav brings road routes, traffic, rainfall, flood susceptibility, satellite observations, and configurable demonstration scenarios into one map. Use it to compare routes, follow your device location, or explore how simulated conditions affect a journey.

> FloodNav is a prototype, not a flood-safety certification or emergency navigation service. Rainfall, susceptibility, and dated satellite observations do not establish current road passability. Follow official advisories and local conditions. Features on the live site depend on its deployed version and provider configuration.

## Contents

- [Features](#features)
- [How to use](#how-to-use)
- [Data sources](#data-sources)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Supabase setup](#supabase-setup)
- [Research interface](#research-interface)
- [Build and deployment](#build-and-deployment)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Architecture and project structure](#architecture-and-project-structure)
- [Limitations and privacy](#limitations-and-privacy)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License and attribution](#license-and-attribution)

## Features

- Compact desktop search bar and an expandable directions panel; responsive mobile trip controls.
- Starting point and destination selection through presets, explicit address search, map selection, or device location.
- Car, SUV, truck, motorcycle, and bicycle icons with tooltips and simulation-specific timing assumptions.
- Original and alternative road-route previews, route labels, and explicit route selection.
- Live GPS tracking, approximate route matching, and off-route rerouting.
- Separate demo playback with pause/resume and local speed controls.
- Streets, Satellite, and Hybrid basemaps; a Layers popup for satellite, susceptibility, and simulation overlays.
- Compact source/status chips with expandable explanations; separate errors and hazard warnings.
- Shared traffic/flood simulation areas with revision-checked updates.
- Experimental rainfall–susceptibility assessments at `/research`, with optional logging and exports.
- Installable web-app support and a bundled offline demonstration pathway.

## How to use

### 1. Open directions and choose locations

1. Open the [live site](https://floodnav-blue.vercel.app).
2. On desktop, click **Where to?** / the search area or the directions icon. On mobile, expand the trip controls.
3. Select a **Starting point** and **Destination**. Choose a preset, use **Choose on map**, or submit an address search with Enter/the search button. Starting-point suggestions also offer **Use my location**.
4. Use the swap control to reverse the endpoints.
5. Choose a vehicle icon. Hover to see its label; icon selection changes the vehicle used by the demonstration model.

The desktop planner collapses during map interaction and when travel starts. Reopen it through the compact bar; closing it does not discard the selected route or locations.

### 2. Compare and select routes

- The selected route is blue; available alternative previews are gray and labeled.
- Select a route card in the left panel or click an alternative line/label on the map. Alternative paths also support keyboard selection.
- Original and returned alternative geometries remain available for comparison during travel, even without simulated flooding or traffic.
- Routing requests ask for alternatives, including up to three from the live-traffic provider. **Two or three alternatives are not guaranteed:** the provider may return fewer distinct roads.
- If an original preview begins far from your current position, selecting it requests updated alternatives from your current position. Choose a returned updated route rather than restarting from the old origin.
- Accepting an alternative during travel pauses movement; review it and resume when ready.

A visible route is not a flood-free or safe-road guarantee. Blocked simulated routes can remain visible as comparison geometry.

### 3. Choose how to travel

| Mode | Behavior | Requirements |
|---|---|---|
| **Live GPS · actual travel** | Follows real device location; the timer does not move the traveler | HTTPS or localhost, location permission, and an open browser page |
| **Demo playback** | Moves a simulated traveler along the selected route | Usable route and simulation/provider state; no physical travel required |

Click **Start travel**, then use **Pause**, **Resume**, or **End trip**. Voice directions can be muted. GPS accuracy and stale-location messages should be checked before relying on the displayed position.

With simulation off, the default movement mode is live GPS. With simulation on, the default is demo playback; the selector allows an explicit choice. Background or locked-screen GPS operation is not guaranteed.

### 4. Read status chips and change map layers

- Top chips identify live/simulated conditions and statuses such as **Basic ETA** or **MGB pending**. Click a chip for its explanation; dismiss with its close button, Escape, or an outside click.
- **Basic ETA** means basic road routing is in use without live-traffic timing.
- **MGB pending** means susceptibility verification is not enabled, so experimental exposure ranking is unavailable.
- Open **Layers** at the lower left to choose the basemap or toggle satellite observations, flood susceptibility, and simulation areas. On mobile the control sits above the trip sheet.
- Detailed provider information is under **Flood & weather details** in the left panel. The notification bell exposes active notices; actual failures and flood warnings remain separate from passive status information.

Satellite observations show their acquisition dates and coverage. They are not continuous street-level monitoring and contain no water-depth estimate.

### 5. Configure a shared demonstration

1. Open **Simulation controls** using the settings icon.
2. Enable traffic and/or flood simulation as needed. These switches are independent; switching simulation off selects the corresponding live-source pathway.
3. Add an area, place it on the map, and set its radius and traffic level or flood depth.
4. Review the **Unpublished preview**, then click **Apply changes**.
5. Use the available presets or **Load example trip: Fuente → SM City** for a repeatable demonstration.

**Published simulation conditions are shared by all visitors.** Each browser has its own trip, vehicle choice, and playback position, but anyone can currently publish shared conditions without a login. A revision conflict keeps your draft for review instead of silently overwriting someone else's update.

Playback speed options range from **0.5× to 20×** and affect only your browser's simulated movement, not route ETA or shared conditions. Simulated depth above a vehicle's demonstration threshold blocks playback; these thresholds are not certified wading ratings.

### 6. Install or use the offline demo

Where supported, use the browser's install option or the app's install prompt. Offline support provides the cached application shell and a bundled demo after the necessary resources have been loaded. Fresh routes, address search, live providers, and uncached map tiles still require internet. Offline mode is a demonstration, not offline live navigation.

## Data sources

| Source | Role | Important distinction |
|---|---|---|
| Google map tiles | Streets, Satellite, and Hybrid basemaps | Supplies imagery, not FloodNav directions |
| OSRM | Road geometry, maneuvers, and basic routing | Basic timing does not include live traffic |
| TomTom | Traffic-aware routes/timing and traffic tiles | Requires the private API key; returned alternatives vary |
| Nominatim / OpenStreetMap | Explicit-submit place search | Provider usage constraints apply |
| OpenWeather | Current rainfall and forecast information | Rainfall is not measured road water depth |
| MGB | Static flood-susceptibility polygons | Indicates susceptibility, not a current flood observation |
| Copernicus CEMS GFM via EODC | Sentinel-1-derived satellite flood observations | Dated coverage; exclusions and unobserved areas remain unknown |
| User-configured scenarios | Synthetic flood and traffic areas | Demonstration inputs, not observations |
| ESP32 / Supabase sensor pathway | Retained point-depth ingestion implementation | Sensor selector is disabled; physical deployment is incomplete |

MGB and Copernicus serve different purposes; Copernicus does not replace MGB in the rainfall assessment. The satellite pathway is currently limited to Metro Cebu. Recent, high-quality observations can support an optional flood-avoidance search; older observations remain context. `/research` retains the separate rainfall + MGB workflow.

## Local setup

### Requirements

- Node.js **22.12+**; Node.js 24 is supported.
- **pnpm** available on your PATH. Root scripts invoke pnpm, including when started through npm.
- A Supabase project and the applicable migrations for persistent shared features.
- Internet access for live map/routing/weather services.

### Install and run

From a local checkout of this repository:

```sh
pnpm install
pnpm --prefix client install
cp .env.example .env
```

Edit the root `.env` using the configuration below. On Windows, copy `.env.example` to `.env` with your editor or file manager if `cp` is unavailable. Then run:

```sh
pnpm dev
```

Open **http://localhost:5173**. The Vite configuration uses strict port `5173`; stop a conflicting process or explicitly choose another port if it is occupied.

For LAN access:

```sh
pnpm --prefix client dev --host 0.0.0.0
```

A plain HTTP LAN address generally does not provide the secure context required for browser GPS. Use HTTPS when testing device location remotely.

## Environment variables

Keep configuration in the repository-root `.env`; the SvelteKit project reads it from there. Use [.env.example](.env.example) as the template, and restart after changes.

| Variable | Visibility | Purpose |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | Browser-public | Supabase project URL |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-public | Public client credential for permitted operations |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Persistent shared simulations and optional research logging |
| `SUPABASE_URL` | Server-only | Optional server URL override; otherwise uses the public project URL |
| `OPENWEATHER_API_KEY` | Server-only | Rainfall/current forecast requests |
| `TOMTOM_API_KEY` | Server-only | Optional live traffic routing and tiles |
| `MGB_DATA_VERIFIED` | Server-only | Default `false`; enables exposure ranking only after source/coverage/reuse review |
| `GFM_FRESHNESS_HOURS` | Server-only | Default `24`; application freshness threshold for satellite observations |
| `NOMINATIM_URL` | Server-only | Place-search endpoint |
| `NOMINATIM_USER_AGENT` | Server-only | Identification for explicit address-search requests |

Never prefix private provider/service-role keys with `PUBLIC_`, commit `.env`, or enter privileged credentials in browser forms. The public Supabase key does not replace the server's service-role key. GFM's implemented public catalogue/raster access does not require a separate API key.

Do not set `MGB_DATA_VERIFIED=true` merely to remove a notice. Pending verification is informational; actual provider failures and stale data have separate handling.

## Supabase setup

Review the SQL and confirm the target project before applying migrations using your Supabase workflow. Do not apply them blindly to an unrelated database.

| Migration | Feature |
|---|---|
| `202609200001_flood_sensors.sql` | Retained sensor tables and access controls |
| `202609220001_research_logging.sql` | Research snapshots, assessments, and export support |
| `202609230001_shared_simulation.sql` | Shared scenario state and revision-checked updates |
| `202609230002_live_simulation_defaults.sql` | Live defaults for untouched installations; follows the shared-simulation migration |

Files are in [supabase/migrations](supabase/migrations). For a full fresh installation, review them in chronological order. Shared travel requires its shared-simulation storage and server credentials; missing storage produces an error rather than an in-memory replacement.

See [shared simulation setup](docs/DEMO.md#persistent-setup), [research setup](docs/RAINFALL_RESEARCH.md#setup), and the [sensor guide](docs/SUPABASE.md). The sensor guide contains historical instructions: its sensor-default behavior is superseded by the current disabled sensor selector, and current server-side features require the private service-role key in server configuration.

## Research interface

Open `/research` for the experimental rainfall–susceptibility workflow:

1. Choose route endpoints and the **Rainfall + MGB susceptibility** source.
2. Review rainfall samples, susceptibility coverage, timestamps, and assessment reasons.
3. Enable **Research data logging** only when you intend to retain provider snapshots and route assessments. The preference defaults on per browser.
4. Refresh the assessment or retry a failed save as appropriate.
5. Follow the [export instructions](docs/RAINFALL_RESEARCH.md#export) for CSV/JSON outputs.

The index combines route length, susceptibility weights, and rainfall using project-defined assumptions. It is not flood probability, water depth, or a validated safety prediction. Missing coverage, stale weather, or unverified MGB data prevent exposure recommendations. Main-screen rainfall requests disable research logging independently of the research-page preference.

## Build and deployment

### Local Node production build

```sh
pnpm build
HOST=0.0.0.0 PORT=3000 node --env-file=.env client/build
```

The second command uses POSIX environment-variable syntax. On other shells, set `HOST` and `PORT` using that shell's syntax. The local production build uses `adapter-node`; the production port is separate from Vite's development port.

`pnpm preview` previews a built application locally; it is not the production Node start command.

### Vercel

The live deployment is [floodnav-blue.vercel.app](https://floodnav-blue.vercel.app). Configuration in `client/vite.config.ts` selects `adapter-vercel` in a Vercel environment and `adapter-node` otherwise.

The SvelteKit application directory is `client/`. Configure the Vercel project to build that application, install its dependencies, and run its `build` script. Supply the environment variables in the hosting project's settings; local `.env` is not committed or automatically transferred. Ensure the required Supabase migrations exist before deploying features that depend on them.

Provider caches and request throttles are process-local. Multiple instances/serverless deployments need appropriate shared quota control or provider arrangements before scaling, particularly for public Nominatim and OpenWeather use. Running a local build does not publish the site.

## Testing

```sh
# Svelte/TypeScript checks
pnpm check

# Unit/database tests, excluding the live-network GFM probe
pnpm exec vitest run --exclude tests/gfm-live.test.ts

# Production build
pnpm build

# Install a browser once, then run browser tests
pnpm exec playwright install chromium
PLAYWRIGHT_CHANNEL=chromium pnpm test:e2e
```

The browser command uses POSIX environment syntax. Playwright otherwise defaults to Microsoft Edge; use `PLAYWRIGHT_CHANNEL=chrome` for an installed Chrome browser.

`pnpm test` runs the full Vitest suite, **including** `tests/gfm-live.test.ts`, which contacts the live satellite provider and writes diagnostic files under `/tmp`. Run that probe intentionally; it is not an offline unit test.

Browser tests use an isolated local backend and mocked providers; they do not apply migrations to the live Supabase project. Automated checks establish tested software behavior, not field accuracy or current external-provider availability. Older tests may need alignment when the UI changes; report actual results rather than assuming the entire suite passes.

## Troubleshooting

| Symptom | What to check |
|---|---|
| Shared conditions fail to load | Supabase URL/service-role key, shared-simulation migration, and server connectivity |
| Only one route appears | Provider may have returned one distinct route; alternatives are requested but not guaranteed |
| Original route cannot be selected directly mid-trip | It starts away from your current position; review the freshly requested current-position alternatives |
| **Basic ETA** chip | Live traffic is unavailable; OSRM basic routing is being used |
| **MGB pending** chip | Verification gate is off; review source/coverage/reuse conditions before enabling it |
| Rainfall or MGB error | Check the named provider, private weather key, coverage, rate limits, and Retry |
| Satellite unavailable or old | Check observation date, supported area, provider availability, and Retry; no coverage does not mean dry |
| GPS does not start | HTTPS/localhost, permission, device accuracy, and whether the page remains open |
| Demo playback pauses | Blocking simulated depth, stale/missing required data, or lost shared synchronization |
| Address search returns nothing | Submit at least three characters, try a clearer place name, or choose on the map |
| Old UI remains after deployment | Reload or use the application's update prompt when a service-worker update is available |
| Port 5173 is occupied | Stop the conflicting server or use `pnpm --prefix client dev --port 5174` |

## Architecture and project structure

| Layer | Main technologies |
|---|---|
| Application | Svelte 5, SvelteKit 2, TypeScript, Vite |
| Interface | Tailwind CSS 4, DaisyUI 5, Lucide and vehicle SVG icons |
| Map/geospatial | Leaflet, GeoTIFF.js, proj4, d3-contour |
| Persistence | Supabase PostgreSQL, PostgREST/RPC, Supabase Edge Functions |
| Verification | Vitest, Playwright, PGlite |
| Firmware scaffold | PlatformIO, ESP32/Arduino |

```text
client/                 Active SvelteKit application
  src/lib/components/   Map, planner, research and shared UI
  src/lib/states/       Reactive trip, layout and provider state
  src/lib/services/     Routing, simulation and assessment logic
  src/lib/server/       Provider integrations and persistence
  src/routes/           Main screen, /research and API endpoints
supabase/               SQL migrations and sensor ingestion function
firmware/esp32/         Retained sensor uploader/adapter scaffold
tests/                  Unit, database, browser and live-provider tests
docs/                   Setup, methodology and workflow documentation
.env.example            Configuration template without real credentials
LICENSE                 MIT license for project code
```

## Limitations and privacy

- Current road routing uses driving-profile geometry, including the bicycle/motorcycle examples. Vehicle timing and flood thresholds are simulation assumptions, not dedicated vehicle-routing profiles.
- GPS route matching is approximate; the application does not provide guaranteed background tracking or lane-level guidance.
- Satellite freshness defaults to 24 hours. Observations can be older, incomplete, or excluded, and do not provide flood depth.
- MGB susceptibility and weather-based exposure scores are not real-time flood observations or validated predictions.
- Sensor ingestion and firmware scaffolding are retained, but the sensor UI is disabled. Hardware needs a real sensor driver, calibration, and deployment work; no operational sensor network is claimed.
- There is currently no login requirement for publishing shared scenarios. Revision checks prevent accidental conflicting updates, not unauthorized editing.
- Trip GPS traces are not saved to shared simulation state. Routing/weather services receive coordinates needed for requests; enabling research logging retains route geometry, endpoints, and provider snapshots.
- No automatic research-record deletion policy is configured. Decide retention and access requirements before collecting research data.

## Documentation

- [Complete methodology and technical walkthrough](docs/FLOODNAV_METHODOLOGY.md)
- [Methodology — Word document](docs/FLOODNAV_METHODOLOGY.docx)
- [Shared simulation and GPS usage](docs/DEMO.md)
- [Rainfall model, research logging and exports](docs/RAINFALL_RESEARCH.md)
- [Supabase sensor setup — historical sensor workflow](docs/SUPABASE.md)
- [ESP32 firmware guide](firmware/esp32/README.md)
- [Frontend structure](docs/frontend.md)

## Contributing

Keep changes focused, document new environment variables or provider behavior, and include checks relevant to the change. For UI work, verify desktop/mobile layouts and interactive states. Explain the problem, resulting behavior, test results, and remaining limitations in a pull request. Never include credentials or sensitive collected data.

For bugs, include reproduction steps, browser/device, source/movement mode, and a screenshot if useful. Remove private locations and secrets before sharing diagnostics. Passing mocked tests must not be presented as proof of safe travel or live-provider coverage.

## License and attribution

Project code is released under the [MIT License](LICENSE), copyright © 2026 Jimboy “jimcan” Cantila.

Third-party dependencies, map tiles, provider data, imagery, and other assets retain their own licenses, terms, and attribution requirements. The project license does not grant rights to redistribute third-party datasets. Preserve map/provider attribution, including the application's Copernicus CEMS attribution. See the methodology's [evidence and references](docs/FLOODNAV_METHODOLOGY.md#19-evidence-and-references) for source documentation.
