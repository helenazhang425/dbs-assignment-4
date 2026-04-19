"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AppNav } from "@/components/app-nav";
import { supabase } from "@/lib/supabase/client";
import {
  fetchWeatherForCities,
  formatRunTime,
  type CityWeather,
  type FavoriteCity,
  weatherLabel,
} from "@/lib/time-to-run";

type AuthMode = "sign-in" | "sign-up";
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

export default function Home() {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [favoriteCities, setFavoriteCities] = useState<FavoriteCity[]>([]);
  const [weatherByCity, setWeatherByCity] = useState<Record<string, CityWeather>>(
    {},
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [loadingOverview, setLoadingOverview] = useState(false);

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

  const loadOverviewWeather = useCallback(async (cities: FavoriteCity[]) => {
    setLoadingOverview(true);

    try {
      const updates = await fetchWeatherForCities(cities);
      setWeatherByCity(updates);
    } catch (loadError) {
      if (loadError instanceof Error) {
        setError(loadError.message);
      } else {
        setError("Unable to load weather.");
      }
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  const loadRealtimeWeather = useCallback(
    async (cities: FavoriteCity[]) => {
      if (cities.length === 0) {
        setWeatherByCity({});
        return;
      }

      setLoadingOverview(true);

      const cityIds = cities.map((city) => city.id);
      const result = await supabase
        .from("weather_updates")
        .select(
          "city_id, source_timestamp, temperature_c, apparent_temperature_c, wind_speed_kph, weather_code, best_run_time, best_run_score, precipitation_probability",
        )
        .in("city_id", cityIds)
        .order("source_timestamp", { ascending: false });

      setLoadingOverview(false);

      if (result.error) {
        setError(result.error.message);
        return;
      }

      const latestByCity: Record<string, CityWeather> = {};
      for (const row of result.data as WeatherUpdateRow[]) {
        if (!latestByCity[row.city_id]) {
          latestByCity[row.city_id] = mapWeatherRow(row);
        }
      }

      setWeatherByCity(latestByCity);
    },
    [mapWeatherRow],
  );

  const loadFavoriteCities = useCallback(async () => {
    const result = await supabase
      .from("favorite_cities")
      .select(
        "id, city_name, country, admin1, latitude, longitude, timezone, created_at",
      )
      .order("created_at", { ascending: true });

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
      setMessage(nextSession ? "Welcome back." : null);

      if (nextSession) {
        void loadFavoriteCities();
      } else {
        setFavoriteCities([]);
        void loadOverviewWeather(demoCities);
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

          setWeatherByCity((current) => ({
            ...current,
            [row.city_id as string]: mapWeatherRow(row as WeatherUpdateRow),
          }));
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

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoadingAuth(true);
    setError(null);
    setMessage(null);

    const credentials = {
      email: email.trim(),
      password,
    };

    const result =
      mode === "sign-up"
        ? await supabase.auth.signUp(credentials)
        : await supabase.auth.signInWithPassword(credentials);

    setLoadingAuth(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setMessage(mode === "sign-up" ? "Account created." : "Welcome back.");
  }

  async function handleSignOut() {
    setLoadingAuth(true);
    setError(null);
    setMessage(null);

    const result = await supabase.auth.signOut();

    setLoadingAuth(false);

    if (result.error) {
      setError(result.error.message);
    }
  }

  const topCity = useMemo(() => {
    const ranked = displayedCities
      .map((city) => ({ city, weather: weatherByCity[city.id] }))
      .filter((entry) => entry.weather?.bestRunScore !== null)
      .sort(
        (left, right) =>
          (right.weather?.bestRunScore ?? 0) - (left.weather?.bestRunScore ?? 0),
      );

    return ranked[0] ?? null;
  }, [displayedCities, weatherByCity]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#edf6ff_0%,#f8fbff_40%,#ffffff_100%)] text-[#17324c]">
      <AppNav
        loadingAuth={loadingAuth}
        onSignOut={() => {
          void handleSignOut();
        }}
        session={session}
      />

      <div className="mx-auto max-w-7xl px-6 py-8">
        {message ? (
          <div className="mb-5 rounded-2xl border border-[#bad7f4] bg-[#edf6ff] px-4 py-3 text-sm text-[#215b8b]">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mb-5 rounded-2xl border border-[#f0bcc1] bg-[#fff4f4] px-4 py-3 text-sm text-[#a12a34]">
            {error}
          </div>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] border border-[#d7e2ee] bg-white/90 p-7 shadow-[0_22px_60px_rgba(30,67,107,0.08)]">
            <p className="text-sm uppercase tracking-[0.2em] text-[#6e879f]">
              Weather overview
            </p>
            <h1 className="mt-4 font-serif text-5xl leading-[1.02] tracking-tight text-balance">
              {session
                ? "Run when the weather is finally on your side."
                : "See the best running windows in world cities."}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4a657f]">
              {session
                ? "Your home page tracks current conditions and the next strong run window for each city you follow."
                : "Sign in to follow your own cities. Until then, browse live conditions in New York, London, Paris, Tokyo, and Sydney."}
            </p>

            <div className="mt-7 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#dbe6f1] bg-[#f8fbff] px-4 py-4">
                <div className="text-xs uppercase tracking-[0.14em] text-[#7891a7]">
                  Cities shown
                </div>
                <div className="mt-2 font-serif text-3xl">
                  {displayedCities.length}
                </div>
              </div>
              <div className="rounded-2xl border border-[#dbe6f1] bg-[#f8fbff] px-4 py-4">
                <div className="text-xs uppercase tracking-[0.14em] text-[#7891a7]">
                  Refresh
                </div>
                <div className="mt-2 font-serif text-3xl">60s</div>
              </div>
              <div className="rounded-2xl border border-[#dbe6f1] bg-[#f8fbff] px-4 py-4">
                <div className="text-xs uppercase tracking-[0.14em] text-[#7891a7]">
                  Best score
                </div>
                <div className="mt-2 font-serif text-3xl">
                  {topCity?.weather?.bestRunScore ?? "--"}
                </div>
              </div>
            </div>
          </div>

          {session ? (
            <div className="rounded-[2rem] border border-[#d7e2ee] bg-[linear-gradient(180deg,#17324c_0%,#20496d_100%)] p-7 text-white shadow-[0_22px_60px_rgba(15,47,77,0.18)]">
              <p className="text-sm uppercase tracking-[0.2em] text-[#aac7e3]">
                Next best run
              </p>
              <h2 className="mt-4 font-serif text-4xl leading-tight text-balance">
                {topCity
                  ? `${topCity.city.city_name} at ${formatRunTime(
                      topCity.weather?.bestRunTime ?? null,
                      topCity.city.timezone,
                    )}`
                  : "Pick at least 1 city to follow."}
              </h2>
              <p className="mt-4 max-w-lg text-base leading-8 text-[#d5e6f6]">
                {topCity
                  ? `${weatherLabel(topCity.weather?.weatherCode ?? null)}, ${Math.round(topCity.weather?.temperatureC ?? 0)}°C, and a run score of ${topCity.weather?.bestRunScore ?? "--"}/100.`
                  : "Head to My Cities to choose where you want live weather and best-time-to-run recommendations."}
              </p>
            </div>
          ) : (
            <div
              className="rounded-[2rem] border border-[#d7e2ee] bg-white/90 p-7 shadow-[0_22px_60px_rgba(30,67,107,0.08)]"
              id="auth"
            >
              <div className="mb-5 flex gap-4 border-b border-[#e4edf5] text-sm">
                <button
                  className={`pb-2 ${mode === "sign-in" ? "border-b-2 border-[#17324c] text-[#17324c]" : "text-[#6e879f]"}`}
                  onClick={() => setMode("sign-in")}
                  type="button"
                >
                  Sign in
                </button>
                <button
                  className={`pb-2 ${mode === "sign-up" ? "border-b-2 border-[#17324c] text-[#17324c]" : "text-[#6e879f]"}`}
                  onClick={() => setMode("sign-up")}
                  type="button"
                >
                  Create account
                </button>
              </div>

              <form className="space-y-4" onSubmit={handleAuthSubmit}>
                <div>
                  <label className="mb-1 block text-sm text-[#3b5671]">Email</label>
                  <input
                    className="h-11 w-full rounded-xl border border-[#cad7e4] px-3 text-sm outline-none"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-[#3b5671]">
                    Password
                  </label>
                  <input
                    className="h-11 w-full rounded-xl border border-[#cad7e4] px-3 text-sm outline-none"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={
                      mode === "sign-in" ? "current-password" : "new-password"
                    }
                    minLength={6}
                    required
                  />
                </div>
                <button
                  className="h-11 w-full rounded-xl bg-[#2f7ed8] px-4 text-sm text-white hover:bg-[#2669b5]"
                  disabled={loadingAuth}
                  type="submit"
                >
                  {loadingAuth
                    ? "Working..."
                    : mode === "sign-in"
                      ? "Sign in"
                      : "Create account"}
                </button>
              </form>
            </div>
          )}
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-3xl">City conditions</h2>
            {loadingOverview ? (
              <span className="text-sm text-[#688098]">Refreshing...</span>
            ) : null}
          </div>

          {session && favoriteCities.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-[#cedae6] bg-white/70 px-6 py-10 text-center">
              <h3 className="font-serif text-3xl">Pick at least 1 city to follow.</h3>
              <p className="mx-auto mt-3 max-w-xl text-base leading-8 text-[#4a657f]">
                Add cities on the My Cities page and this weather overview will
                switch from demo cities to your personal running forecast.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {displayedCities.map((city) => {
                const weather = weatherByCity[city.id];

                return (
                  <article
                    key={city.id}
                    className="rounded-[1.6rem] border border-[#d7e2ee] bg-white/90 p-5 shadow-[0_16px_46px_rgba(30,67,107,0.07)]"
                  >
                    <div>
                      <h3 className="font-serif text-2xl">{city.city_name}</h3>
                      <p className="mt-1 text-sm text-[#688098]">
                        {city.admin1 ? `${city.admin1}, ` : ""}
                        {city.country}
                      </p>
                    </div>

                    <div className="mt-6 flex items-end justify-between gap-4">
                      <div>
                        <div className="text-xs uppercase tracking-[0.14em] text-[#7891a7]">
                          Today
                        </div>
                        <div className="mt-2 font-serif text-5xl leading-none">
                          {weather ? `${Math.round(weather.temperatureC)}°` : "--"}
                        </div>
                      </div>
                      <div className="text-sm text-[#688098]">
                        {weatherLabel(weather?.weatherCode ?? null)}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
