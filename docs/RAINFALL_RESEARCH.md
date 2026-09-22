# Rainfall and research logging

## Setup

1. Set `OPENWEATHER_API_KEY` in root `.env`. Never use the old `PUBLIC_OPEN_WEATHER_API_KEY` name; weather requests are server-side.
2. Apply `supabase/migrations/202609220001_research_logging.sql` in the intended Supabase project's SQL editor or existing migration workflow. It adds independent research tables without changing sensor tables.
3. Set private `SUPABASE_SERVICE_ROLE_KEY`. Optional `SUPABASE_URL` otherwise defaults to `PUBLIC_SUPABASE_URL`. Never put the server key in browser settings. Restart after environment changes.
4. Review the [MGB public dataset](https://controlmap.mgb.gov.ph/arcgis/rest/services/GeospatialDataInventory_Public/GDI_Detailed_Flood_Susceptibility_Public/MapServer/0), local coverage and reuse conditions before setting `MGB_DATA_VERIFIED=true`. This enables experimental ranking, not predictive validity. The default is false because the source's reuse/license metadata was blank during verification.
5. Run `npm run dev`. For production locally: `npm run build`, then `node --env-file=.env client/build` from the repository root. No deployment is automatic.

The existing weather key was verified against both endpoints during implementation. A Cebu query returned 17 polygons across LF/MF/HF/VHF after bounding geometry precision. This does not verify coverage of every Metro Cebu route. The private Supabase credential was absent; live research saves require steps 2–3.

## Switch and records

**Research data logging** defaults enabled. The browser restores `floodnav.researchLogging` before assessment requests. Disabling sends false and makes zero research writes, including retries; temporary operational caches remain available. This preference affects only that browser. Without local storage, the current-page toggle works but cannot survive reload.

Enabling saves the current assessment on the next evaluation without historical backfill. Disabling does not delete existing records, and an already-started write may finish. Obsolete responses cannot overwrite the new UI state. Collection runs only during use: trip changes, manual refreshes and the rainfall panel's ten-minute refresh. There is no unattended collector.

Research snapshots preserve raw and normalized weather, provider timestamps, requested/returned coordinates, forecast intervals, MGB polygons and metadata. Assessments preserve candidate route geometries, distance/duration, segment contributions, coverage, scores, recommendation, model constants/version and snapshot links. No user identity or GPS movement trace is recorded; route geometry includes endpoints.

Snapshots deduplicate by provider/product/request identity and payload hash. A deduplicated snapshot retains its first acquisition metadata; assessments retain their own evaluation times. Cache hits still receive persisted references when logging is enabled. One RPC transaction writes the assessment, snapshots and links. RLS and grants deny public/authenticated access; only the server role can save or export.

Save retries reuse a UUID and frozen batch for 30 minutes in the same server process. After expiry/restart, a retry may conflict with an existing ID; use **Refresh weather assessment** to generate a new evaluation. Existing rows are not overwritten. Failed saves show **Research log not saved** but do not stop routing. Disabled mode removes the save-retry action.

No automatic deletion is configured. Review Supabase storage growth and export/archive according to the research protocol; geometry can be sizeable.

## Data processing and bounds

Study targets: Cebu, Mandaue, Lapu-Lapu, Talisay, Naga, Carcar, Danao, Compostela, Liloan, Consolacion, Cordova, Minglanilla and San Fernando. Request validation uses a study envelope (latitude 9.9–10.7, longitude 123.45–124.15), not official LGU boundaries. Unclassified sections never count as low susceptibility.

Weather uses 0.02-degree grid centers for all cells crossed by candidate routes. This is application sampling, not provider resolution or a street rain gauge. Current data cache/refresh is ten minutes; forecast cache one hour. Three provider calls may run concurrently. A conservative process-local budget of 40 OpenWeather calls/minute and HTTP 429 cooldown limits bursts. Long cold routes may need another refresh after the limit resets. Multi-instance hosting needs shared quotas/cache before scaling beyond the local research prototype.

Requests allow up to six routes, 15,000 total coordinates, 1.5 MB JSON, and 128 weather cells. Oversized requests fail or return incomplete coverage. API failures never become zero rainfall. Keyed provider URLs are excluded from returned errors.

MGB queries check counts and paginate 500 features at a time in WGS84. They request six decimal places and `maxAllowableOffset=0.00001` degrees (approximately one metre here), avoiding oversized multipart responses. This generalizes geometry slightly; it is not survey precision. Complete constituent polygons intersecting the query envelope, including holes, are retained; distant multipart pieces are omitted. Query settings are recorded in snapshots. Cache duration is 24 hours.

Current `rain.1h` is mm/hour; forecast `rain.3h` is mm per three-hour interval. Probability stays separate. Omitted rain on a valid non-rain condition becomes an explicit normalized zero. Missing amounts on rainy/unknown conditions remain unavailable. Forecast failure can leave valid current rainfall visible, but disables route comparison.

## Experimental model

`E = sum(lengthKm × susceptibilityWeight × (1 + rainRateMmH / 10))`

Weights: LF=1, MF=2, HF=3, VHF=4. Rain rate is the maximum of current rate and the nearest upcoming forecast interval's amount divided by three. The latter is an interval average, not an hourly forecast. Geometry is split at polygon/grid boundaries, overlaps use the highest class, and holes remain unclassified.

The weights, scaling and 10% improvement threshold are project assumptions, **not a published/calibrated flood-prediction formula**. The index is not flood probability, depth, damage or passability. Vehicle clearance does not affect rainfall ranking.

Every candidate must have complete usable data and the MGB verification gate must be enabled before comparison. Current observations older than 30 minutes or forecasts fetched an hour ago are unusable. Among distinct OSRM alternatives, suggest the lowest score if at least 10% below primary; ties use travel time then distance. Selection is manual, and refreshes retain the selected geometry. Missing assessment does not prevent normal route preview or simulated travel.

Illustrative sensitivity check: A is 1 km at VHF, B is 1.5 km at LF, both at 2 mm/h.

| Assumption | A | B | Lower exposure |
|---|---:|---:|---|
| Default weights, scale 10 | 4.8 | 1.8 | B |
| Default weights, scale 5 | 5.6 | 2.1 | B |
| Default weights, scale 20 | 4.4 | 1.65 | B |
| Weights 1/2/4/8, scale 10 | 9.6 | 1.8 | B |

This synthetic example is stable; actual routes may reverse order. Validate sensitivity using logged candidates before interpreting results. Usage-based data have sampling gaps and selection bias. Forecasts are not observations; static susceptibility is not current inundation. Logs contain no independent flood ground truth. Accuracy claims require local flood-event validation.

## Export

Run in Supabase SQL editor as project owner, then export results as CSV:

```sql
select * from public.research_weather_export order by fetched_at, snapshot_id, forecast_time;
select * from public.research_route_export order by assessed_at, assessment_id, route_key;
```

The weather export separates `rain_mm_h` from `rain_mm_3h`; unused columns are null. Current provider time is Unix seconds, forecast interval ends are ISO timestamps. Normalized no-rain values export as zero. Failed responses are never inferred as zero.

Full JSON, including geometry and original responses:

```sql
select jsonb_build_object(
  'assessment', to_jsonb(a),
  'snapshots', coalesce((
    select jsonb_agg(to_jsonb(s) order by s.id)
    from public.research_assessment_snapshots link
    join public.research_snapshots s on s.id = link.snapshot_id
    where link.assessment_id = a.id
  ), '[]'::jsonb)
) as research_record
from public.research_assessments a
order by a.assessed_at;
```

Filter `assessed_at` to manageable study periods. No public export endpoint exposes research routes.

## Checks

Run `npm run check`, `npm test`, `npm run test:e2e`, and `npm run build`. Coverage includes parsing, missing/stale data, intersections/holes/overlaps, ranking, zero-write mode, retries, transaction rollback, RLS/export access, switch persistence, late responses and demo regressions. Browser tests mock providers; live credential/source checks are separate.
