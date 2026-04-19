# TimeToRun Architecture

## Overview

TimeToRun is a live weather dashboard for runners.

Users sign in, choose favorite cities, and see current conditions plus the best
time to run in each city. Weather data flows through the same architecture used
in the class NBA scoreboard:

External Data Source -> Background Worker -> Supabase -> Next.js Frontend

For this project:

- external data source: Open-Meteo
- background worker: Railway
- database + realtime + auth: Supabase
- frontend: Next.js on Vercel

## Product Goal

The app helps a user answer:

- What does the weather look like in my cities right now?
- Which city has the best run window next?
- When is the best time to run today in each place I follow?

## Data Flow

1. a user signs in with Supabase Auth
2. the user adds one or more cities to `favorite_cities`
3. the Railway worker polls Open-Meteo on a schedule
4. the worker reads tracked cities from Supabase
5. the worker fetches weather forecasts for those cities
6. the worker computes the best run time and score
7. the worker writes rows into `weather_updates`
8. Supabase Realtime emits insert/update events
9. the Next.js frontend receives those events and updates live

## Tables

### `favorite_cities`

Stores the cities each user wants to follow.

Columns:

- `id` uuid primary key
- `user_id` uuid not null
- `city_name` text not null
- `country` text
- `admin1` text
- `latitude` double precision not null
- `longitude` double precision not null
- `timezone` text not null
- `created_at` timestamptz default now()

RLS:

- users can read only their own rows
- users can insert only their own rows
- users can delete only their own rows

### `weather_updates`

Stores weather snapshots written by the worker.

Columns:

- `id` uuid primary key
- `city_id` uuid not null
- `city_name` text not null
- `temperature_c` numeric not null
- `apparent_temperature_c` numeric
- `precipitation_probability` integer
- `wind_speed_kph` numeric
- `weather_code` integer
- `best_run_time` timestamptz
- `best_run_score` integer
- `source_timestamp` timestamptz not null
- `created_at` timestamptz default now()

RLS:

- authenticated users can read `weather_updates`
- only the worker writes using the service role

Realtime:

- `weather_updates` is added to `supabase_realtime`

## Frontend

Routes:

- `/` -> weather overview
- `/cities` -> city picker and favorites

Behavior:

- logged out users see a world-city overview
- logged in users see weather for favorite cities
- the home page subscribes to realtime changes on `weather_updates`
- the cities page toggles favorites on and off with star controls

## Worker

Location:

- `apps/worker`

Responsibilities:

- query `favorite_cities`
- call Open-Meteo forecast API
- compute best run scores
- upsert `weather_updates`

## Open-Meteo APIs

- geocoding: city search
- forecast: current + hourly weather forecast

Open-Meteo is free for non-commercial use and does not require an API key for
this class project.
