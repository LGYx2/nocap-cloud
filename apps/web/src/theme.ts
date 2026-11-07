import { useState } from "react";

export type Theme = "system" | "light" | "dark";

const KEY = "nocap-theme";

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

/** The panel theme. public/theme.js applies the same saved value before the first paint. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(readTheme);

  function setTheme(next: Theme) {
    setThemeState(next);
    const root = document.documentElement;
    if (next === "system") delete root.dataset.theme;
    else root.dataset.theme = next;
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // Storage can be blocked; the choice still applies until the page reloads.
    }
  }

  return [theme, setTheme];
}
