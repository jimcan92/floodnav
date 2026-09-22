# Interactive traveler/controller demo

Run `npm --prefix client run dev -- --host 0.0.0.0` and open port 3000 on the same trusted network. Use the host computer's LAN address, rather than localhost, when sharing with another device. Allow the development server through the local firewall if prompted. No cloud deployment is needed.

1. Open `/`, choose the start/destination and vehicle, then **Create demo**.
2. Copy the controller link from the traveler panel. Open it in another browser/device for the person changing conditions.
3. The traveler clicks **Start demo**. The controller adds traffic or flood areas by clicking the map, changes their values, then clicks **Apply changes**.
4. Traffic affects ETA and speed only inside the configured circles. A flood exceeding the vehicle's demo threshold pauses travel when it intersects the remaining route. **Find alternative from here** requests road routes from the current simulated position; the traveler must confirm the alternative.

Travel is simulated at 20× speed; this is not GPS driving guidance. Flood thresholds are demonstration values, not safety advice. A live rainfall assessment estimates exposure and does not measure flood depth.

## Sources and presets

New rooms start with both simulation switches ON and no zones. OFF means live, not disabled. Switches are independent. Zone values are retained when their source is switched to live. Source changes pause travel and rebuild the remaining route from the current location.

Traffic simulation uses OSRM base road timing with segment multipliers of 1, 1.5 and 2.5 for light, moderate and heavy traffic. Overlapping circles use the greatest multiplier. Rainfall intensity and flood depth are independent inputs. Flood depth controls simulated passability.

The controller's **Ready-made demo scenarios** load the bundled Fuente → SM City route pair and reset the trip. Dry, bypass and all-blocked presets need no routing API for initial playback. Finding a new route from a position reached mid-trip still needs online routing. Map tiles need internet.

Live traffic requires server-only `TOMTOM_API_KEY`. Live mode uses TomTom flow tiles and traffic-aware route geometry/ETA together. Overlay refresh is once per minute while visible; route refresh is every two minutes when not moving. Five-minute-old traffic estimates are marked stale. Missing credentials, quotas or failed requests are shown explicitly and never replaced by simulated values automatically. Live Cebu coverage must be verified with your own key; tests use mocked responses.

Live rainfall retains the existing OpenWeather/MGB integration. See `RAINFALL_RESEARCH.md` for configuration. Demo requests always disable research logging and do not require Supabase. The previous research interface remains available at `/research` with its existing behavior.

## Rooms and synchronization

This prototype requires **one persistent Node process**. Production local run: `npm run build`, then `node --env-file=.env client/build` (set `HOST=0.0.0.0` and `PORT=3000` as needed). Do not use independent serverless instances or multiple workers for rooms.

Rooms live only in server memory, with a maximum of 200 rooms per process. Restarting clears them. Controller and traveler are views, not authenticated roles. Anyone with the room link can edit conditions or explicitly take traveler control. Use this on a trusted demo network.

Only the active traveler writes telemetry, at most once per second. A second traveler view is read-only until **Take control** is selected. A page reload may require takeover because identity belongs to the browser tab runtime. Conditions have a revision to reject stale edits; preset resets have a separate epoch to reject telemetry from an old trip. SSE sends full snapshots on connect and at least every ten seconds; disconnect/stale synchronization pauses playback. Reconnection never auto-resumes.

## Address search

Local Cebu presets filter as you type. Online address lookup only runs when Search/Enter is pressed. Results are Philippine addresses, biased toward Cebu. Public Nominatim use follows https://operations.osmfoundation.org/policies/nominatim/ : no online autocomplete, at most one upstream request per second across this single process, identifying User-Agent, attribution and cached results. Set `NOMINATIM_URL` to switch providers and `NOMINATIM_USER_AGENT` to identify your application with a suitable contact. Do not submit confidential addresses. Multiple server instances would require shared throttling.

## Checks

`npm run check`, `npm test`, `npm run build`, `npm run test:e2e`. Browser tests exercise the new demo and the retained research page. Live TomTom/OpenWeather/MGB services and actual LAN-device connectivity require configured credentials and a reachable server.
