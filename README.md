# FloodNav

The default screen is now a directions-focused **Traveler demo**, with a separate **Controller** link for changing traffic and floods during travel. Rooms use a single Node server's memory and SSE; no login or Supabase is required. See [interactive demo instructions](docs/DEMO.md). The previous rainfall/research interface is preserved at `/research`.

Active app: **SvelteKit in `client/`**, with Leaflet + Google Hybrid/Satellite/Streets, OSRM road routes, OpenWeather rainfall + MGB susceptibility, optional Supabase research logging, and demo scenarios.

See [rainfall and research setup](docs/RAINFALL_RESEARCH.md) for private keys, the research migration, source verification, the logging switch, model limitations and CSV/JSON exports. Logging defaults on per browser; disabling it keeps weather/routing available without new research records. ESP sensors remain visible but temporarily disabled.

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

Production local Node server: `node --env-file=.env client/build`. Vercel builds select the Vercel adapter using the Vercel environment; local builds use the Node adapter to avoid Windows symlink permission errors. Nothing is deployed automatically.

## Folders

- `client/`: active SvelteKit app; its own package.json and dependencies.
- `supabase/`: SQL migration and protected ESP ingestion Edge Function.
- `firmware/esp32/`: PlatformIO ESP32 project, configuration templates and sensor adapter.
- `docs/SUPABASE.md`: cloud setup, sensor registration and payload contract.
- `tests/`: shared service/database tests and browser scenarios targeting SvelteKit.

## Supabase

The SvelteKit client reads the root `.env` with `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `.env.example` contains placeholders; never put a service-role or device token there.

The ESP source and its connection UI are temporarily disabled during the rainfall research phase. Its existing implementation is retained for later reactivation: only public URL/key settings are stored in browser storage, sensor readings refresh every 15 seconds, and missing/stale readings pause the simulator. Sensor provisioning remains documented in [the setup guide](docs/SUPABASE.md).

## Demo and limits

Choose Demo scenarios for the bundled Fuente Osmeña → SM City Cebu routes: dry, primary flooded with bypass, and all blocked. Demo floods, traffic and vehicle thresholds are simulated. In sensor mode, any positive measured water blocks intersecting routes; missing readings never mean dry roads. Sensor radius is configured coverage, not measured flood extent.

Google supplies map tiles only. OSRM supplies road geometry and maneuvers. Online routing has no geometric fallback; no qualifying returned alternative means no alternative is offered. The simulator is not live GPS driving guidance. Demo fixtures work without routing access, but map tiles still require internet. All vehicle examples currently use the driving profile. No road safety is guaranteed by limited sensor coverage.

## Firmware

See [ESP32 PlatformIO guide](firmware/esp32/README.md). Both serial-input and hardware-adapter environments compile. The exact physical sensor model is still needed to implement its driver; hardware mode deliberately sends no readings until that adapter is supplied. No board has been flashed.

## Tests

Unit tests cover routing, flood intersections, public configuration validation, stale observations, protected ingestion and database RLS. Playwright mocks external routing/tiles/Supabase to exercise the actual SvelteKit UI, including failed connections and storage. It defaults to installed Microsoft Edge; set PLAYWRIGHT_CHANNEL=chrome for Chrome. Live cloud and physical sensor testing require your project and board.
