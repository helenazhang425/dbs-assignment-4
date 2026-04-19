import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the worker environment.",
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

function computeRunScore({
  temperatureC,
  apparentTemperatureC,
  windSpeedKph,
  precipitationProbability,
  hour,
}) {
  const feelsLike = apparentTemperatureC ?? temperatureC;
  const temperaturePenalty = Math.min(Math.abs(feelsLike - 14) * 3.2, 42);
  const windPenalty = Math.min(windSpeedKph * 1.25, 26);
  const rainPenalty = Math.min(precipitationProbability * 0.45, 28);
  const morningBonus = hour >= 6 && hour <= 9 ? 8 : 0;
  const eveningBonus = hour >= 17 && hour <= 20 ? 10 : 0;

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

async function fetchForecast(city) {
  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&current=temperature_2m,apparent_temperature,wind_speed_10m,weather_code&hourly=temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m&forecast_days=2&timezone=${encodeURIComponent(city.timezone)}`,
  );

  if (!response.ok) {
    throw new Error(`Open-Meteo request failed for ${city.city_name}`);
  }

  const data = await response.json();
  const currentHour = new Date(data.current.time).getHours();

  let bestRunTime = null;
  let bestRunScore = -1;
  let bestPrecipitation = null;

  for (let index = 0; index < Math.min(24, data.hourly.time.length); index += 1) {
    const candidateTime = data.hourly.time[index];
    const hour = new Date(candidateTime).getHours();
    if (hour < currentHour && index < 2) {
      continue;
    }
    if (hour < 6 || hour > 20) {
      continue;
    }

    const score = computeRunScore({
      temperatureC: data.hourly.temperature_2m[index],
      apparentTemperatureC: data.hourly.apparent_temperature?.[index] ?? null,
      windSpeedKph: data.hourly.wind_speed_10m?.[index] ?? 0,
      precipitationProbability:
        data.hourly.precipitation_probability?.[index] ?? 0,
      hour,
    });

    if (score > bestRunScore) {
      bestRunScore = score;
      bestRunTime = candidateTime;
      bestPrecipitation = data.hourly.precipitation_probability?.[index] ?? null;
    }
  }

  return {
    city_id: city.id,
    city_name: city.city_name,
    temperature_c: data.current.temperature_2m,
    apparent_temperature_c: data.current.apparent_temperature ?? null,
    precipitation_probability: bestPrecipitation,
    wind_speed_kph: data.current.wind_speed_10m ?? null,
    weather_code: data.current.weather_code ?? null,
    best_run_time: bestRunTime,
    best_run_score: bestRunScore >= 0 ? bestRunScore : null,
    source_timestamp: data.current.time,
  };
}

async function main() {
  const { data: cities, error } = await supabase
    .from("favorite_cities")
    .select("id, city_name, latitude, longitude, timezone");

  if (error) {
    throw error;
  }

  if (!cities || cities.length === 0) {
    console.log("No favorite cities found.");
    return;
  }

  const updates = await Promise.all(cities.map(fetchForecast));

  const { error: insertError } = await supabase
    .from("weather_updates")
    .upsert(updates, {
      onConflict: "city_id,source_timestamp",
      ignoreDuplicates: false,
    });

  if (insertError) {
    throw insertError;
  }

  console.log(`Wrote ${updates.length} weather updates.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
