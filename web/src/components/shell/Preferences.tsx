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

/**
 * Nothing here is persisted. Every load starts dark and comfortable; the
 * header controls only change the current page until the next navigation
 * reload. The root layout renders the same attributes on `<html>` so the
 * server markup, the first paint and the first client render all agree.
 */
export const DEFAULT_THEME: Theme = "dark";
export const DEFAULT_DENSITY: Density = "comfortable";

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [density, setDensityState] = useState<Density>(DEFAULT_DENSITY);

  // Re-assert the defaults after hydration so the document can never disagree
  // with the provider, whatever the browser restored or hydration patched.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", DEFAULT_THEME);
    document.documentElement.setAttribute("data-density", DEFAULT_DENSITY);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    document.documentElement.setAttribute("data-theme", next);
  }, []);

  const setDensity = useCallback((next: Density) => {
    setDensityState(next);
    document.documentElement.setAttribute("data-density", next);
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

/** Runs before first paint. It pins the dark theme on the document and marks
 *  it as script-capable (`html.js`); reveal start states are scoped to that
 *  class so a reader without script sees every heading immediately. */
export const PREFERENCES_BOOTSTRAP = `(function(){var h=document.documentElement;h.classList.add("js");h.setAttribute("data-theme","${DEFAULT_THEME}");h.setAttribute("data-density","${DEFAULT_DENSITY}");})();`;
