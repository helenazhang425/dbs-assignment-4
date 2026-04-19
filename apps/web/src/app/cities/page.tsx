"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AppNav } from "@/components/app-nav";
import { supabase } from "@/lib/supabase/client";
import {
  cityLabel,
  isFavoriteCity,
  type CitySearchResult,
  type FavoriteCity,
} from "@/lib/time-to-run";

export default function CitiesPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [favoriteCities, setFavoriteCities] = useState<FavoriteCity[]>([]);
  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<CitySearchResult[]>([]);
  const [searchingCities, setSearchingCities] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingCityKey, setPendingCityKey] = useState<string | null>(null);

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

    setFavoriteCities(result.data as FavoriteCity[]);
  }, []);

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
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadFavoriteCities]);

  useEffect(() => {
    if (!session || cityQuery.trim().length < 2) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setSearchingCities(true);

        const response = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityQuery.trim())}&count=8&language=en&format=json`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error("City search failed.");
        }

        const data = (await response.json()) as { results?: CitySearchResult[] };
        setCityResults(data.results ?? []);
      } catch (searchError) {
        if (searchError instanceof Error && searchError.name === "AbortError") {
          return;
        }
        setCityResults([]);
      } finally {
        setSearchingCities(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [cityQuery, session]);

  async function handleToggleFavorite(city: CitySearchResult) {
    if (!session) {
      return;
    }

    const existingFavorite = isFavoriteCity(city, favoriteCities);
    const key = `${city.name}-${city.latitude}-${city.longitude}`;
    setPendingCityKey(key);
    setError(null);
    setMessage(null);

    if (existingFavorite) {
      const result = await supabase
        .from("favorite_cities")
        .delete()
        .eq("id", existingFavorite.id);

      setPendingCityKey(null);

      if (result.error) {
        setError(result.error.message);
        return;
      }

      setMessage(`Removed ${city.name}.`);
      await loadFavoriteCities();
      return;
    }

    const result = await supabase.from("favorite_cities").insert({
      user_id: session.user.id,
      city_name: city.name,
      country: city.country ?? null,
      admin1: city.admin1 ?? null,
      latitude: city.latitude,
      longitude: city.longitude,
      timezone: city.timezone,
    });

    setPendingCityKey(null);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setMessage(`Added ${city.name}.`);
    await loadFavoriteCities();
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

  const favoriteCount = favoriteCities.length;

  const emptySearchHint = useMemo(() => {
    if (cityQuery.trim().length < 2) {
      return "Search for a city to start building your favorites.";
    }

    if (searchingCities) {
      return "Searching...";
    }

    return "No matching cities found yet.";
  }, [cityQuery, searchingCities]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f2f8ff_0%,#ffffff_100%)] text-[#17324c]">
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

        {!session ? (
          <div className="rounded-[2rem] border border-[#d7e2ee] bg-white/90 px-6 py-12 text-center shadow-[0_20px_50px_rgba(30,67,107,0.08)]">
            <h1 className="font-serif text-4xl">Sign in to manage your cities.</h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-8 text-[#4a657f]">
              Once you sign in, you can search for cities worldwide and toggle
              favorites on or off with a single tap.
            </p>
          </div>
        ) : (
          <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[2rem] border border-[#d7e2ee] bg-white/90 p-7 shadow-[0_20px_50px_rgba(30,67,107,0.08)]">
              <p className="text-sm uppercase tracking-[0.18em] text-[#6e879f]">
                My Cities
              </p>
              <h1 className="mt-4 font-serif text-5xl leading-[1.02] tracking-tight">
                Pick at least 1 city to follow.
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4a657f]">
                Gold stars mark the cities in your favorites list. Toggle any
                city on or off and your home page will update around those
                selections.
              </p>

              <div className="mt-7 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-[#dbe6f1] bg-[#f8fbff] px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-[#7891a7]">
                    Favorites
                  </div>
                  <div className="mt-2 font-serif text-3xl">{favoriteCount}</div>
                </div>
                <div className="rounded-2xl border border-[#dbe6f1] bg-[#f8fbff] px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-[#7891a7]">
                    Personalized feed
                  </div>
                  <div className="mt-2 text-lg font-medium">
                    {favoriteCount > 0 ? "Ready" : "Needs cities"}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-[#d7e2ee] bg-white/90 p-7 shadow-[0_20px_50px_rgba(30,67,107,0.08)]">
              <label className="block text-sm text-[#4a657f]">
                Search by city name
              </label>
              <input
                className="mt-2 h-12 w-full rounded-xl border border-[#cad7e4] px-4 text-sm outline-none"
                onChange={(event) => {
                  setCityQuery(event.target.value);
                  if (event.target.value.trim().length < 2) {
                    setCityResults([]);
                    setSearchingCities(false);
                  }
                }}
                placeholder="Chicago, Tokyo, Paris, São Paulo..."
                type="text"
                value={cityQuery}
              />

              <div className="mt-5 space-y-3">
                {cityResults.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#d5e1ed] bg-[#fbfdff] px-4 py-6 text-sm text-[#688098]">
                    {emptySearchHint}
                  </div>
                ) : (
                  cityResults.map((city) => {
                    const favorite = isFavoriteCity(city, favoriteCities);
                    const key = `${city.name}-${city.latitude}-${city.longitude}`;

                    return (
                      <button
                        key={key}
                        className="flex w-full items-center justify-between gap-4 rounded-2xl border border-[#dbe6f1] bg-[#fbfdff] px-4 py-4 text-left hover:bg-[#f7fbff]"
                        onClick={() => {
                          void handleToggleFavorite(city);
                        }}
                        type="button"
                      >
                        <div>
                          <div className="font-medium text-[#17324c]">
                            {cityLabel(city)}
                          </div>
                          <div className="mt-1 text-sm text-[#688098]">
                            {city.timezone}
                          </div>
                        </div>
                        <div className="text-2xl">
                          {pendingCityKey === key
                            ? "…"
                            : favorite
                              ? "★"
                              : "☆"}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
