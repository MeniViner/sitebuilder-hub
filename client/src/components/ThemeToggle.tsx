import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "sitebuilder-hub-theme";

type Theme = "light" | "dark";

const getInitialTheme = (): Theme => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const onThemeChange = (event: Event) => {
      const next = (event as CustomEvent<Theme>).detail;
      if (next === "light" || next === "dark") setTheme(next);
    };
    window.addEventListener("sitebuilder-hub-theme-change", onThemeChange);
    return () => window.removeEventListener("sitebuilder-hub-theme-change", onThemeChange);
  }, []);

  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={() => setTheme(nextTheme)}
      aria-label={nextTheme === "dark" ? "מעבר למצב כהה" : "מעבר למצב בהיר"}
      title={nextTheme === "dark" ? "מצב כהה" : "מצב בהיר"}
    >
      <span className={`theme-toggle-icon theme-toggle-sun ${theme === "light" ? "is-visible" : ""}`} aria-hidden="true"><Sun size={17} /></span>
      <span className={`theme-toggle-icon theme-toggle-moon ${theme === "dark" ? "is-visible" : ""}`} aria-hidden="true"><Moon size={17} /></span>
      <span className="theme-toggle-label">{theme === "dark" ? "כהה" : "בהיר"}</span>
    </button>
  );
}
