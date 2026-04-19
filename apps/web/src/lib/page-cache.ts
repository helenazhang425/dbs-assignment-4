import type { Session } from "@supabase/supabase-js";
import type { CityWeather, FavoriteCity } from "./time-to-run";

export const pageCache: {
  session: Session | null;
  favorites: FavoriteCity[];
  weather: Record<string, CityWeather>;
  weatherFetchedAt: number;
} = {
  session: null,
  favorites: [],
  weather: {},
  weatherFetchedAt: 0,
};

export const WEATHER_FRESH_MS = 60_000;

export function isWeatherFresh() {
  return Date.now() - pageCache.weatherFetchedAt < WEATHER_FRESH_MS;
}
