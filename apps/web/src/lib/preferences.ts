export type TempUnit = "C" | "F";

export type Preferences = {
  tempUnit: TempUnit;
  runStartHour: number;
  runEndHour: number;
};

export const DEFAULT_PREFERENCES: Preferences = {
  tempUnit: "C",
  runStartHour: 0,
  runEndHour: 23,
};

const STORAGE_KEY = "time-to-run-preferences";

function parseHourParam(value: string | null) {
  if (value == null) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 23) {
    return null;
  }
  return parsed;
}

function loadUrlPreferenceOverrides() {
  if (typeof window === "undefined") {
    return {};
  }

  const params = new URLSearchParams(window.location.search);
  const runStartHour = parseHourParam(params.get("start"));
  const runEndHour = parseHourParam(params.get("end"));

  return {
    ...(runStartHour != null ? { runStartHour } : {}),
    ...(runEndHour != null ? { runEndHour } : {}),
  };
}

export function loadPreferences(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const stored: Preferences = {
      tempUnit: parsed.tempUnit === "F" ? "F" : "C",
      runStartHour:
        Number.isInteger(parsed.runStartHour) &&
        parsed.runStartHour >= 0 &&
        parsed.runStartHour <= 23
          ? parsed.runStartHour
          : DEFAULT_PREFERENCES.runStartHour,
      runEndHour:
        Number.isInteger(parsed.runEndHour) &&
        parsed.runEndHour >= 0 &&
        parsed.runEndHour <= 23
          ? parsed.runEndHour
          : DEFAULT_PREFERENCES.runEndHour,
    };
    const next = {
      ...stored,
      ...loadUrlPreferenceOverrides(),
    };
    if (next.runStartHour >= next.runEndHour) {
      return stored;
    }
    return next;
  } catch {
    return {
      ...DEFAULT_PREFERENCES,
      ...loadUrlPreferenceOverrides(),
    };
  }
}

export function savePreferences(prefs: Preferences) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore — storage may be full or disabled
  }
}

export function syncPreferencesToUrl(prefs: Preferences) {
  if (typeof window === "undefined" || window.location.pathname !== "/") {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  params.set("start", String(prefs.runStartHour));
  params.set("end", String(prefs.runEndHour));

  const nextSearch = params.toString();
  const nextUrl = nextSearch
    ? `${window.location.pathname}?${nextSearch}${window.location.hash}`
    : `${window.location.pathname}${window.location.hash}`;

  window.history.replaceState(null, "", nextUrl);
}

export function formatTemperature(
  celsius: number | null | undefined,
  unit: TempUnit,
  withUnit = true,
) {
  if (celsius == null) return "—";
  const value = unit === "F" ? (celsius * 9) / 5 + 32 : celsius;
  const rounded = Math.round(value);
  return withUnit ? `${rounded}°${unit}` : `${rounded}°`;
}

export const PREFS_EVENT = "time-to-run:prefs-changed";
