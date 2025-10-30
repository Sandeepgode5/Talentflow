// src/hooks/useDarkMode.ts
import { useEffect, useState } from "react";

const STORAGE_KEY = "ui:theme"; // "light" | "dark"

function getInitial(): "light" | "dark" {
  const saved = localStorage.getItem(STORAGE_KEY) as "light" | "dark" | null;
  if (saved === "light" || saved === "dark") return saved;
  // Fall back to system preference
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function useDarkMode() {
  const [theme, setTheme] = useState<"light" | "dark">(getInitial);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return { theme, toggle, setTheme };
}
