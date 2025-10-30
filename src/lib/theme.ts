// src/lib/theme.ts
type Theme = "light" | "dark";
const KEY = "theme";

export function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark") return stored as Theme;
  } catch {}
  // fall back to system
  return window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement; // <html>
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  // Helps form controls/scrollbars match
  root.style.colorScheme = theme;
}

export function setTheme(theme: Theme) {
  try { localStorage.setItem(KEY, theme); } catch {}
  applyTheme(theme);
}

export function toggleTheme(): Theme {
  const next: Theme = document.documentElement.classList.contains("dark")
    ? "light"
    : "dark";
  setTheme(next);
  return next;
}
