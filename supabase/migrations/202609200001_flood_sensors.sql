-- Run once in a new Supabase project's SQL Editor, or apply with supabase db push.
create extension if not exists pgcrypto with schema extensions;

create table public.flood_sensors (
  id text primary key check (id ~ '^[a-zA-Z0-9_-]{1,64}$'),
  name text not null,
  affected_road text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius_meters integer not null default 50 check (radius_meters between 1 and 1000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.sensor_devices (
  sensor_id text primary key references public.flood_sensors(id) on delete cascade,
  token_sha256 text not null check (token_sha256 ~ '^[a-f0-9]{64}$'),
  enabled boolean not null default true
);
create table public.flood_readings (
  sensor_id text not null references public.flood_sensors(id) on delete cascade,
  reading_id uuid not null,
  water_depth_cm numeric(6,2) not null check (water_depth_cm between 0 and 1000),
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  primary key(sensor_id, reading_id)
);
create index flood_readings_latest_idx on public.flood_readings(sensor_id, observed_at desc, received_at desc);
alter table public.flood_sensors enable row level security;
alter table public.sensor_devices enable row level security;
alter table public.flood_readings enable row level security;
revoke all on public.flood_sensors, public.sensor_devices, public.flood_readings from anon, authenticated;
grant select on public.flood_sensors, public.flood_readings to anon, authenticated;
grant all on public.flood_sensors, public.sensor_devices, public.flood_readings to service_role;
create policy "Read active public sensors" on public.flood_sensors for select to anon, authenticated using (active);
create policy "Read observations of active public sensors" on public.flood_readings for select to anon, authenticated using (
  exists(select 1 from public.flood_sensors s where s.id = sensor_id and s.active)
);
-- No client policy on sensor_devices: credentials are accessible only server-side.
create view public.latest_flood_readings with (security_invoker = true) as
select s.id as sensor_id, s.name, s.affected_road, s.latitude, s.longitude, s.radius_meters,
       r.water_depth_cm, r.observed_at, r.received_at
from public.flood_sensors s
left join lateral (
  select water_depth_cm, observed_at, received_at
  from public.flood_readings where sensor_id = s.id
  order by observed_at desc, received_at desc limit 1
) r on true
where s.active;
grant select on public.latest_flood_readings to anon, authenticated, service_role;
