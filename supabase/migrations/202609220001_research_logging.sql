-- Independent of sensor tables. All research access is server-only.
create table public.research_snapshots (
  id text primary key check (id ~ '^[a-f0-9]{64}$'),
  kind text not null check (kind in ('weather', 'hazard')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);
create table public.research_assessments (
  id uuid primary key,
  assessed_at timestamptz not null,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  roads jsonb not null check (jsonb_typeof(roads) = 'array'),
  model jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create table public.research_assessment_snapshots (
  assessment_id uuid not null references public.research_assessments(id),
  snapshot_id text not null references public.research_snapshots(id),
  primary key (assessment_id, snapshot_id)
);
create index research_assessments_time_idx on public.research_assessments(assessed_at);
create index research_snapshots_kind_time_idx on public.research_snapshots(kind, created_at);
alter table public.research_snapshots enable row level security;
alter table public.research_assessments enable row level security;
alter table public.research_assessment_snapshots enable row level security;
revoke all on public.research_snapshots, public.research_assessments, public.research_assessment_snapshots from public, anon, authenticated;
grant all on public.research_snapshots, public.research_assessments, public.research_assessment_snapshots to service_role;

-- A single PostgREST RPC call is a transaction: snapshots and links cannot partially save.
-- Invoker security deliberately requires the server role, never a public client role.
create function public.save_research_assessment(p_batch jsonb) returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  assessment_id uuid := (p_batch->>'id')::uuid;
  existing_fingerprint text;
  item jsonb;
begin
  if jsonb_typeof(p_batch->'snapshots') <> 'array'
     or jsonb_typeof(p_batch->'roads') <> 'array'
     or jsonb_array_length(p_batch->'roads') not between 1 and 6 then
    raise exception 'Invalid research batch';
  end if;
  -- Serialize concurrent retries, including the first insert for an ID.
  perform pg_advisory_xact_lock(hashtextextended(assessment_id::text, 0));
  select fingerprint into existing_fingerprint from public.research_assessments where id = assessment_id;
  if found then
    if existing_fingerprint <> p_batch->>'fingerprint' then
      raise exception 'Assessment ID conflict; create a new evaluation';
    end if;
    return assessment_id;
  end if;
  insert into public.research_assessments(id, assessed_at, fingerprint, roads, model, result)
    values (assessment_id, (p_batch->>'assessedAt')::timestamptz, p_batch->>'fingerprint', p_batch->'roads', p_batch->'model', p_batch->'result');
  for item in select value from jsonb_array_elements(p_batch->'snapshots') loop
    insert into public.research_snapshots(id, kind, payload)
      values (item->>'id', item->>'kind', item->'payload') on conflict (id) do nothing;
    insert into public.research_assessment_snapshots(assessment_id, snapshot_id)
      values (assessment_id, item->>'id') on conflict do nothing;
  end loop;
  return assessment_id;
end;
$$;
revoke all on function public.save_research_assessment(jsonb) from public, anon, authenticated;
grant execute on function public.save_research_assessment(jsonb) to service_role;

-- Flat researcher exports; JSON remains available for full-fidelity reproducibility.
create view public.research_route_export with (security_invoker = true) as
select a.id assessment_id, a.assessed_at, a.model->>'version' model_version,
       r->>'key' route_key, (r->>'distanceMeters')::numeric distance_meters,
       (r->>'durationSeconds')::numeric duration_seconds,
       (e->>'score')::numeric exposure_score, (e->>'coverage')::numeric coverage,
       a.result->>'recommendedKey' recommended_route,
       e->'distanceByClass' distance_by_class, e->'reasons' missing_data_reasons,
       r->'polyline' geometry
from public.research_assessments a
cross join lateral jsonb_array_elements(a.roads) r
cross join lateral jsonb_array_elements(a.result->'routes') e
where r->>'key' = e->>'key';
create view public.research_weather_export with (security_invoker = true) as
select s.id snapshot_id, s.payload->>'cell' cell,
       s.payload->'requestedCoordinate' requested_coordinate,
       s.payload->>'fetchedAt' fetched_at, s.payload->>'product' product,
       s.payload->'raw'->'dt' provider_time,
       coalesce(s.payload->'normalized'->'rainMmH', s.payload->'raw'->'rain'->'1h') rain_mm_h,
       null::jsonb forecast_time, null::jsonb rain_mm_3h, null::jsonb probability
from public.research_snapshots s where s.kind = 'weather' and s.payload->>'product' = 'current'
union all
select s.id, s.payload->>'cell', s.payload->'requestedCoordinate', s.payload->>'fetchedAt',
       s.payload->>'product', null::jsonb, null::jsonb,
       f->'endsAt', f->'rainMm3h', f->'probability'
from public.research_snapshots s
cross join lateral jsonb_array_elements(s.payload->'normalized'->'intervals') f
where s.kind = 'weather' and s.payload->>'product' = 'forecast';
revoke all on public.research_route_export, public.research_weather_export from public, anon, authenticated;
grant select on public.research_route_export, public.research_weather_export to service_role;
