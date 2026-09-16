"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark";
export type Density = "comfortable" | "compact";

interface PreferencesValue {
  theme: Theme;
  density: Density;
  setTheme: (theme: Theme) => void;
  setDensity: (density: Density) => void;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

export const THEME_KEY = "sc-theme";
export const DENSITY_KEY = "sc-density";

/**
 * Both preferences are already on the document element before React mounts,
 * written by the inline script in the root layout. Reading them back here keeps
 * the first client render identical to the server render.
 */
function readAttribute<T extends string>(name: string, fallback: T): T {
  if (typeof document === "undefined") return fallback;
  const value = document.documentElement.getAttribute(name);
  return (value as T) || fallback;
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [density, setDensityState] = useState<Density>("comfortable");

  useEffect(() => {
    setThemeState(readAttribute<Theme>("data-theme", "dark"));
    setDensityState(readAttribute<Density>("data-density", "comfortable"));
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // A viewer with site data blocked still gets the preference for this
      // session; only persistence is lost.
    }
  }, []);

  const setDensity = useCallback((next: Density) => {
    setDensityState(next);
    document.documentElement.setAttribute("data-density", next);
    try {
      window.localStorage.setItem(DENSITY_KEY, next);
    } catch {
      // See above.
    }
  }, []);

  return (
    <PreferencesContext.Provider value={{ theme, density, setTheme, setDensity }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesValue {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error("usePreferences must be used inside PreferencesProvider");
  }
  return context;
}

/** Runs before first paint so the theme never flashes. It also marks the
 *  document as script-capable (`html.js`); reveal start states are scoped to
 *  that class so a reader without script sees every heading immediately. */
export const PREFERENCES_BOOTSTRAP = `(function(){document.documentElement.classList.add("js");try{document.documentElement.setAttribute("data-theme","dark");var d=localStorage.getItem("${DENSITY_KEY}")||"comfortable";document.documentElement.setAttribute("data-density",d);}catch(e){document.documentElement.setAttribute("data-theme","dark");document.documentElement.setAttribute("data-density","comfortable");}})();`;
