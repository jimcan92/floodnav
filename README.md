# FloodNav

Active app: **SvelteKit in `client/`**, with Leaflet + Google Hybrid/Satellite/Streets, OSRM road routes, demo scenarios, and Supabase ESP sensor observations.

## Run

Use Node.js 22.12+ (Node 24 is supported).

```sh
npm install
npm --prefix client install
npm run dev
```

Open http://localhost:3000. Root commands forward to the active SvelteKit client:

```sh
npm run check
npm run build
npm run preview
npm test
npm run test:e2e
```

Production local Node server: `node client/build`. Vercel builds select the Vercel adapter using the Vercel environment; local builds use the Node adapter to avoid Windows symlink permission errors. Nothing is deployed automatically.

## Folders

- `client/`: active SvelteKit app; its own package.json and dependencies.
- `nextapp/`: preserved React app backup. Do not move its node_modules into client; install dependencies separately.
- `supabase/`: SQL migration and protected ESP ingestion Edge Function.
- `firmware/esp32/`: PlatformIO ESP32 project, configuration templates and sensor adapter.
- `docs/SUPABASE.md`: cloud setup, sensor registration and payload contract.
- `tests/`: shared service/database tests and browser scenarios targeting SvelteKit.

The old React dev server was stopped during migration. If Windows refuses a future move, stop that folder's dev/preview process first; move source/config files and reinstall dependencies in their new location.

## Supabase

The SvelteKit client reads the root `.env` with `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `.env.example` contains placeholders; never put a service-role or device token there.

You can also configure the app under **Online routes → Supabase ESP sensors → Supabase connection → Test and save connection** without rebuilding. Only browser-safe URL/public key settings are stored in local storage. Sensor readings refresh every 15 seconds and show depth and observation time; missing/stale readings pause the simulator. The actual database and Edge Function must be provisioned separately following [the setup guide](docs/SUPABASE.md).

## Demo and limits

Choose Demo scenarios for the bundled Fuente Osmeña → SM City Cebu routes: dry, primary flooded with bypass, and all blocked. Demo floods, traffic and vehicle thresholds are simulated. In sensor mode, any positive measured water blocks intersecting routes; missing readings never mean dry roads. Sensor radius is configured coverage, not measured flood extent.

Google supplies map tiles only. OSRM supplies road geometry and maneuvers. Online routing has no geometric fallback; no qualifying returned alternative means no alternative is offered. The simulator is not live GPS driving guidance. Demo fixtures work without routing access, but map tiles still require internet. All vehicle examples currently use the driving profile. No road safety is guaranteed by limited sensor coverage.

## Firmware

See [ESP32 PlatformIO guide](firmware/esp32/README.md). Both serial-input and hardware-adapter environments compile. The exact physical sensor model is still needed to implement its driver; hardware mode deliberately sends no readings until that adapter is supplied. No board has been flashed.

## Tests

Unit tests cover routing, flood intersections, public configuration validation, stale observations, protected ingestion and database RLS. Playwright mocks external routing/tiles/Supabase to exercise the actual SvelteKit UI, including failed connections and storage. It defaults to installed Microsoft Edge; set PLAYWRIGHT_CHANNEL=chrome for Chrome. Live cloud and physical sensor testing require your project and board.
