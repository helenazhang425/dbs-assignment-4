"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AppNav } from "@/components/app-nav";
import { supabase } from "@/lib/supabase/client";
import { pageCache } from "@/lib/page-cache";
import {
  cityLabel,
  isFavoriteCity,
  type CitySearchResult,
  type FavoriteCity,
} from "@/lib/time-to-run";

function countryFlag(code?: string | null) {
  if (!code || code.length !== 2) return "🌍";
  const chars = [...code.toUpperCase()];
  if (!chars.every((c) => c >= "A" && c <= "Z")) return "🌍";
  return String.fromCodePoint(
    ...chars.map((c) => 0x1f1e6 + c.charCodeAt(0) - 0x41),
  );
}

export default function CitiesPage() {
  const [session, setSession] = useState<Session | null>(pageCache.session);
  const [favoriteCities, setFavoriteCities] = useState<FavoriteCity[]>(
    pageCache.favorites,
  );
  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<CitySearchResult[]>([]);
  const [searchingCities, setSearchingCities] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingCityKey, setPendingCityKey] = useState<string | null>(null);

  useEffect(() => {
    pageCache.session = session;
  }, [session]);
  useEffect(() => {
    pageCache.favorites = favoriteCities;
  }, [favoriteCities]);

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

  async function handleRemoveFavorite(favorite: FavoriteCity) {
    const key = `fav-${favorite.id}`;
    setPendingCityKey(key);
    setError(null);
    setMessage(null);

    const result = await supabase
      .from("favorite_cities")
      .delete()
      .eq("id", favorite.id);

    setPendingCityKey(null);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setMessage(`Removed ${favorite.city_name}.`);
    await loadFavoriteCities();
  }

  const favoriteCount = favoriteCities.length;

  const emptySearchHint = useMemo(() => {
    if (cityQuery.trim().length < 2) {
      return "Type at least two characters to search.";
    }

    if (searchingCities) {
      return "Searching…";
    }

    return "No matching cities.";
  }, [cityQuery, searchingCities]);

  return (
    <main className="min-h-screen text-[#3a3530]">
      <AppNav session={session} />

      {/* ── HERO: sunrise gradient with prominent search ────────────── */}
      <section className="relative overflow-hidden border-b border-[#ebe3d7] bg-[linear-gradient(135deg,#5d7896_0%,#d18b68_60%,#e89e7a_100%)] text-[#faf6f0]">
        <div
          aria-hidden
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "repeating-linear-gradient(55deg, transparent 0 18px, rgba(250,246,240,0.18) 18px 20px)",
          }}
        />
        <div className="relative mx-auto flex min-h-[420px] max-w-6xl flex-col justify-end px-6 py-14">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-[#faf6f0]/80">
            <span aria-hidden>🌍</span> Cities
          </div>
          <h1 className="mt-3 font-serif text-5xl leading-[1.05] tracking-tight text-balance md:text-6xl">
            Pick the cities you want to run.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#faf6f0]/85 md:text-lg md:leading-8">
            Search any city, star your favorites, and we&apos;ll watch the
            forecast for the best run window in each one.
          </p>
        </div>
        <div
          aria-hidden
          className="h-[3px] w-full"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg,#e8b96e 0 18px,transparent 18px 30px)",
          }}
        />
      </section>

      {/* ── FLASH MESSAGES ──────────────────────────────────────────── */}
      <div className="mx-auto max-w-6xl px-6">
        {message ? (
          <div className="mt-5 flex items-center gap-3 rounded-full border border-[#b8c9d9] bg-[#e6edf5] px-5 py-2 text-sm text-[#4a6382]">
            <span aria-hidden>☀</span> {message}
          </div>
        ) : null}
        {error ? (
          <div className="mt-5 flex items-center gap-3 rounded-full border border-[#e89e7a] bg-[#f5e4de] px-5 py-2 text-sm text-[#8a4a3a]">
            <span aria-hidden>⚠</span> {error}
          </div>
        ) : null}
      </div>

      {!session ? (
        <section className="mx-auto max-w-3xl px-6 py-16">
          <div className="rounded-[1.6rem] border-2 border-dashed border-[#b8c9d9] bg-[#ffffff] p-10 text-center">
            <div className="text-4xl">👟</div>
            <h2 className="mt-4 font-serif text-3xl text-[#4a6382]">
              Sign in to start tracking cities
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#55504a]">
              Your cities are tied to your account. Sign in from the top right
              and come back here to star the cities you run.
            </p>
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-6xl px-6 py-10">
          {/* ── YOUR CITIES: horizontal chip strip ──────────────────── */}
          <div className="mb-10">
            <div className="flex items-end justify-between gap-4 border-b-2 border-dashed border-[#e89e7a]/40 pb-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#8a847d]">
                  Your cities
                </p>
                <h2 className="mt-1 font-serif text-3xl text-[#4a6382]">
                  {favoriteCount === 0
                    ? "No cities yet — add your first one below"
                    : `${favoriteCount} ${favoriteCount === 1 ? "city" : "cities"} tracked`}
                </h2>
              </div>
            </div>

            {favoriteCount > 0 ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {favoriteCities.map((fav) => (
                  <button
                    key={fav.id}
                    onClick={() => {
                      void handleRemoveFavorite(fav);
                    }}
                    type="button"
                    className="group inline-flex items-center gap-2 rounded-full border border-[#4a6382] bg-[#4a6382] px-4 py-1.5 text-sm text-[#faf6f0] hover:border-[#e89e7a] hover:bg-[#e89e7a]"
                    title={`Remove ${fav.city_name}`}
                  >
                    <span aria-hidden>⭐</span>
                    <span className="font-medium">{fav.city_name}</span>
                    <span className="text-[#e8b96e] group-hover:text-[#faf6f0]">
                      {pendingCityKey === `fav-${fav.id}` ? "…" : "×"}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border-2 border-dashed border-[#d9cfc0] bg-[#ffffff] px-6 py-8 text-center text-sm text-[#8a847d]">
                Search a city below and star it to add it to your list.
              </div>
            )}
          </div>

          {/* ── SEARCH BAR + RESULTS ────────────────────────────────── */}
          <div>
            <div className="flex items-end justify-between gap-4 border-b-2 border-dashed border-[#e89e7a]/40 pb-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#8a847d]">
                  City search
                </p>
                <h2 className="mt-1 font-serif text-3xl text-[#4a6382]">
                  Add a city
                </h2>
              </div>
              {cityResults.length > 0 ? (
                <span className="text-xs text-[#8a847d]">
                  {cityResults.length} match
                  {cityResults.length === 1 ? "" : "es"}
                </span>
              ) : null}
            </div>

            <div className="mt-5 flex items-center gap-3 rounded-2xl border border-[#ebe3d7] bg-[#ffffff] px-4 py-3 focus-within:border-[#4a6382]">
              <span aria-hidden className="text-xl text-[#8a847d]">
                🔍
              </span>
              <input
                id="city-search"
                className="h-10 w-full bg-transparent text-lg text-[#3a3530] placeholder:text-[#8a847d] outline-none"
                onChange={(event) => {
                  setCityQuery(event.target.value);
                  if (event.target.value.trim().length < 2) {
                    setCityResults([]);
                    setSearchingCities(false);
                  }
                }}
                placeholder="Chicago, Tokyo, Reykjavik, São Paulo…"
                type="text"
                value={cityQuery}
              />
              {searchingCities ? (
                <span className="text-xs text-[#b86b3c]">searching…</span>
              ) : null}
            </div>

            <div className="mt-5 space-y-3">
              {cityResults.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-[#d9cfc0] bg-[#ffffff] px-6 py-10 text-center text-sm text-[#8a847d]">
                  {emptySearchHint}
                </div>
              ) : (
                cityResults.map((city) => {
                  const favorite = isFavoriteCity(city, favoriteCities);
                  const key = `${city.name}-${city.latitude}-${city.longitude}`;
                  const pending = pendingCityKey === key;

                  return (
                    <article
                      key={key}
                      className={`grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-[1.3rem] border px-5 py-4 transition ${
                        favorite
                          ? "border-[#4a6382] bg-[#e6edf5]"
                          : "border-[#ebe3d7] bg-[#ffffff] hover:border-[#b8c9d9] hover:bg-[#f5efe6]"
                      }`}
                    >
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl ${
                          favorite
                            ? "bg-[#4a6382] text-[#e8b96e]"
                            : "bg-[#ebe3d7]"
                        }`}
                        aria-hidden
                      >
                        {favorite ? "⭐" : countryFlag(city.country_code)}
                      </div>

                      <div>
                        <div className="font-serif text-xl text-[#4a6382]">
                          {cityLabel(city)}
                        </div>
                        <div className="mt-0.5 flex gap-3 font-mono text-[11px] text-[#8a847d]">
                          <span>{city.latitude.toFixed(2)}°</span>
                          <span>{city.longitude.toFixed(2)}°</span>
                          <span>{city.timezone}</span>
                        </div>
                      </div>

                      <button
                        className={`rounded-full px-4 py-2 text-xs font-medium uppercase tracking-wider transition ${
                          favorite
                            ? "bg-[#e89e7a] text-[#ffffff] hover:bg-[#d18b68]"
                            : "bg-[#4a6382] text-[#faf6f0] hover:bg-[#5d7896]"
                        }`}
                        onClick={() => {
                          void handleToggleFavorite(city);
                        }}
                        type="button"
                        disabled={pending}
                      >
                        {pending ? "…" : favorite ? "Remove" : "Add"}
                      </button>
                    </article>
                  );
                })
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
