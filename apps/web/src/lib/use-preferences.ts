"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  PREFS_EVENT,
  savePreferences,
  syncPreferencesToUrl,
  type Preferences,
} from "./preferences";

export function usePreferences() {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    setPrefs(loadPreferences());
    const sync = () => setPrefs(loadPreferences());
    window.addEventListener(PREFS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PREFS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback(
    (updater: Preferences | ((current: Preferences) => Preferences)) => {
      const current = loadPreferences();
      const next =
        typeof updater === "function"
          ? (updater as (p: Preferences) => Preferences)(current)
          : updater;
      savePreferences(next);
      syncPreferencesToUrl(next);
      setPrefs(next);
      window.dispatchEvent(new CustomEvent(PREFS_EVENT));
    },
    [],
  );

  return [prefs, update] as const;
}
