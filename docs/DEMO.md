# Shared travel simulation

Open `/`, select a start, destination and vehicle, then **Start travel**. No room or login is needed. Every browser has its own journey. **Simulation controls** is available before and during travel; anyone can change the traffic/flood conditions shared by all users.

## Persistent setup

Shared conditions require the existing Supabase project. Configure server-only `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` (or use `PUBLIC_SUPABASE_URL` as the URL fallback). Never expose the service-role key to the browser.

Apply `supabase/migrations/202609230001_shared_simulation.sql` to the intended project **after reviewing and approving that database migration**. It creates one independent table and an atomic update function, with no changes to research or sensor records. Apply it before deploying this app version. Existing in-memory rooms cannot be migrated; old traveler/controller links redirect to `/`.

The initial shared conditions have traffic/flood simulation ON and no zones. Changes persist across refreshes, server restarts, and application instances. There is no server-memory fallback. Missing configuration/storage produces an explicit error and retry action.

For local use: `pnpm dev -- --host 0.0.0.0` (use the port reported by Vite). For production Node: `pnpm build`, then `node --env-file=.env client/build`, configuring HOST/PORT as appropriate. The existing Vercel adapter also uses the shared database.

## Editing and synchronization

1. Open **Simulation controls**, add a traffic/flood area, and click the map to place it.
2. Edit the radius, traffic level or flood depth. Draft circles are labeled **Unpublished preview** and do not affect ETA.
3. Click **Apply changes**. Your browser updates immediately; other visible browsers poll every two seconds and on focus/reconnect.
4. Simultaneous edits are revision-checked in the database. Conflicts preserve your draft and show the latest conditions. Review before publishing over them, or discard your draft to load the latest state.

A failed sync retains the last received conditions with a visible error. After 15 seconds without successful synchronization, travel pauses. Reconnection loads the latest conditions and never auto-resumes. Each tab's trip is independent and restarts on page refresh; no journey telemetry is shared.

Shared presets replace conditions near Fuente → SM City without resetting anyone's journey. **Load example trip: Fuente → SM City** loads the bundled road pair for your browser when traffic simulation is enabled. Loading an example only resets your trip. Mid-trip alternative discovery still needs online road routing. Map tiles require internet.

## ETA, flooding and alternatives

Travel runs at 20× playback speed; displayed ETA is simulated journey time, shown in minutes and seconds. Cards, remaining ETA, playback, and route ranking use the same evaluation.

Only the portions of the remaining road inside enabled circles incur delay:

- Traffic multipliers: light 1.2×, moderate 1.5×, heavy 2.5×.
- Passable flood multiplier: `1 + depth / vehicle threshold`, capped at 2×; zero depth has no delay.
- Overlaps of the same kind use their greatest multiplier. Traffic and flood multipliers multiply when both affect a segment.
- Depth above the selected vehicle's demo threshold blocks the route: **Blocked — ETA unavailable**. Hazards already passed do not block or delay the remaining journey.

These are synthetic demonstration assumptions, not measured speeds or verified wading ratings. Rainfall intensity remains a separate scenario value. Live rainfall assessment estimates exposure, not flood depth.

Condition/vehicle changes recompute and rank routes. An affected selected route triggers a search for a passable or faster alternative; the user chooses **Use alternative**. Mid-trip searches pause movement while checking routes from the exact current position. Accepting an alternative retains distance already traveled and waits for Resume. No qualifying route returned by the provider means no alternative is promised or fabricated.

## Live sources

Switches are independent and global. OFF selects live data; it does not erase custom zones. Source changes pause travel and rebuild the remaining route from the current position.

Traffic simulation uses OSRM base routes. Live traffic requires server-only `TOMTOM_API_KEY`, using TomTom traffic-aware geometry/timing and flow tiles. Live route refresh remains every two minutes when paused, with five-minute stale detection. Missing keys/provider failures are explicit and never silently replaced by simulations.

Live rainfall retains OpenWeather/MGB setup in `RAINFALL_RESEARCH.md`. This travel screen always disables research logging. `/research` retains its existing behavior.

Address search remains explicit-submit Nominatim lookup with per-process caching/throttling. Although shared conditions support multiple app instances, deployments using public Nominatim still need shared throttling or a suitable provider when using multiple workers.

## Verification

`pnpm check`, `pnpm test`, `pnpm build`, and `PLAYWRIGHT_CHANNEL=chromium pnpm test:e2e` (or the existing Edge default). Browser tests use an isolated PGlite database running the actual new migration behind a test PostgREST adapter. They never use the live Supabase database. Road/weather/map responses are mocked; live provider coverage and deployed Supabase connectivity need separate configured smoke tests.
