import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "sitebuilder-hub-theme";
type Theme = "light" | "dark";

const getInitialTheme = (): Theme => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export function LegacyThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

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
    <button className="btn btn-secondary" type="button" onClick={() => setTheme(nextTheme)} aria-label="החלפת ערכת צבע">
      {theme === "dark" ? <Moon size={15} /> : <Sun size={15} />}
      {theme === "dark" ? "כהה" : "בהיר"}
    </button>
  );
}
