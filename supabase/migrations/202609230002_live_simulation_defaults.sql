-- Start untouched installations in live mode. Preserve published demo choices.
update public.simulation_state
set conditions = jsonb_set(
    jsonb_set(conditions, '{trafficSimulation}', 'false'::jsonb),
    '{floodSimulation}', 'false'::jsonb
  ),
  revision = revision + 1,
  updated_at = now()
where id = true and revision = 0;
