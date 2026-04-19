export type FavoriteCity = {
  id: string;
  city_name: string;
  country: string | null;
  admin1: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
  created_at: string;
};

export type CitySearchResult = {
  id: number;
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

export type CityWeather = {
  currentTime: string;
  temperatureC: number;
  apparentTemperatureC: number | null;
  windSpeedKph: number | null;
  weatherCode: number | null;
  bestRunTime: string | null;
  bestRunScore: number | null;
  precipitationProbability: number | null;
};

export function cityLabel(city: {
  city_name?: string;
  name?: string;
  admin1?: string | null;
  country?: string | null;
}) {
  const base = city.city_name ?? city.name ?? "";
  const region = city.admin1 ? `, ${city.admin1}` : "";
  const country = city.country ? `, ${city.country}` : "";
  return `${base}${region}${country}`;
}

export function weatherLabel(code: number | null) {
  if (code === null) return "Unknown";
  if (code === 0) return "Clear";
  if ([1, 2, 3].includes(code)) return "Partly cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Storm";
  return "Mixed";
}

export function computeRunScore(input: {
  temperatureC: number;
  apparentTemperatureC: number | null;
  windSpeedKph: number;
  precipitationProbability: number;
  hour: number;
}) {
  const feelsLike = input.apparentTemperatureC ?? input.temperatureC;
  const temperaturePenalty = Math.min(Math.abs(feelsLike - 14) * 3.2, 42);
  const windPenalty = Math.min(input.windSpeedKph * 1.25, 26);
  const rainPenalty = Math.min(input.precipitationProbability * 0.45, 28);
  const morningBonus = input.hour >= 6 && input.hour <= 9 ? 8 : 0;
  const eveningBonus = input.hour >= 17 && input.hour <= 20 ? 10 : 0;

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 - temperaturePenalty - windPenalty - rainPenalty + morningBonus + eveningBonus,
      ),
    ),
  );
}

export function formatRunTime(value: string | null, timezone: string) {
  if (!value) return "No clear window";

  return new Date(value).toLocaleTimeString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function isFavoriteCity(
  searchResult: CitySearchResult,
  favoriteCities: FavoriteCity[],
) {
  return favoriteCities.find(
    (city) =>
      city.city_name === searchResult.name &&
      city.latitude === searchResult.latitude &&
      city.longitude === searchResult.longitude,
  );
}

export async function fetchWeatherForCities(cities: FavoriteCity[]) {
  const updates = await Promise.all(
    cities.map(async (city) => {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&current=temperature_2m,apparent_temperature,wind_speed_10m,weather_code&hourly=temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m&forecast_days=2&timezone=${encodeURIComponent(city.timezone)}`,
      );

      if (!response.ok) {
        throw new Error(`Weather lookup failed for ${city.city_name}.`);
      }

      const data = (await response.json()) as {
        current: {
          time: string;
          temperature_2m: number;
          apparent_temperature?: number;
          wind_speed_10m?: number;
          weather_code?: number;
        };
        hourly: {
          time: string[];
          temperature_2m: number[];
          apparent_temperature?: number[];
          precipitation_probability?: number[];
          wind_speed_10m?: number[];
        };
      };

      const currentHour = new Date(data.current.time).getHours();
      let bestRunTime: string | null = null;
      let bestRunScore = -1;
      let bestPrecipitation: number | null = null;

      for (
        let index = 0;
        index < Math.min(24, data.hourly.time.length);
        index += 1
      ) {
        const candidateTime = data.hourly.time[index];
        const hour = new Date(candidateTime).getHours();
        if (hour < currentHour && index < 2) {
          continue;
        }

        const score = computeRunScore({
          temperatureC: data.hourly.temperature_2m[index],
          apparentTemperatureC:
            data.hourly.apparent_temperature?.[index] ?? null,
          windSpeedKph: data.hourly.wind_speed_10m?.[index] ?? 0,
          precipitationProbability:
            data.hourly.precipitation_probability?.[index] ?? 0,
          hour,
        });

        if (score > bestRunScore) {
          bestRunScore = score;
          bestRunTime = candidateTime;
          bestPrecipitation =
            data.hourly.precipitation_probability?.[index] ?? null;
        }
      }

      return [
        city.id,
        {
          currentTime: data.current.time,
          temperatureC: data.current.temperature_2m,
          apparentTemperatureC: data.current.apparent_temperature ?? null,
          windSpeedKph: data.current.wind_speed_10m ?? null,
          weatherCode: data.current.weather_code ?? null,
          bestRunTime,
          bestRunScore: bestRunScore >= 0 ? bestRunScore : null,
          precipitationProbability: bestPrecipitation,
        } satisfies CityWeather,
      ] as const;
    }),
  );

  return Object.fromEntries(updates) as Record<string, CityWeather>;
}
