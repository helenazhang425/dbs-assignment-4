"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AppNav } from "@/components/app-nav";
import { supabase } from "@/lib/supabase/client";
import { isWeatherFresh, pageCache } from "@/lib/page-cache";
import { usePreferences } from "@/lib/use-preferences";
import { formatTemperature, type TempUnit } from "@/lib/preferences";
import {
  fetchWeatherForCities,
  formatRunTime,
  type CityWeather,
  type FavoriteCity,
  weatherLabel,
} from "@/lib/time-to-run";

type WeatherUpdateRow = {
  city_id: string;
  source_timestamp: string;
  temperature_c: number;
  apparent_temperature_c: number | null;
  wind_speed_kph: number | null;
  weather_code: number | null;
  best_run_time: string | null;
  best_run_score: number | null;
  precipitation_probability: number | null;
};

const demoCities: FavoriteCity[] = [
  {
    id: "new-york-demo",
    city_name: "New York",
    country: "United States",
    admin1: "New York",
    latitude: 40.7143,
    longitude: -74.006,
    timezone: "America/New_York",
    created_at: "",
  },
  {
    id: "london-demo",
    city_name: "London",
    country: "United Kingdom",
    admin1: "England",
    latitude: 51.5085,
    longitude: -0.1257,
    timezone: "Europe/London",
    created_at: "",
  },
  {
    id: "paris-demo",
    city_name: "Paris",
    country: "France",
    admin1: "Île-de-France",
    latitude: 48.8534,
    longitude: 2.3488,
    timezone: "Europe/Paris",
    created_at: "",
  },
  {
    id: "tokyo-demo",
    city_name: "Tokyo",
    country: "Japan",
    admin1: "Tokyo",
    latitude: 35.6895,
    longitude: 139.6917,
    timezone: "Asia/Tokyo",
    created_at: "",
  },
  {
    id: "sydney-demo",
    city_name: "Sydney",
    country: "Australia",
    admin1: "New South Wales",
    latitude: -33.8679,
    longitude: 151.2073,
    timezone: "Australia/Sydney",
    created_at: "",
  },
];

function scoreTier(score: number | null | undefined) {
  if (score == null) return { label: "—", tone: "bg-[#ebe3d7] text-[#55504a]" };
  if (score >= 80) return { label: "Prime run", tone: "bg-[#4a6382] text-[#faf6f0]" };
  if (score >= 60) return { label: "Strong pace", tone: "bg-[#7895b3] text-[#faf6f0]" };
  if (score >= 40) return { label: "Tough air", tone: "bg-[#b86b3c] text-[#faf6f0]" };
  return { label: "Rest day", tone: "bg-[#7a7369] text-[#faf6f0]" };
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(pageCache.session);
  const [favoriteCities, setFavoriteCities] = useState<FavoriteCity[]>(
    pageCache.favorites,
  );
  const [weatherByCity, setWeatherByCity] = useState<Record<string, CityWeather>>(
    pageCache.weather,
  );
  const [error, setError] = useState<string | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);

  const [prefs] = usePreferences();

  useEffect(() => {
    pageCache.session = session;
  }, [session]);
  useEffect(() => {
    pageCache.favorites = favoriteCities;
  }, [favoriteCities]);
  useEffect(() => {
    pageCache.weather = weatherByCity;
  }, [weatherByCity]);

  const displayedCities = session ? favoriteCities : demoCities;

  const mapWeatherRow = useCallback((row: WeatherUpdateRow): CityWeather => {
    return {
      currentTime: row.source_timestamp,
      temperatureC: row.temperature_c,
      apparentTemperatureC: row.apparent_temperature_c,
      windSpeedKph: row.wind_speed_kph,
      weatherCode: row.weather_code,
      bestRunTime: row.best_run_time,
      bestRunScore: row.best_run_score,
      precipitationProbability: row.precipitation_probability,
    };
  }, []);

  const loadCachedWeather = useCallback(
    async (cities: FavoriteCity[]) => {
      if (cities.length === 0) {
        setWeatherByCity({});
        pageCache.weather = {};
        pageCache.weatherFetchedAt = Date.now();
        return;
      }

      const result = await supabase
        .from("weather_updates")
        .select(
          "city_id, source_timestamp, temperature_c, apparent_temperature_c, wind_speed_kph, weather_code, best_run_time, best_run_score, precipitation_probability",
        )
        .in(
          "city_id",
          cities.map((city) => city.id),
        )
        .order("source_timestamp", { ascending: false });

      if (result.error) {
        throw result.error;
      }

      const latestByCity: Record<string, CityWeather> = {};
      for (const row of (result.data ?? []) as WeatherUpdateRow[]) {
        if (!latestByCity[row.city_id]) {
          latestByCity[row.city_id] = mapWeatherRow(row);
        }
      }

      setWeatherByCity(latestByCity);
      pageCache.weather = latestByCity;
      pageCache.weatherFetchedAt = Date.now();
    },
    [mapWeatherRow],
  );

  const loadOverviewWeather = useCallback(
    async (cities: FavoriteCity[], force = false) => {
      const cacheCoversAll = cities.every((c) => pageCache.weather[c.id]);
      if (!force && isWeatherFresh() && cacheCoversAll) {
        return;
      }
      setLoadingOverview(true);

      try {
        const updates = await fetchWeatherForCities(cities, {
          startHour: prefs.runStartHour,
          endHour: prefs.runEndHour,
        });
        setWeatherByCity(updates);
        pageCache.weatherFetchedAt = Date.now();
      } catch (loadError) {
        if (loadError instanceof Error) {
          setError(loadError.message);
        } else {
          setError("Unable to load weather.");
        }
      } finally {
        setLoadingOverview(false);
      }
    },
    [prefs.runStartHour, prefs.runEndHour],
  );

  const loadRealtimeWeather = useCallback(
    async (cities: FavoriteCity[]) => {
      if (cities.length === 0) {
        setWeatherByCity({});
        return;
      }
      setLoadingOverview(true);

      try {
        await loadCachedWeather(cities);
        const missingCities = cities.filter((city) => !pageCache.weather[city.id]);

        if (missingCities.length > 0) {
          const fallbackUpdates = await fetchWeatherForCities(missingCities, {
            startHour: prefs.runStartHour,
            endHour: prefs.runEndHour,
          });

          setWeatherByCity((current) => {
            const nextWeather = { ...current, ...fallbackUpdates };
            pageCache.weather = nextWeather;
            return nextWeather;
          });
          pageCache.weatherFetchedAt = Date.now();
        }
        setError(null);
      } catch (loadError) {
        if (loadError instanceof Error) {
          setError(loadError.message);
        } else {
          setError("Unable to load weather.");
        }
      } finally {
        setLoadingOverview(false);
      }
    },
    [loadCachedWeather, prefs.runEndHour, prefs.runStartHour],
  );

  const loadFavoriteCities = useCallback(async () => {
    const result = await supabase
      .from("favorite_cities")
      .select(
        "id, city_name, country, admin1, latitude, longitude, timezone, created_at",
      )
      .order("city_name", { ascending: true });

    if (result.error) {
      setError(result.error.message);
      return;
    }

    const nextCities = result.data as FavoriteCity[];
    setFavoriteCities(nextCities);
    await loadRealtimeWeather(nextCities);
  }, [loadRealtimeWeather]);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!isMounted) {
        return;
      }

      if (sessionError) {
        setError(sessionError.message);
        return;
      }

      setSession(data.session);

      if (data.session) {
        void loadFavoriteCities();
      } else {
        void loadOverviewWeather(demoCities);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setError(null);

      if (nextSession) {
        void loadFavoriteCities();
      } else {
        setFavoriteCities([]);
        setWeatherByCity({});
        void loadOverviewWeather(demoCities, true);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadFavoriteCities, loadOverviewWeather]);

  useEffect(() => {
    if (!session || favoriteCities.length === 0) {
      return;
    }

    const cityIds = new Set(favoriteCities.map((city) => city.id));
    const channel = supabase
      .channel("weather-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "weather_updates",
        },
        (payload) => {
          const row =
            (payload.new as Partial<WeatherUpdateRow>) ??
            (payload.old as Partial<WeatherUpdateRow>);

          if (!row.city_id || !cityIds.has(row.city_id)) {
            return;
          }

          setWeatherByCity((current) => {
            const incoming = mapWeatherRow(row as WeatherUpdateRow);
            const existing = current[row.city_id as string];
            return {
              ...current,
              [row.city_id as string]: existing
                ? {
                    ...incoming,
                    bestRunTime: existing.bestRunTime,
                    bestRunScore: existing.bestRunScore,
                    precipitationProbability: existing.precipitationProbability,
                  }
                : incoming,
            };
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [favoriteCities, mapWeatherRow, session]);

  useEffect(() => {
    if (session) {
      return;
    }

    if (!displayedCities.length) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadOverviewWeather(displayedCities);
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [displayedCities, loadOverviewWeather, session]);

  const prefsHoursSignature = `${prefs.runStartHour}-${prefs.runEndHour}`;
  const lastPrefsHours = useRef(prefsHoursSignature);
  useEffect(() => {
    if (lastPrefsHours.current === prefsHoursSignature) {
      return;
    }
    lastPrefsHours.current = prefsHoursSignature;
    const cities = session ? favoriteCities : demoCities;
    if (cities.length > 0) {
      if (session) {
        void loadRealtimeWeather(cities);
      } else {
        void loadOverviewWeather(cities, true);
      }
    }
  }, [
    favoriteCities,
    loadOverviewWeather,
    loadRealtimeWeather,
    prefsHoursSignature,
    session,
  ]);

  const rankedCities = useMemo(() => {
    return displayedCities
      .map((city) => ({ city, weather: weatherByCity[city.id] }))
      .sort(
        (left, right) =>
          (right.weather?.bestRunScore ?? -1) -
          (left.weather?.bestRunScore ?? -1),
      );
  }, [displayedCities, weatherByCity]);

  const podium = rankedCities.slice(0, 3);
  const rest = rankedCities.slice(3);
  const topCity = podium[0] ?? null;

  const avgScore = useMemo(() => {
    const scores = rankedCities
      .map((entry) => entry.weather?.bestRunScore)
      .filter((score): score is number => typeof score === "number");
    if (!scores.length) return null;
    return Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
  }, [rankedCities]);

  const hasCities = displayedCities.length > 0;

  return (
    <main className="min-h-screen text-[#3a3530]">
      <AppNav session={session} />

      {/* ── HERO: dawn-sky gradient ─────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-[#ebe3d7] bg-[linear-gradient(135deg,#4a6382_0%,#7895b3_55%,#b8c9d9_100%)] text-[#faf6f0]">
        <div
          aria-hidden
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "repeating-linear-gradient(115deg, transparent 0 22px, rgba(250,246,240,0.18) 22px 24px)",
          }}
        />
        <div className="relative mx-auto flex min-h-[420px] max-w-6xl flex-col gap-8 px-6 py-14 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#faf6f0]/10 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[#faf6f0]/90 ring-1 ring-[#faf6f0]/20">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#e8b96e]" />
              {session ? "Live · your cities" : "Live · world overview"}
            </div>
            <h1 className="mt-5 font-serif text-5xl leading-[1.04] tracking-tight text-balance md:text-6xl">
              {topCity
                ? `${topCity.city.city_name} has the clearest run window.`
                : "Add a city and we'll map your next run window."}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-[#faf6f0]/85 md:text-lg md:leading-8">
              {session
                ? "We score every hour in the next day across your favorite cities — then point you at the best hour to run."
                : "We score every hour in the next day across cities worldwide. Sign in to save your own favorites."}
            </p>
          </div>

          <div className="relative w-full max-w-sm shrink-0 rounded-[1.5rem] border border-[#faf6f0]/30 bg-[#3a3530]/40 p-6 backdrop-blur-sm">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#e8b96e]">
              Next best window
            </div>
            <div className="mt-3 font-serif text-4xl leading-none">
              {topCity?.weather?.bestRunTime
                ? formatRunTime(topCity.weather.bestRunTime, topCity.city.timezone)
                : "—"}
            </div>
            <div className="mt-2 text-sm text-[#faf6f0]/80">
              {topCity ? topCity.city.city_name : "Pick a city"}
              {topCity?.weather?.weatherCode != null
                ? ` · ${weatherLabel(topCity.weather.weatherCode)}`
                : ""}
            </div>
            <div className="mt-5 flex items-center gap-3">
              <ScoreDial score={topCity?.weather?.bestRunScore ?? null} />
              <div className="text-xs leading-5 text-[#faf6f0]/75">
                Run score <br />
                <span className="font-mono text-sm text-[#faf6f0]">
                  {topCity?.weather?.bestRunScore ?? "—"}/100
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* sunrise stripe */}
        <div
          aria-hidden
          className="h-[3px] w-full"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg,#e8b96e 0 18px,transparent 18px 30px)",
          }}
        />
      </section>

      {error ? (
        <div className="mx-auto max-w-6xl px-6">
          <div className="mt-5 flex items-center gap-3 rounded-full border border-[#e89e7a] bg-[#f5e4de] px-5 py-2 text-sm text-[#8a4a3a]">
            <span aria-hidden>⚠</span> {error}
          </div>
        </div>
      ) : null}

      {/* ── STATS STRIP (3-up) ─────────────────────────────────────── */}
      <section className="mx-auto mt-10 grid max-w-6xl grid-cols-1 gap-3 px-6 md:grid-cols-3">
        <RunStat
          label="Cities shown"
          value={displayedCities.length.toString()}
          hint={session ? "in your list" : "world overview"}
        />
        <RunStat
          label="Avg run score"
          value={avgScore != null ? `${avgScore}` : "—"}
          hint="across all shown"
        />
        <RunStat
          label="Top score"
          value={topCity?.weather?.bestRunScore?.toString() ?? "—"}
          hint={topCity?.city.city_name ?? "—"}
        />
      </section>

      {/* ── MAIN GRID: leaderboard + side rail ─────────────────────── */}
      <section className="mx-auto mt-10 grid max-w-6xl gap-8 px-6 pb-20 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <div className="mb-5 flex items-end justify-between gap-4 border-b-2 border-dashed border-[#e89e7a]/40 pb-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-[#8a847d]">
                Run windows
              </p>
              <h2 className="mt-1 font-serif text-3xl text-[#4a6382] md:text-4xl">
                Ranked by run window
              </h2>
            </div>
            {loadingOverview ? (
              <span className="text-xs text-[#8a847d]">Refreshing…</span>
            ) : null}
          </div>

          {hasCities && podium.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-3">
              {podium.map((entry, index) => (
                <PodiumCard
                  key={entry.city.id}
                  city={entry.city}
                  weather={entry.weather}
                  rank={index + 1}
                  tempUnit={prefs.tempUnit}
                />
              ))}
            </div>
          ) : null}

          {hasCities && rest.length > 0 ? (
            <ol className="mt-6 overflow-hidden rounded-[1.4rem] border border-[#ebe3d7] bg-[#ffffff] shadow-[0_8px_26px_rgba(74,99,130,0.08)]">
              {rest.map((entry, index) => (
                <LeaderRow
                  key={entry.city.id}
                  city={entry.city}
                  weather={entry.weather}
                  rank={podium.length + index + 1}
                  tempUnit={prefs.tempUnit}
                />
              ))}
            </ol>
          ) : null}

          {session && favoriteCities.length === 0 ? (
            <div className="rounded-[1.6rem] border-2 border-dashed border-[#b8c9d9] bg-[#ffffff] p-8 text-center">
              <div className="text-3xl">🏙</div>
              <h3 className="mt-3 font-serif text-2xl text-[#4a6382]">
                No cities tracked yet
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#55504a]">
                Head to <span className="font-medium">My cities</span> and pick
                a few — the leaderboard fills in as weather rolls in.
              </p>
            </div>
          ) : null}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <RunBriefCard topCity={topCity} session={session} tempUnit={prefs.tempUnit} />
          <LegendCard />
        </aside>
      </section>
    </main>
  );
}

/* ─────────── small presentational components ─────────── */

function RunStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-[#ebe3d7] bg-[#ffffff] px-4 py-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-[#8a847d]">
        <span className="inline-block h-1.5 w-5 rounded-full bg-[#e89e7a]" />
        {label}
      </div>
      <div className="mt-1 font-serif text-3xl text-[#4a6382]">{value}</div>
      <div className="mt-1 text-xs text-[#8a847d]">{hint}</div>
    </div>
  );
}

function PodiumCard({
  city,
  weather,
  rank,
  tempUnit,
}: {
  city: FavoriteCity;
  weather: CityWeather | undefined;
  rank: number;
  tempUnit: TempUnit;
}) {
  const tier = scoreTier(weather?.bestRunScore);
  const score = weather?.bestRunScore;
  const bg =
    score == null
      ? "bg-[linear-gradient(160deg,#ebe3d7_0%,#d9cfc0_100%)] text-[#3a3530]"
      : score >= 80
        ? "bg-[linear-gradient(160deg,#4a6382_0%,#5d7896_100%)] text-[#faf6f0]"
        : score >= 60
          ? "bg-[linear-gradient(160deg,#7895b3_0%,#b8c9d9_100%)] text-[#faf6f0]"
          : score >= 40
            ? "bg-[linear-gradient(160deg,#b86b3c_0%,#d18858_100%)] text-[#faf6f0]"
            : "bg-[linear-gradient(160deg,#7a7369_0%,#8a847d_100%)] text-[#faf6f0]";
  return (
    <article
      className={`relative flex h-full flex-col overflow-hidden rounded-[1.4rem] p-5 shadow-[0_10px_32px_rgba(74,99,130,0.14)] ${bg}`}
    >
      <div className="absolute right-3 top-3 text-[10px] uppercase tracking-[0.3em] opacity-80">
        #{rank}
      </div>
      <div className="line-clamp-1 text-[10px] uppercase tracking-[0.28em] opacity-80">
        {city.admin1 ?? city.country ?? "City"}
      </div>
      <h3 className="mt-1 line-clamp-2 min-h-[3.5rem] font-serif text-2xl leading-tight">
        {city.city_name}
      </h3>

      <div className="mt-5 flex items-start justify-between gap-4">
        <div>
          <div className="font-serif text-5xl leading-none">
            {weather ? formatTemperature(weather.temperatureC, tempUnit, false) : "—"}
          </div>
          <div className="mt-1 text-xs opacity-80">
            {weatherLabel(weather?.weatherCode ?? null)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase leading-tight tracking-[0.22em] opacity-80">
            Best
            <br />
            window
          </div>
          <div className="mt-2 font-mono text-sm">
            {weather?.bestRunTime
              ? formatRunTime(weather.bestRunTime, city.timezone)
              : "—"}
          </div>
        </div>
      </div>

      <div className="mt-auto pt-8">
        <div className="inline-flex items-center gap-2 rounded-full bg-[#faf6f0]/95 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-[#3a3530]">
          <span className={`inline-block h-2 w-2 rounded-full ${tier.tone.split(" ")[0]}`} />
          {tier.label} · {weather?.bestRunScore ?? "—"}
        </div>
      </div>
    </article>
  );
}

function LeaderRow({
  city,
  weather,
  rank,
  tempUnit,
}: {
  city: FavoriteCity;
  weather: CityWeather | undefined;
  rank: number;
  tempUnit: TempUnit;
}) {
  const score = weather?.bestRunScore ?? 0;
  const tier = scoreTier(weather?.bestRunScore);
  return (
    <li className="grid grid-cols-[auto_1.6fr_1fr_1fr_auto] items-center gap-4 border-b border-[#ebe3d7] px-5 py-4 last:border-b-0">
      <div className="font-mono text-sm text-[#8a847d]">#{rank}</div>
      <div>
        <div className="font-serif text-xl text-[#4a6382]">{city.city_name}</div>
        <div className="text-xs text-[#8a847d]">
          {city.admin1 ? `${city.admin1} · ` : ""}
          {city.country ?? city.timezone}
        </div>
      </div>
      <div>
        <div className="font-mono text-lg text-[#3a3530]">
          {weather ? formatTemperature(weather.temperatureC, tempUnit) : "—"}
        </div>
        <div className="text-xs text-[#8a847d]">
          {weatherLabel(weather?.weatherCode ?? null)}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-[#8a847d]">
          Best window
        </div>
        <div className="font-mono text-sm text-[#3a3530]">
          {weather?.bestRunTime
            ? formatRunTime(weather.bestRunTime, city.timezone)
            : "—"}
        </div>
      </div>
      <div className="w-28">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-[#8a847d]">
          <span>score</span>
          <span className="font-mono text-[#3a3530]">{weather?.bestRunScore ?? "—"}</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#ebe3d7]">
          <div
            className={`h-full ${tier.tone.split(" ")[0]}`}
            style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
          />
        </div>
      </div>
    </li>
  );
}

function ScoreDial({ score }: { score: number | null }) {
  const value = Math.max(0, Math.min(100, score ?? 0));
  const angle = (value / 100) * 360;
  return (
    <div
      aria-hidden
      className="relative h-14 w-14 rounded-full"
      style={{
        background: `conic-gradient(#e8b96e ${angle}deg, rgba(250,246,240,0.15) ${angle}deg 360deg)`,
      }}
    >
      <div className="absolute inset-1.5 flex items-center justify-center rounded-full bg-[#3a3530]/80 font-mono text-sm text-[#faf6f0]">
        {score ?? "—"}
      </div>
    </div>
  );
}

function RunBriefCard({
  topCity,
  session,
  tempUnit,
}: {
  topCity:
    | { city: FavoriteCity; weather: CityWeather | undefined }
    | null;
  session: Session | null;
  tempUnit: TempUnit;
}) {
  return (
    <div className="rounded-[1.4rem] border border-[#ebe3d7] bg-[linear-gradient(160deg,#4a6382_0%,#5d7896_100%)] p-6 text-[#faf6f0] shadow-[0_14px_30px_rgba(74,99,130,0.22)]">
      <div className="text-[10px] uppercase tracking-[0.3em] text-[#e8b96e]">
        Today&apos;s run brief
      </div>
      <h3 className="mt-2 font-serif text-2xl leading-snug">
        {topCity
          ? `${topCity.city.city_name} · ${
              topCity.weather?.bestRunTime
                ? formatRunTime(topCity.weather.bestRunTime, topCity.city.timezone)
                : "no clear window"
            }`
          : "Pick a city to get a brief"}
      </h3>
      <p className="mt-3 text-sm leading-6 text-[#faf6f0]/85">
        {topCity
          ? `${weatherLabel(topCity.weather?.weatherCode ?? null)}, ${formatTemperature(topCity.weather?.temperatureC, tempUnit)}, rain chance ${topCity.weather?.precipitationProbability ?? 0}%. Score ${topCity.weather?.bestRunScore ?? "—"}/100.`
          : session
            ? "Your brief fills in once you've added cities on the My cities page."
            : "Sign in to track your own cities."}
      </p>
    </div>
  );
}

function LegendCard() {
  return (
    <div className="rounded-[1.4rem] border border-[#ebe3d7] bg-[#ffffff] p-5">
      <div className="text-[10px] uppercase tracking-[0.3em] text-[#8a847d]">
        Run score
      </div>
      <ul className="mt-3 space-y-2 text-xs">
        <LegendItem tone="bg-[#4a6382]" label="Prime run · 80+" />
        <LegendItem tone="bg-[#7895b3]" label="Strong pace · 60–79" />
        <LegendItem tone="bg-[#b86b3c]" label="Tough air · 40–59" />
        <LegendItem tone="bg-[#7a7369]" label="Rest day · under 40" />
      </ul>
    </div>
  );
}

function LegendItem({ tone, label }: { tone: string; label: string }) {
  return (
    <li className="flex items-center gap-3 text-[#55504a]">
      <span className={`inline-block h-2.5 w-6 rounded-full ${tone}`} />
      {label}
    </li>
  );
}
