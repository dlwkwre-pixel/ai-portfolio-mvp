"use client";

import { createContext, useContext, useEffect } from "react";

// Sage refresh (2026-07-18): dark mode was removed by design — the app ships
// light-only. The provider survives as a no-op shell so existing useTheme()
// consumers keep compiling; ThemeToggle renders nothing. The effect scrubs any
// stale data-theme attribute / stored preference left from the dark-mode era.
type ThemeContextType = {
  theme: "light";
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.removeAttribute("data-theme");
    try { localStorage.removeItem("bt-theme"); } catch { /* ignore */ }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: "light", toggleTheme: () => {} }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Kept as an export so old call sites compile; intentionally renders nothing.
export function ThemeToggle(_props: { className?: string }) {
  return null;
}
