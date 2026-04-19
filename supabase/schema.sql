create extension if not exists "pgcrypto";

drop table if exists public.asset_price_updates;
drop table if exists public.watched_assets;

create table if not exists public.favorite_cities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  city_name text not null,
  country text,
  admin1 text,
  latitude double precision not null,
  longitude double precision not null,
  timezone text not null,
  created_at timestamptz not null default now(),
  constraint favorite_cities_user_id_city_name_latitude_longitude_key
    unique (user_id, city_name, latitude, longitude)
);

create index if not exists favorite_cities_user_id_idx
  on public.favorite_cities (user_id);

create index if not exists favorite_cities_city_name_idx
  on public.favorite_cities (city_name);

create table if not exists public.weather_updates (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.favorite_cities (id) on delete cascade,
  city_name text not null,
  temperature_c numeric not null,
  apparent_temperature_c numeric,
  precipitation_probability integer,
  wind_speed_kph numeric,
  weather_code integer,
  best_run_time timestamptz,
  best_run_score integer,
  source_timestamp timestamptz not null,
  created_at timestamptz not null default now(),
  constraint weather_updates_city_id_source_timestamp_key
    unique (city_id, source_timestamp)
);

create index if not exists weather_updates_city_id_idx
  on public.weather_updates (city_id);

create index if not exists weather_updates_source_timestamp_idx
  on public.weather_updates (source_timestamp desc);

alter table public.favorite_cities enable row level security;
alter table public.weather_updates enable row level security;

drop policy if exists "users can view their own favorite cities"
on public.favorite_cities;

drop policy if exists "users can insert their own favorite cities"
on public.favorite_cities;

drop policy if exists "users can delete their own favorite cities"
on public.favorite_cities;

drop policy if exists "authenticated users can read weather updates"
on public.weather_updates;

create policy "users can view their own favorite cities"
on public.favorite_cities
for select
to authenticated
using (auth.uid() = user_id);

create policy "users can insert their own favorite cities"
on public.favorite_cities
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users can delete their own favorite cities"
on public.favorite_cities
for delete
to authenticated
using (auth.uid() = user_id);

create policy "authenticated users can read weather updates"
on public.weather_updates
for select
to authenticated
using (true);

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'asset_price_updates'
  ) then
    alter publication supabase_realtime drop table public.asset_price_updates;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'weather_updates'
  ) then
    alter publication supabase_realtime add table public.weather_updates;
  end if;
end $$;
