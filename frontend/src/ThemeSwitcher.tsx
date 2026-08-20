import { useEffect, useState } from "react";
import { applyTheme, getStoredTheme, setStoredTheme, THEMES, type ThemeId } from "./theme";

export function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeId>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function choose(id: ThemeId) {
    setTheme(id);
    setStoredTheme(id);
  }

  return (
    <div role="group" aria-label="Theme" className="theme-switcher">
      {THEMES.map((t) => (
        <button
          key={t.id}
          aria-pressed={theme === t.id}
          className="theme-switcher__option"
          onClick={() => choose(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
