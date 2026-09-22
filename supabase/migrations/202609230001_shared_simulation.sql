-- One persistent environment; individual journeys are never stored here.
create table public.simulation_state (
  id boolean primary key default true check (id),
  revision integer not null default 0 check (revision >= 0),
  conditions jsonb not null check (
    jsonb_typeof(conditions) = 'object'
    and conditions ?& array['trafficSimulation', 'floodSimulation', 'zones']
    and jsonb_typeof(conditions->'trafficSimulation') = 'boolean'
    and jsonb_typeof(conditions->'floodSimulation') = 'boolean'
    and jsonb_typeof(conditions->'zones') = 'array'
    and jsonb_array_length(conditions->'zones') <= 100
  ),
  updated_at timestamptz not null default now()
);
insert into public.simulation_state (conditions)
values ('{"trafficSimulation":true,"floodSimulation":true,"zones":[]}');
alter table public.simulation_state enable row level security;
revoke all on public.simulation_state from public, anon, authenticated;
grant select, update on public.simulation_state to service_role;

-- Atomic compare-and-swap, including across application instances.
create function public.update_simulation(p_revision integer, p_conditions jsonb)
returns setof public.simulation_state
language sql security invoker set search_path = public, pg_temp as $$
  update public.simulation_state
  set conditions = p_conditions, revision = revision + 1, updated_at = now()
  where id = true and revision = p_revision
  returning *;
$$;
revoke all on function public.update_simulation(integer, jsonb) from public, anon, authenticated;
grant execute on function public.update_simulation(integer, jsonb) to service_role;
