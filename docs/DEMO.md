# Shared travel simulation

Open `/`, select a destination and vehicle, then **Start travel**. With simulation OFF, **Live GPS · actual travel** is selected by default. Allow location permission to route from your actual position. With shared simulation ON, the default is **Demo playback**; the Travel mode selector lets you choose either mode explicitly. A trip keeps its chosen movement mode even when someone changes shared data sources. No room or login is needed. Every browser has its own journey. **Simulation controls** is available before and during travel; anyone can change the traffic/flood conditions shared by all users.

## Persistent setup

Shared conditions require the existing Supabase project. Configure server-only `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` (or use `PUBLIC_SUPABASE_URL` as the URL fallback). Never expose the service-role key to the browser.

Apply `supabase/migrations/202609230001_shared_simulation.sql` to the intended project **after reviewing and approving that database migration**. It creates one independent table and an atomic update function, with no changes to research or sensor records. Apply it before deploying this app version. Existing in-memory rooms cannot be migrated; old traveler/controller links redirect to `/`.

Apply `supabase/migrations/202609230002_live_simulation_defaults.sql` after the shared simulation migration for live defaults on untouched installations. It preserves already-published settings.

The initial shared conditions have traffic/flood simulation OFF (live) and no zones. Opening a new browser never resets the shared choice; anyone can enable simulation and apply changes for a demo. Changes persist across refreshes, server restarts, and application instances. There is no server-memory fallback. Missing configuration/storage produces an explicit error and retry action.

For local use: `pnpm dev -- --host 0.0.0.0` (use the port reported by Vite). For production Node: `pnpm build`, then `node --env-file=.env client/build`, configuring HOST/PORT as appropriate. The existing Vercel adapter also uses the shared database.

## Editing and synchronization

1. Open **Simulation controls**, add a traffic/flood area, and click the map to place it.
2. Edit the radius, traffic level or flood depth. Draft circles are labeled **Unpublished preview** and do not affect ETA.
3. Click **Apply changes**. Your browser updates immediately; other visible browsers poll every two seconds and on focus/reconnect.
4. Simultaneous edits are revision-checked in the database. Conflicts preserve your draft and show the latest conditions. Review before publishing over them, or discard your draft to load the latest state.

A failed sync retains the last received conditions with a visible error. After 15 seconds without successful synchronization, demo playback pauses; GPS tracking continues. Reconnection loads the latest conditions and never auto-resumes. Each tab's trip is independent and restarts on page refresh; no journey telemetry is shared.

Shared presets replace conditions near Fuente → SM City without resetting anyone's journey. **Load example trip: Fuente → SM City** loads the bundled road pair for your browser when traffic simulation is enabled. Loading an example only resets your trip. Mid-trip alternative discovery still needs online road routing. Map tiles require internet.

## Live GPS travel

Live GPS uses browser `watchPosition`, updates the marker and remaining route progress from device fixes, and follows your position on the map. The timer never advances GPS travel. Pause, End trip, arrival, and leaving the page release the GPS watcher. Permission denial provides a Resume path; stale or inaccurate fixes are labeled and do not advance travel. Route matching is approximate, not a lane-level navigation engine. Fixes more than 100 m uncertain or 15 seconds old are rejected. Off-route fixes trigger a fresh route, with a ten-second retry limit.

GPS requires HTTPS (localhost is allowed), location permission, and an open browser page. Background/locked-screen tracking is not guaranteed. Your position is not saved to shared simulation state; routing and rainfall requests use route coordinates as usual with research logging disabled.

Missing traffic/rainfall data does not disable GPS travel. If traffic-aware routing fails, basic OSRM directions are explicitly labeled as lacking live traffic. Rainfall errors remain visible; basic navigation does not confirm that roads are flood-free. GPS continues when shared-condition synchronization fails. Demo playback retains its existing pause rules.

## ETA, flooding and alternatives

Travel defaults to 1× playback speed. In **Simulation controls**, **Travel playback speed** offers 0.5×, 1×, 2×, 5×, 10×, and 20×, adjustable before or during travel. Speed affects only this browser’s playback, not shared conditions or route ETA; displayed ETA is journey time, shown in minutes and seconds. Cards, remaining ETA, playback, and route ranking use the same evaluation.

Only the portions of the remaining road inside enabled circles incur delay:

- Traffic multipliers: light 1.2×, moderate 1.5×, heavy 2.5×.
- Passable flood multiplier: `1 + depth / vehicle threshold`, capped at 2×; zero depth has no delay.
- Overlaps of the same kind use their greatest multiplier. Traffic and flood multipliers multiply when both affect a segment.
- Depth above the selected vehicle's demo threshold blocks the route: **Blocked — ETA unavailable**. Hazards already passed do not block or delay the remaining journey.

These are synthetic demonstration assumptions, not measured speeds or verified wading ratings. Rainfall intensity remains a separate scenario value. Live rainfall assessment estimates exposure, not flood depth.

Condition/vehicle changes recompute and rank routes. An affected selected route triggers a search for a passable or faster alternative; the user chooses **Use alternative**. Mid-trip searches pause movement while checking routes from the exact current position. Accepting an alternative retains distance already traveled and waits for Resume. No qualifying route returned by the provider means no alternative is promised or fabricated.

## Live sources

Switches are independent and global. OFF selects live data; it does not erase custom zones. Source changes rebuild the remaining route from the current position. They pause demo playback; GPS tracking continues.

Traffic simulation uses OSRM base routes. Live traffic requires server-only `TOMTOM_API_KEY`, using TomTom traffic-aware geometry/timing and flow tiles. Live route refresh remains every two minutes when paused, with five-minute stale detection. Missing keys/provider failures are explicit. Basic road directions are used when traffic-aware routing fails, with a visible notice; they are not simulated traffic.

Live rainfall retains OpenWeather/MGB setup in `RAINFALL_RESEARCH.md`. This travel screen always disables research logging. `/research` retains its existing behavior.

Address search remains explicit-submit Nominatim lookup with per-process caching/throttling. Although shared conditions support multiple app instances, deployments using public Nominatim still need shared throttling or a suitable provider when using multiple workers.

## Verification

`pnpm check`, `pnpm test`, `pnpm build`, and `PLAYWRIGHT_CHANNEL=chromium pnpm test:e2e` (or the existing Edge default). Browser tests use an isolated PGlite database running the actual new migration behind a test PostgREST adapter. They never use the live Supabase database. Road/weather/map responses are mocked; live provider coverage and deployed Supabase connectivity need separate configured smoke tests.
