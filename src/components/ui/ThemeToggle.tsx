// src/components/ui/ThemeToggle.tsx
import { useEffect, useState } from "react";
import { toggleTheme } from "../../lib/theme";


export default function ThemeToggle() {
  const [isDark, setIsDark] = useState<boolean>(false);

  useEffect(() => {
    // reflect current html state on mount
    setIsDark(document.documentElement.classList.contains("dark"));
    // keep in sync across tabs
    const onStorage = (e: StorageEvent) => {
      if (e.key === "theme") {
        setIsDark(document.documentElement.classList.contains("dark"));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <button
      type="button"
      onClick={() => setIsDark(toggleTheme() === "dark")}
      className="rounded-full border px-3 py-1 text-xs bg-white/70 border-gray-300 text-gray-700
                 dark:bg-white/10 dark:text-gray-200 dark:border-gray-700"
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      {isDark ? "Dark" : "Light"}
    </button>
  );
}
