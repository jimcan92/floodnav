# FloodNav
## Technical Walkthrough, Development Methodology and Research Limitations

**Documentation edition:** September 24, 2026  
**Project owner/developer:** Jimboy “jimcan” Cantila  
**Baseline reviewed:** Git commit `c298653`, plus the local working-tree UI changes reviewed during this session.  
**Status:** Implementation-grounded prototype documentation; not a field-validation report.  
**Language:** English technical write-up with a Cebuano presentation guide.

> **Core statement:** FloodNav is a web-based routing and flood-context prototype for the Cebu study area. It combines map visualization, road routing, traffic information, rainfall, static flood susceptibility, satellite flood observations, and controlled simulations. It does not certify that a road is safe, predict exact flood depth, or replace official warnings.

## Contents

1. Executive overview and objectives
2. Technology stack
3. AI-assisted development and Codex
4. Development history and methodology
5. System architecture and data flow
6. External services and APIs
7. MGB: meaning, purpose and verification
8. Rainfall–susceptibility research methodology
9. Simulation, vehicles and ETA
10. Satellite flood observations
11. ESP sensor integration and hardware status
12. User walkthrough
13. Database, logging and privacy
14. Scope and limitations
15. Software testing versus scientific validation
16. Setup, configuration and reproducibility
17. Recommended validation and improvement plan
18. Presentation guide and frequently asked questions
19. Evidence and references

## 1. Executive overview and objectives

FloodNav brings several kinds of information into one interactive map. A traveler can select a destination, inspect road routes, choose a vehicle category, and either follow actual device GPS or run a demonstration playback. The application also lets users create shared traffic and flood scenarios. A separate research interface evaluates route exposure using rainfall and flood-susceptibility polygons and can retain assessment records. [R1–R5]

### 1.1 Project objectives

- Visualize roads, routes, contextual flood information and selected hazard areas.
- Demonstrate how traffic and synthetic flood conditions can change route availability and estimated journey time.
- Support actual GPS position following while clearly separating live movement from timer-driven demonstration playback.
- Explore an explicitly experimental route-exposure index combining rainfall and MGB susceptibility.
- Preserve reproducible research inputs, model settings and outputs when research logging is enabled.
- Make missing, stale, unverified and simulated information visible instead of silently treating it as safe or dry.

These objectives describe the implemented prototype and its intended research use. They are not claims of measured accident reduction, prediction accuracy, operational emergency readiness or successful hardware deployment. [R1–R8]

### 1.2 Essential distinctions

| Information type | What it represents | What it does not establish |
|---|---|---|
| Road route | A route returned by a road-routing service | Flood safety or every possible detour |
| Live traffic | Provider traffic-aware route timing and traffic tiles | Guaranteed arrival time |
| Rainfall | Weather-provider current/forecast information | Measured water depth on a particular road |
| MGB susceptibility | Background classification of flood-prone areas | Current inundation or road closure |
| Satellite flood observation | Dated, quality-qualified remotely sensed flood detection | Continuous street-level monitoring or depth |
| Synthetic flood circle | User-configured demonstration area and depth | A real observation |
| Retained sensor pathway | Interface for authenticated point-depth observations | A calibrated, deployed sensor network |

The information streams remain distinguishable. Their availability is not equivalent to their suitability for a particular travel decision. [R2–R8]

## 2. Technology stack

The active application is a single SvelteKit project in `client/`, with browser components and server endpoints in the same application. Supabase provides persistent PostgreSQL storage. No separate Express server or application ORM was found in the reviewed implementation. [R1, R2, R9]

| Layer | Technology | Role in FloodNav |
|---|---|---|
| UI framework | Svelte 5 and SvelteKit 2 | Reactive screens, routing and server endpoints |
| Language | TypeScript | Types for coordinates, routes, observations and API payloads |
| Styling | Tailwind CSS 4, DaisyUI 5 | Responsive layouts, cards, switches, forms, themes |
| Icons | Lucide Svelte | Interface symbols and controls |
| Build/dev tooling | Vite; Node.js runtime | Local development and application builds |
| Map renderer | Leaflet | Interactive map, route lines, markers and overlays |
| Background tiles | Google Streets, Satellite and Hybrid tile sources | Visual basemap; not Google directions |
| Road routing | OSRM; TomTom for live traffic routing | Actual road geometry, route candidates and timing |
| Place lookup | Nominatim | Explicit-submit location/address search |
| Weather | OpenWeather | Current rainfall and three-hour forecast products |
| Susceptibility | MGB ArcGIS REST layer | Flood-susceptibility polygons |
| Satellite ingestion | EODC STAC / Copernicus GFM | Discover and process dated flood observations |
| Raster/geospatial tools | GeoTIFF.js, proj4, d3-contour | Read raster windows, transform coordinates, generate contours |
| Database | Supabase PostgreSQL via PostgREST/RPC | Shared conditions, research records and sensor tables |
| Device ingestion | Supabase Edge Function, Deno/TypeScript | Validate and authenticate sensor submissions |
| Firmware scaffold | PlatformIO, ESP32/Arduino | Retained sensor uploader and adapter interface |
| Testing | Vitest, Playwright, PGlite | Logic, browser and isolated database testing |
| Offline/installability | Web manifest and service worker | Cached application shell and offline demo support |
| Deployment targets | SvelteKit Node adapter; Vercel adapter | Alternative deployment builds, not proof of deployment |
| Development assistance | OpenAI Codex; Hermes-assisted maintenance in this session | Coding/documentation assistance, not runtime flood prediction |

### 2.1 Version interpretation

The reviewed client manifest declares Svelte `^5.56.1`, SvelteKit `^2.63.0`, Vite `^8.0.16`, TypeScript `^6.0.3`, Tailwind `^4.3.0`, DaisyUI `^5.7.43`, and Leaflet `^1.9.4`. These are dependency ranges, not a claim that those exact versions are installed everywhere. Reproduction requires the lockfile and an environment/version record. Root test-tooling ranges differ from client ranges. [R2]

### 2.2 Why the components are separate

Leaflet displays a map; it does not calculate road routes. Google tiles supply a visual background; FloodNav does not use them as a directions engine. OSRM/TomTom return routes. OpenWeather supplies rainfall. MGB supplies susceptibility context. Supabase persists application records. This separation makes provider failures identifiable and avoids claiming that one service performs functions actually handled by another. [R2–R7]

## 3. AI-assisted development and Codex

### 3.1 What Codex is

OpenAI Codex is an AI coding assistant/agent used for software-engineering tasks such as understanding code, implementing changes, debugging and reviewing work. It can assist a developer; its output still needs human review and independent execution checks. [E1]

The project owner identifies Codex as a development tool used for FloodNav. This is developer-provided provenance. The reviewed repository also contains a Codex-related local Git reference, but its commit messages do not document who or which tool authored each algorithm. This document therefore does **not** invent exact prompts, model versions, token totals, percentages of AI-written code, or per-commit AI attribution.

### 3.2 What AI did—and what the application does

**Development-time AI assistance is different from runtime intelligence.** The reviewed FloodNav implementation uses explicit geometry, rules, provider responses and numerical formulas. No runtime OpenAI SDK, LLM route decision service, or locally trained flood-prediction model was identified in the inspected application. [R2–R8]

For this documentation/UI-maintenance session, Hermes tools inspected files, applied bounded edits and ran Svelte diagnostics. Claude Code was checked but was not installed in this environment; it should not be credited with the changes made in this session. Historical use of other AI tools remains unverified.

### 3.3 Reproducible AI-assisted workflow

The following is a recommended disclosure and working method consistent with the repository's development approach, not a verbatim reconstruction of every historical session:

1. The developer defines the user problem, study scope, data sources and acceptance criteria.
2. Codex is given a bounded task plus relevant repository context and constraints.
3. The assistant inspects existing components, types, API contracts and tests before proposing changes.
4. The developer reviews scientific assumptions, provider terms, privacy implications and destructive operations.
5. Changes are implemented in small, inspectable increments.
6. Automated checks test deterministic behavior; manual review examines actual usability and presentation.
7. Failures and limitations are recorded instead of replaced by invented outputs.
8. Git commits, dependency records and test evidence preserve a traceable implementation history.

Suggested AI-use disclosure:

> “FloodNav was developed with AI-assisted software-engineering support, including OpenAI Codex, under developer supervision. AI assistance was used as a development aid rather than as a runtime flood-prediction model. The developer remains responsible for reviewing the implementation, checking data-source limitations, testing behavior and validating research claims. Specific assistance should be supported by retained session records where available.”

For a thesis or publication, retain prompts, reviewed diffs and test logs where appropriate; follow institutional AI-disclosure requirements. Do not submit private API keys, device tokens or sensitive route datasets as prompt material.

## 4. Development history and methodology

### 4.1 Evidence-based development timeline

The following milestones come from commit subjects, not from a reconstructed claim about hours worked or experimental results. [R10]

| Date | Commit | Recorded development milestone |
|---|---|---|
| September 20, 2026 | `f8bfe00` | Initial prototype with Google maps and Supabase sensor integration |
| September 21, 2026 | `0d98d39` | Supabase configuration validation tests |
| September 22, 2026 | `0153be3` | Demo, rainfall and research-database tests |
| September 23, 2026 | `bb041c4` | Shared simulation state and persistence |
| September 23, 2026 | `9b6bbf5` | Live GPS travel mode |
| September 23, 2026 | `875ebee` | PWA and offline support |
| September 23, 2026 | `cf0b01f` | Flood-aware detours and observed-flood enhancements |
| September 23, 2026 | `e1d6259`, `5583c93` | State/routing integration and refactoring |
| September 23, 2026 | `c298653` | Compact planner and location-picker improvements |

Later local working-tree changes include mobile configuration height and contextual parameter instructions/highlighting. They were not part of `c298653` when reviewed. Commit history does not by itself prove scientific validation, deployment or AI authorship.

### 4.2 Development method

An appropriate description is **iterative prototype development with modular integration and layered software verification**. The artifacts show progressively integrated map, route, sensor, rainfall, shared-simulation, GPS and satellite functions. This is not evidence of a completed controlled field experiment. [R1–R10]

The method can be documented in six phases:

- **Requirements and boundaries:** identify Cebu travel/research workflows; separate live observations, simulations and missing data.
- **System design:** define browser/server responsibilities, provider adapters, typed payloads and persistence boundaries.
- **Incremental implementation:** integrate one provider or feature at a time without conflating its information with another source.
- **Data-quality handling:** normalize units, preserve timestamps, distinguish missing values from zero, and apply coverage/freshness gates.
- **Verification:** test rules, geometry, database restrictions, provider failures and browser flows.
- **Evaluation and iteration:** inspect user feedback, refine the interface, and plan scientific validation separately from software correctness.

## 5. System architecture and data flow

```text
User / browser
  ├─ Svelte UI + Leaflet map + device GPS
  ├─ Google basemap tiles
  ├─ OSRM road routes
  └─ SvelteKit API endpoints
       ├─ Nominatim place lookup
       ├─ TomTom routes and traffic tiles
       ├─ OpenWeather current + forecast
       ├─ MGB susceptibility polygons
       ├─ EODC STAC → GFM GeoTIFF processing
       └─ Supabase PostgREST / RPC
            ├─ shared simulation state
            ├─ optional research snapshots/assessments
            └─ retained sensor records

Retained hardware pathway:
ESP32 → authenticated Edge Function → sensor readings → research UI
(current sensor UI disabled; physical driver/deployment incomplete)
```

### 5.1 Main travel flow

The user selects a start and destination. The application obtains provider road geometry, evaluates the selected source conditions, shows route choices, and begins either actual GPS tracking or timer-based demo playback. Alternative acceptance is explicit. A provider failure does not create a fabricated straight-line road route. [R3, R5]

### 5.2 Shared configuration flow

Editing creates an unpublished local draft. Applying changes sends a revision-checked update to the server and Supabase. Other visible browsers poll every two seconds. Their own journeys remain independent, but their shared simulated conditions change. A revision conflict preserves the draft rather than silently overwriting a concurrent change. [R3, R9]

### 5.3 Research flow

Candidate route coordinates are sampled and intersected with weather cells and hazard polygons. Provider data are normalized; exposure segments, coverage and scores are calculated. When enabled in `/research`, an atomic database operation stores the assessment and snapshot references. The main travel interface explicitly disables research logging for its assessment requests. [R4, R6, R9]

## 6. External services and APIs

### 6.1 Provider inventory

| Service | Actual role | Access/configuration | Principal caution |
|---|---|---|---|
| Google map tiles | Streets/satellite/hybrid background | Tile URLs in map implementation | Tile use/terms need review; not a directions API |
| OSRM | Driving road geometry, maneuvers and alternatives | Public routing endpoint in client service | No traffic guarantee or exhaustive alternatives |
| TomTom | Live traffic-aware routing and traffic-flow tiles | Server-only `TOMTOM_API_KEY` | Quotas, coverage and outages; basic OSRM fallback is labeled |
| Nominatim | Search submitted place/address text | Configurable URL/User-Agent; no key in current integration | Public service usage policy and throttling |
| OpenWeather | Current weather and 5-day/3-hour forecast products | Server-only `OPENWEATHER_API_KEY` | Rainfall is not road-depth measurement |
| MGB ArcGIS REST | Detailed flood-susceptibility polygons | Public layer; internal review gate | Static susceptibility; coverage/reuse review needed |
| EODC / Copernicus GFM | Satellite flood-product discovery/assets | STAC catalog and allowlisted assets; no key field found in this integration | Observation age, missing coverage and detection quality |
| Supabase | Persistent PostgreSQL and RPC; Edge Functions | Public URL/publishable key where applicable; private service-role key on server | A public application write endpoint still needs abuse protection |
| Browser Geolocation | Actual device-position updates | HTTPS and location permission | Not guaranteed in background/locked-screen use |

This table describes repository integrations, not a statement that all services are currently configured, affordable at every usage level, licensed for all deployments, or available in every area. Provider plans and conditions must be checked for the intended deployment. [R2–R9; E2–E7]

Nominatim's public policy sets an absolute maximum of one request per second. The app's explicit-submit search and process-local throttling are not sufficient evidence of compliance across multiple workers or instances. [E5; R3]

### 6.2 Internal endpoint map

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/simulation` | GET | Retrieve shared conditions |
| `/api/simulation` | PATCH | Validate and publish a revision-checked change |
| `/api/places` | GET | Place lookup |
| `/api/demo/routes` | POST | Traffic-aware route request |
| `/api/demo/traffic/[z]/[x]/[y]` | GET | Traffic tile proxy |
| `/api/weather` | POST | Normalize weather for route inputs |
| `/api/susceptibility` | POST | Retrieve susceptibility and review status |
| `/api/assessments` | POST | Combined exposure assessment and optional logging |
| `/api/observed-floods` | POST | Satellite flood observations |
| Supabase `/functions/v1/ingest-reading` | POST | Authenticated device-reading ingestion |

These are application interfaces, not interchangeable provider URLs. Their existence does not demonstrate that their external dependencies are healthy. [R7, R8]

## 7. MGB: meaning, purpose and verification

### 7.1 What is MGB?

MGB means **Mines and Geosciences Bureau**, a Philippine government bureau under DENR with geoscience/geohazard responsibilities. FloodNav uses its public **Detailed Flood Susceptibility** layer. The layer contains polygon areas and classification codes: LF (low), MF (moderate), HF (high), and VHF (very high). [E2, E8]

### 7.2 What is it used for?

In FloodNav, the classification is background context for route exposure. The application checks which route portions intersect each susceptibility class, associates rainfall data with those portions, and computes an experimental index. MGB does not supply the application's custom formula or certify its recommendations. [R4, R6]

**Susceptibility is not current flood depth.** A high-susceptibility area may be dry during a particular trip; low susceptibility does not guarantee safety. The application must not translate the classes directly into real-time water-depth measurements. [R4; E2]

### 7.3 Why does the interface say “MGB pending”?

The current status component uses that label when hazard data are not marked verified. The server marks successfully retrieved data verified only when `MGB_DATA_VERIFIED` is exactly `true`; a failed retrieval can also leave data unverified. In the inspected local configuration the flag was `false`. The label therefore does not imply that a background approval request or slow download is about to finish. [R6, R11]

This flag is an **internal source-review gate**, not an MGB certification, API key, scientific validation or official endorsement. “MGB data review needed” would explain the state more accurately; that wording is a recommendation, not an implemented change in this documentation task.

### 7.4 What must be reviewed before enabling it?

1. Confirm that the intended public layer and class fields are being used.
2. Verify successful polygon retrieval for representative local routes, including pagination and geometry handling.
3. Record coverage gaps and the dataset's available dates/metadata; do not infer complete Cebu coverage from one successful query.
4. Review permitted query, display, caching and reuse practices, including attribution. Ask MGB for clarification when metadata are insufficient.
5. Document the review decision, reviewer, date, dataset reference, intended use and unresolved caveats.
6. Only then consider enabling the flag for experimental ranking, using the deployment's controlled configuration/restart process.

The layer metadata retrieved for this report responded successfully and declared a 2,000-record maximum, but its copyright text was blank. Public accessibility is not proof of unrestricted reuse. The application separately paginates queries in batches of 500. No permission approval or coverage certification was obtained in this documentation task. [E2; R4, R6]

Suggested inquiry: “May our Cebu research/prototype application query, display and cache the public Detailed Flood Susceptibility layer? Please confirm attribution, reuse restrictions, dataset date/coverage and limitations for route-exposure analysis.”

## 8. Rainfall–susceptibility research methodology

### 8.1 Study area and inputs

The documented target includes Cebu, Mandaue, Lapu-Lapu, Talisay, Naga, Carcar, Danao, Compostela, Liloan, Consolacion, Cordova, Minglanilla and San Fernando. Validation uses a rectangle: latitude **9.9–10.7** and longitude **123.45–124.15**. This is not official LGU-boundary clipping or proof of data coverage throughout each named municipality. [R4]

Inputs are candidate road geometries, weather observations/forecast intervals, susceptibility polygons and their metadata. The application allows up to six routes, 15,000 total coordinates, 128 weather cells and a documented 1.5 MB assessment request. [R4, R6]

### 8.2 Acquisition and normalization

- Divide crossed route space into 0.02-degree application grid cells and request weather at cell centers. This grid is not the weather provider's measured spatial resolution.
- Preserve current rainfall in mm/hour and three-hour forecast amounts in mm per interval.
- Keep forecast probability separate; it is not multiplied into the implemented exposure formula.
- Normalize omitted rain to zero only for accepted non-rain conditions. Failed requests and missing amounts in rainy/unknown conditions remain unavailable.
- Obtain MGB polygon geometry, preserving holes and selecting the highest susceptibility where classifications overlap.
- Record provider times, acquisition times, requested/returned locations and query settings. [R4, R6; E3]

Current weather is cached ten minutes, forecast data one hour, and MGB data 24 hours. The implementation budgets three concurrent OpenWeather calls and 40 calls per minute per server process. These are application controls, not a statement about the user's provider subscription allowance. [R4, R6]

### 8.3 Segmentation and exposure formula

Route edges are split at weather-grid and susceptibility-polygon boundaries. Each resulting segment is evaluated using its length and applicable class. The model identifier is `experimental-exposure-v1`. [R6]

```text
E = Σ [ Ls × ws × (1 + rs / 10) ]

Ls = segment length in kilometres
ws = susceptibility weight: LF=1, MF=2, HF=3, VHF=4
rs = max(current rain rate, nearest upcoming 3-hour forecast amount / 3)
```

The forecast conversion is an interval-average rate, not a street-level hourly measurement. Length is calculated using haversine distance. Unclassified geometry, unusable weather or incomplete required coverage produces an unavailable/null route score, not a zero-risk score. [R4, R6]

### 8.4 Freshness and recommendation gates

Current observations older than 30 minutes are unusable for ranking. Forecast acquisition age of one hour or more is unusable; future timestamps beyond allowed tolerance are rejected. The relevant upcoming forecast interval must be within the next three hours. [R6]

A recommendation requires complete usable scores for every candidate and the MGB review gate enabled. A geometry-distinct alternative must score at least 10% below the primary route; ties are resolved using duration, then distance. Choosing the alternative remains manual. Missing assessment does not prove safety and does not automatically prevent ordinary route preview. [R4, R6]

### 8.5 Interpretation

The output is an **experimental relative exposure index**. Its class weights, rainfall scale and improvement threshold are project assumptions. It is not a calibrated estimate of flood probability, depth, damage, travel safety or vehicle wading capability. Vehicle clearance is not part of this rainfall formula. No trained machine-learning model, terrain-based runoff model or hydrodynamic solver is part of this calculation. [R4, R6]

## 9. Simulation, vehicles and ETA

Synthetic traffic and flood circles provide controlled demonstrations. The user chooses location, radius and parameters; these inputs are not automatically measured conditions. Unpublished drafts do not affect applied-condition ETA. [R3, R5]

### 9.1 Implemented assumptions

| Parameter | Implemented setting | Interpretation |
|---|---|---|
| Traffic level | Light 1.2×; moderate 1.5×; heavy 2.5× | Synthetic segment-time multipliers |
| Flood slowdown | `1 + min(1, depth / max(1, threshold))` | Synthetic delay, capped at 2× |
| Same-type overlaps | Use greatest applicable multiplier | Avoid double-counting same-kind overlap |
| Traffic plus flood | Multiply the two effects | Demonstration assumption |
| Blocking rule | Depth strictly greater than category threshold | Synthetic passability, not a safety rating |
| Playback | 0.5×, 1×, 2×, 5×, 10×, 20× | Changes timer playback, not true road conditions |

Road duration is distributed in proportion to geometric segment length, then adjusted on intersecting portions. Only remaining-route hazards affect remaining time/blockage. Blocked routes have unavailable ETA. Current code also applies vehicle timing assumptions when route input is live, so displayed values should not be described as untouched provider ETA. [R3, R5]

| Vehicle category | Demonstration depth threshold | Duration assumption |
|---|---|---|
| Car | 15 cm | 1× factor |
| SUV | 25 cm | 1.08× factor |
| Truck | 50 cm | 1.2× factor |
| Motorcycle | 15 cm | 0.9× factor |
| Bicycle | 10 cm | At least travel time at 15 km/h |

**These values must never be presented as manufacturer-approved wading limits or advice to enter floodwater.** All illustrated vehicle categories currently use driving-profile road routing. Bicycle/motorcycle examples therefore are not dedicated legal-road-access routing models. [R1, R5]

### 9.2 Detour search

Flood-aware detour search probes real OSRM routes through bounded waypoint candidates around avoidance extents. It tries perpendicular offsets at enclosing radius plus 150, 450 and 900 metres, up to six requests, two concurrently, with a 4.5-second request timeout. Returned routes must clear avoidance geometry and be distinct. It is a bounded heuristic, not an exhaustive shortest-safe-path solver; no qualifying return means no promised alternative. [R5]

## 10. Satellite flood observations

Copernicus Global Flood Monitoring (GFM) uses Sentinel-1 radar observations to produce flood-monitoring information. FloodNav accesses GFM products through the EODC STAC catalog and GeoTIFF assets. This is distinct from MGB static susceptibility and OpenWeather rainfall. [E6; R8]

The implemented pipeline searches a 14-day catalog window and processes native 20 m raster cells. Newest valid observations take precedence per pixel: a newer valid nonflood classification can clear an older detection. NoData is not averaged into “dry.” Raster windows are transformed into geographic flood contours with observation age and quality retained. [R8]

The application qualifies high-quality flood pixels using likelihood 80–100 and no advisory flags. Avoidance eligibility additionally requires usable, nonstale data within the configured freshness window, default 24 hours. The result is cached for 30 minutes. These are implementation thresholds, not locally demonstrated predictive accuracy. [R8]

Limitations include acquisition gaps, processing latency, excluded areas, uncertain pixels and urban/road-scale interpretation. Satellite flood detection does not provide a confirmed road-depth measurement or official closure. An empty valid detection, unavailable dataset and stale coverage are different states. The GeoTIFF implementation processes flood classification—not a digital elevation model (DEM). [R8]

## 11. ESP sensor integration and hardware status

A retained pathway supports ESP32 depth observations:

```text
Physical measurement → ESP32 uploader → device-token authentication
→ Supabase ingestion function → append-only reading → client freshness check
```

The server checks a hashed device token, enabled device and active sensor, validates numeric depth/timestamps and uses reading IDs to prevent duplicate insertion on retry. Stored token hashes are not plaintext device credentials. Valid payload depth is 0–1000 cm; this input-validation range is not a measured sensor capability. [R7, R9]

The retained client polls approximately every 15 seconds and requires fresh observation and receipt timestamps within five minutes. Missing/stale readings do not become zero depth. In retained sensor mode, any positive measured water blocks intersecting routes; synthetic vehicle allowances do not override that conservative rule. A sensor's circle is manually configured influence coverage, not measured flood extent. [R1, R7]

**Actual status:** sensor selection is temporarily disabled in the research interface. The hardware adapter intentionally produces no readings until an actual sensor driver is supplied. Serial-input commissioning support exists, but no field-calibrated sensor, flashed board or operational sensor network is established by the reviewed evidence. Older sensor setup instructions describe earlier behavior and must not be treated as the current default interface. [R1, R7]

## 12. User walkthrough

### 12.1 Main travel page

1. Open `/` and use the destination planner/location picker.
2. Choose the start and destination, then inspect available road routes and source-status indicators.
3. Select a vehicle category, understanding that its flood thresholds are illustrative.
4. Choose **Live GPS** for actual movement or **Demo playback** for a simulation. Source switches and movement mode are separate settings.
5. Start travel. GPS needs HTTPS, location permission and an open page. Demo playback advances using its timer.
6. Inspect warnings and route alternatives. Explicitly choose an offered alternative; absence of an alternative is not proof that none exists in reality.

GPS rejects fixes older than 15 seconds or uncertainty above 100 metres and rate-limits off-route retries. Background/locked-screen tracking and lane-level matching are not guaranteed. [R3]

### 12.2 Create a traffic or flood scenario

1. Open **Simulation controls**.
2. Enable the relevant simulation switch and choose **Add traffic area** or **Add flood area**.
3. Follow the map-picking instruction and select a location.
4. Use the highlighted **Edit area** card to set name, radius and traffic level, or flood depth and rainfall.
5. Review the unpublished preview, then select **Apply changes**.
6. Remember that applied conditions are shared with other browsers. Loading an example trip affects only the current browser's trip.

Local UI changes set the mobile configuration panel to 90 dynamic-viewport-height units and put parameter guidance in the editor. These changes were code-checked, not fully visually certified during the documentation task. [R3, R11]

### 12.3 Research page

Open `/research`, choose candidate routes and inspect rainfall/susceptibility coverage and status. Check the logging preference before evaluation. If MGB is unverified, coverage incomplete or weather stale, treat unavailable ranking as intentional—not as permission to infer a safe route. Where logging is enabled and database setup is functional, export assessments through the private research views for analysis. [R4]

### 12.4 Failure and offline behavior

Traffic-aware routing can fall back to explicitly labeled basic OSRM directions. Failed research saves do not disable normal routing. Shared-sync failure preserves last conditions; after 15 seconds it pauses demo playback, while GPS movement can continue. PWA caching supports the shell/offline demo, not guaranteed fresh map tiles, weather, traffic or new online routes. API requests and writes are not a durable offline submission queue. [R1, R3, R9]

## 13. Database, logging and privacy

### 13.1 Data groups

| Group | Main structures | Purpose |
|---|---|---|
| Shared simulation | `simulation_state`, `update_simulation` RPC | One shared configuration with revision control |
| Research | `research_snapshots`, `research_assessments`, linking table | Reproducible provider inputs and model outputs |
| Sensors | `flood_sensors`, `sensor_devices`, `flood_readings`, `latest_flood_readings` | Device registry and append-only depth observations |

Research snapshots deduplicate by request/provider identity and payload hash. Atomic RPC persistence associates assessment records and snapshot links. Public/authenticated research-table access is denied; privileged server operations handle saving/export. Sensor metadata/readings for active sensors have intentionally different public-read rules. [R4, R7, R9]

### 13.2 Collection boundaries

Research logging defaults on in `/research` per browser preference; main travel assessment requests set it off. Collection occurs during use and refreshes, not through an unattended all-day collector. Disabling logging stops new requested research writes but does not delete earlier records or undo a write already in flight. Operational caching can still occur. [R3, R4]

No user identity or continuous GPS trace is recorded in the described research schema, but route geometry includes endpoints. Those locations can still be sensitive. “No name stored” does not mean anonymous or privacy-risk-free. Retention, access, consent and export controls should be defined before collecting participant routes. [R4, R9]

### 13.3 Security limitations

Anyone can currently publish shared scenario changes through the application's public endpoint. Database RLS prevents direct unauthorized database access but does not create editor authorization at that public endpoint. Revision checking protects against accidental concurrent overwrite, not malicious editing. Broad user/IP abuse protection and multi-instance quota coordination remain deployment concerns. [R3, R7, R9]

Private service-role/provider keys belong only in protected server configuration. A server-only root `.env` can contain private server settings when correctly excluded from source control and frontend bundles; that is different from putting keys in public variables or browser storage. No credentials are reproduced in this document.

## 14. Scope and limitations

### 14.1 Implemented scope

- Cebu-oriented road/map interface and bounded research study envelope.
- Live GPS and independent demonstration playback.
- Shared editable synthetic traffic/flood conditions with persistent revision control.
- OSRM road routes and TomTom traffic integration/fallback handling.
- OpenWeather/MGB experimental exposure assessment.
- Optional private research logging/export structures.
- Dated satellite flood observation and qualified avoidance logic.
- PWA shell/offline demo and retained protected sensor-ingestion code. [R1–R9]

### 14.2 Outside the demonstrated scope

- Calibrated flood probability/depth forecasting or a trained prediction model.
- DEM/SRTM/LiDAR processing, slope/flow accumulation, drainage or hydrodynamic modeling.
- Verified street-wide inundation measurements or official road-closure feeds.
- Guaranteed passability, safe wading depth or emergency-response certification.
- Complete Philippine coverage, all possible alternative routes or all vehicle access rules.
- Always-on background navigation, offline live-data collection or continuous unattended research sampling.
- Field-tested ESP hardware, validated sensor accuracy and a deployed sensor network.
- Completed user-study findings, measured accuracy percentages or demonstrated crash/time reduction. [R1, R3–R8]

### 14.3 Known research and operational limitations

Static maps may differ from present local conditions. Weather-grid sampling is coarser than a street observation; forecast averages hide short intense rainfall. Satellite data have timing/quality limitations. Missing coverage blocks defensible comparison. Geometry generalization and local planar approximations introduce spatial uncertainty. Model weights are uncalibrated and longer paths can accumulate more exposure. Public providers can throttle or fail; process-local quotas do not coordinate across instances. Usage-based logs have selection bias and are not independent ground truth. [R3–R8]

## 15. Software testing versus scientific validation

### 15.1 Implemented software test categories

The repository includes tests for geometry/circle intersections, route blocking, missing/stale data, rainfall units, polygon holes/overlaps, ranking, synthetic ETA, sensor ingestion, database RLS/transactions/idempotency, shared-state conflicts, GPS/UI flows, satellite raster quality and offline lifecycle. Browser tests commonly mock external providers and use an isolated PGlite-backed test service. [R12]

An exception is `tests/gfm-live.test.ts`, which performs a live provider call and contains no assertions. A passing execution of that file alone is not evidence of successful retrieval or accurate satellite interpretation. Tests must be classified by what they actually assert. [R12]

### 15.2 Verified status of this documentation session

- Source files, manifests, documentation and Git history were inspected.
- Prior UI changes in this conversation passed Svelte diagnostics with **0 errors and 0 warnings**.
- An earlier browser notification test failed before the drawer assertions; no full green browser suite is claimed.
- The final interrupted drawer-test command is not treated as a confirmed pass.
- No full application test suite, live-provider end-to-end trial, database migration, sensor experiment or scientific accuracy study was conducted for this report.
- Public MGB metadata accessibility was checked; this does not validate complete polygon coverage or permitted reuse.

### 15.3 Validation still required

Software tests establish whether an implementation follows its rules. Scientific validation establishes whether those rules represent actual conditions and support the intended conclusions. An exposure index can be perfectly implemented and still be scientifically unsuitable for predicting road flooding. Neither AI code generation nor a successful build closes that gap.

## 16. Setup, configuration and reproducibility

### 16.1 Configuration inventory

| Setting | Exposure | Purpose |
|---|---|---|
| `OPENWEATHER_API_KEY` | Private server | Weather requests |
| `TOMTOM_API_KEY` | Private server | Traffic-aware routing/tiles |
| `SUPABASE_SERVICE_ROLE_KEY` | Private server | Privileged application persistence |
| `SUPABASE_URL` | Server configuration | Private server's database-service URL selection |
| `PUBLIC_SUPABASE_URL` | Browser-safe URL | Public connection configuration/fallback |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-public | Limited public database access under policies |
| `MGB_DATA_VERIFIED` | Server flag | Internal source-review gate |
| `GFM_FRESHNESS_HOURS` | Server setting | Satellite freshness window |
| `NOMINATIM_URL`, `NOMINATIM_USER_AGENT` | Server settings | Place-lookup provider identification/configuration |

Listing a setting is not evidence it is currently configured. The MGB flag was observed false locally; no other secret values are included. [R2, R4, R6–R9]

### 16.2 Development and checks

Node.js 22.12+ is documented as the baseline. Dependencies and lockfiles must be installed/reproduced through an approved package-manager workflow. Current root scripts invoke `pnpm`; on this inspected host `pnpm` was unavailable, while direct client npm scripts worked. The actual Vite configuration specifies port **5173** with `strictPort`, superseding an older README example of port 3000. [R1, R2]

Commands below are operational guidance, not actions executed by this report:

```sh
# From repository root, after dependencies/configuration exist:
npm --prefix client run dev
npm --prefix client run check
npm --prefix client run build

# Local Node production build entry point:
node --env-file=.env client/build

# Existing local test binaries, when dependencies are installed:
./node_modules/.bin/vitest run
PLAYWRIGHT_CHANNEL=chromium ./node_modules/.bin/playwright test --workers=1
```

Before running all tests, review the live GFM test's network and temporary-file behavior. For shared test backends, serial browser execution avoids concurrent state mutations between workers. Migrations and deployment changes require review/approval and a backup/recovery plan appropriate to the target database. This documentation task changed no service configuration or database state. [R2, R9, R12]

### 16.3 Reproducibility record

For each research evaluation retain commit/working-tree state, lockfiles, model identifier/constants, source URLs and available dataset versions, provider timestamps, cache/freshness status, route geometry, logging settings, MGB review record and relevant environment names without secrets. Record which tests used mocks and which exercised real services. Logs alone do not supply independent flood ground truth. [R4]

## 17. Recommended validation and improvement plan

This is proposed future work, not completed research.

### Phase A — Data-source audit

Review MGB permissions/coverage, compare sample polygons with the official map, verify OpenWeather units and timestamps, and inspect GFM dates/quality for representative Cebu locations. Review map-tile rights and public routing/geocoding usage conditions. Document outages and missing coverage rather than excluding them silently.

### Phase B — Controlled functional evaluation

Create reproducible dry, traffic-only, flood-only, overlapping-hazard, all-blocked, missing-provider, stale-data, sync-conflict and permission-denied scenarios. Check source labels, ETA rules, manual alternative selection and privacy/logging behavior. Do not use demo results as real flood accuracy measurements.

### Phase C — Independent local field dataset

With appropriate consent and safety procedures, collect dated/located observations from suitable independent sources such as authorized local reports, validated instruments or controlled ground surveys. Align observation time, route position and uncertainty with provider data. Do not send participants into floodwater to validate navigation.

### Phase D — Model evaluation

Define the target first: observed inundation, road closure and measured depth are different outcomes. Compare appropriate baselines—ordinary fastest route, susceptibility-only ranking, and rainfall-plus-susceptibility ranking. Measure coverage, unavailable-assessment frequency, route overlap with confirmed hazards, travel-time trade-off and recommendation stability. Where a binary target is justified, evaluate false positives/negatives and related metrics without treating missing observations as negatives.

Separate calibration events from held-out evaluation events or areas. Vary class weights, rainfall scale and improvement threshold. Report uncertainty and sample limitations; avoid a single unsupported “accuracy” number. Consider expert review before interpreting route safety.

### Phase E — Deployment hardening

Add authorized editors or isolate demos before public use; coordinate quotas/cache across instances; define retention and export access; instrument provider failures and costs; validate backups/recovery and deployment secrets. Complete and calibrate a real sensor adapter before re-enabling operational sensor claims.

## 18. Presentation guide and frequently asked questions

### 18.1 Cebuano walkthrough script

“Ang FloodNav kay web-based prototype para makita ang mga ruta uban sa traffic ug flood-related information. Ang map display gamit ang Leaflet, unya lahi nga services ang naghatag sa road routes, weather ug hazard data.

“Sa paghimo, gigamit ang AI-assisted development, apil ang OpenAI Codex, ubos sa review sa developer. Dili pasabot nga ang AI mismo ang nag-predict sa baha sulod sa app. Ang current exposure calculation kay explicit formula ug geometry processing.

“Ang MGB mao ang Mines and Geosciences Bureau. Ang ilang map nagsulti kung unsang areas ang susceptible sa flooding; dili na live water-depth sensor. Ang OpenWeather rainfall lahi pud sa aktuwal nga baha sa kalsada. Naa usab satellite observations, pero kinahanglan tan-awon ang petsa, coverage ug quality.

“Pwede ta mohimo og traffic o flood scenario, ibutang sa mapa, i-set ang parameters, ug i-apply. Simulation ra ang gi-input nga depth ug vehicle thresholds. Kung live GPS, actual phone position ang mosunod; kung demo playback, timer ra ang nagpadagan sa marker.

“Ang goal kay routing demonstration ug research sa exposure ranking. Wala pa nato gi-claim nga guaranteed safe ang route o scientifically validated ang flood prediction. Kinahanglan pa og local field validation, source review ug deployment safeguards.”

### 18.2 Defense-ready questions

**Is FloodNav an AI flood predictor?** No runtime LLM or trained prediction model was identified. Codex is a development aid; the app uses provider data and explicit algorithms.

**Is MGB an API key?** No. MGB is the data-producing bureau; the current integration queries a public ArcGIS layer. The internal verification flag is a separate source-review control.

**Does rainfall automatically become flood depth?** No. The exposure index uses rainfall as a relative modifier; synthetic flood depth is manually configured, and retained sensors would provide separate point measurements.

**Does lower exposure mean safe?** No. It means lower output under the experimental formula, subject to coverage, freshness and assumptions.

**Are Google Maps directions used?** Google supplies basemap tiles in the current implementation; OSRM and TomTom handle road routing.

**What if no alternative is shown?** No qualifying route was returned by the bounded search; this is not proof that every possible road alternative has been evaluated.

**Are ESP sensors already operational?** Not established. The UI is disabled and the physical driver/calibration/deployment remain incomplete.

**What does a passing test prove?** Only the behavior asserted by that test under its conditions—not real-world flood accuracy, successful deployment or government endorsement.

**What remains before real-world use?** Source-use review, local coverage and field validation, stronger access/abuse controls, deployment checks and clear user warnings.

## 19. Evidence and references

### Repository evidence

Paths are relative to `/home/jimcan/dev/projects/floodnav`. Repository evidence describes inspected implementation, not provider guarantees.

- **[R1]** `README.md`: project overview, active app, sensor/hardware limits and demo boundaries.
- **[R2]** `package.json`, `client/package.json`, `client/vite.config.ts`: stack, scripts, dependency ranges, adapters and actual development port.
- **[R3]** `docs/DEMO.md`; `client/src/lib/states/demo/`; `client/src/lib/states/layout.svelte.ts`: shared scenarios, GPS/playback and synchronization.
- **[R4]** `docs/RAINFALL_RESEARCH.md`: data protocol, study envelope, model assumptions, collection/export and limitations.
- **[R5]** `client/src/lib/services/routingService.ts`, `demoSimulation.ts`; `client/src/lib/data/vehicleCategories.ts`; `client/src/lib/states/demo/selectors.svelte.ts`: routing, detours, multipliers and vehicle behavior.
- **[R6]** `client/src/lib/services/rainfallAssessment.ts`; `client/src/lib/server/rainfall.ts`: exact model, parsing, geometry, cache, freshness and verification flag.
- **[R7]** `client/src/routes/api/**/+server.ts`; `supabase/functions/ingest-reading/`; `firmware/esp32/`; `client/src/lib/services/sensorService.ts`; research sensor/trip state: endpoints and retained hardware pathway.
- **[R8]** `client/src/lib/server/observedFloods.ts`, `gfmRaster.ts`; `client/src/lib/services/observedFlood.ts`: satellite catalog/raster/quality handling.
- **[R9]** `supabase/migrations/`; `client/src/lib/server/simulationStore.ts`; `client/src/service-worker.ts`; `docs/SUPABASE.md`: persistence, access rules and caching. The older sensor guide contains superseded behavior; current source/newer guides take precedence.
- **[R10]** Local Git log through `c298653`: dated milestones. Commit subjects are not proof of tool authorship or research results.
- **[R11]** `client/src/lib/components/demo/{StatusChips,ScenarioDrawer,ConditionsEditor,ZoneEditor,DemoHeader}.svelte`: status labels and local UI edits. Only the nonsecret MGB review flag was inspected from local configuration.
- **[R12]** `tests/`, `playwright.config.ts`, `vitest.config.ts`: test definitions, mocks, database fixtures and live-test exception.

### External primary references

Consulted September 24, 2026. Provider facts and policies may change. URLs are supplied for traceability; no source is claimed to validate FloodNav's custom model.

- **[E1] OpenAI Codex documentation and engineering overview.** `https://developers.openai.com/codex/` and `https://openai.com/index/introducing-upgrades-to-codex/` — coding assistance and human-review context.
- **[E2] MGB public Detailed Flood Susceptibility layer, layer 0.** `https://controlmap.mgb.gov.ph/arcgis/rest/services/GeospatialDataInventory_Public/GDI_Detailed_Flood_Susceptibility_Public/MapServer/0` — source-layer metadata/classes; metadata retrieved successfully for this report.
- **[E3] OpenWeather current and forecast documentation.** `https://openweathermap.org/current` and `https://openweathermap.org/forecast5` — current and three-hour forecast product distinction.
- **[E4] OSRM HTTP API documentation.** `https://project-osrm.org/docs/v5.24.0/api/` — route geometry and alternatives service reference; cited version is a reference, not an assertion of deployed server version.
- **[E5] OpenStreetMap Foundation Nominatim Usage Policy.** `https://operations.osmfoundation.org/policies/nominatim/` — public geocoding usage constraints.
- **[E6] Copernicus EMS Global Flood Monitoring overview.** `https://global-flood.emergency.copernicus.eu/technical-information/glofas-gfm` — satellite flood-monitoring product background. EODC catalog used by the implementation: `https://stac.eodc.eu/api/v1`.
- **[E7] TomTom Routing service and Supabase RLS documentation.** `https://docs.tomtom.com/routing-api/documentation/tomtom-maps/v1/routing-service` and `https://supabase.com/docs/guides/database/postgres/row-level-security` — provider roles/access-control background.
- **[E8] MGB Priority Programs.** `https://mgb.gov.ph/priority-programs` — agency/geoscience and geohazard context.

### Documentation boundary

This report consolidates implementation evidence, user-provided Codex attribution and clearly labeled proposed validation work. It does not grant data licenses, approve a production deployment, certify scientific accuracy, or replace an institutional research protocol. No production settings, database records or live shared scenarios were changed while preparing it.
