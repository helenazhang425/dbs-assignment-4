export type TempUnit = "C" | "F";

export type Preferences = {
  tempUnit: TempUnit;
  runStartHour: number;
  runEndHour: number;
};

export const DEFAULT_PREFERENCES: Preferences = {
  tempUnit: "C",
  runStartHour: 6,
  runEndHour: 20,
};

const STORAGE_KEY = "time-to-run-preferences";

export function loadPreferences(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
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
  } catch {
    return DEFAULT_PREFERENCES;
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
