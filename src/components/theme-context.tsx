"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type PulseTheme = "dark" | "light";

const STORAGE_KEY = "pulse-theme";

type ThemeContextValue = {
  theme: PulseTheme;
  setTheme: (t: PulseTheme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): PulseTheme | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "light" || raw === "dark" ? raw : null;
  } catch {
    return null;
  }
}

function applyDomTheme(theme: PulseTheme) {
  const root = document.documentElement;
  if (theme === "light") root.setAttribute("data-theme", "light");
  else root.removeAttribute("data-theme");
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* quota / private mode */
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<PulseTheme>(() => {
    if (typeof document === "undefined") return "dark";
    return document.documentElement.getAttribute("data-theme") === "light"
      ? "light"
      : "dark";
  });

  useEffect(() => {
    const stored = readStoredTheme();
    if (stored) {
      applyDomTheme(stored);
      setThemeState(stored);
    }
  }, []);

  const setTheme = useCallback((t: PulseTheme) => {
    applyDomTheme(t);
    setThemeState(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      applyDomTheme(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function usePulseTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("usePulseTheme must be used within ThemeProvider");
  }
  return ctx;
}
