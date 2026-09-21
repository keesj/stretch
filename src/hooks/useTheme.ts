import { useEffect, useCallback, useRef } from "react";
import { type Settings } from "../utils/storage";

export function useTheme(settings: Settings) {
  const themeRef = useRef(settings.theme);
  themeRef.current = settings.theme;

  const applyTheme = useCallback((theme: "light" | "dark" | "system") => {
    try {
      const root = document.documentElement;
      
      if (theme === "system") {
        try {
          const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
          root.classList.toggle("dark", prefersDark);
        } catch {
          root.classList.toggle("dark", false);
        }
      } else {
        root.classList.toggle("dark", theme === "dark");
      }
    } catch {
      // DOM access failed — theme silently fails
    }
  }, []);

  useEffect(() => {
    applyTheme(settings.theme);
  }, [applyTheme, settings.theme]);

  useEffect(() => {
    try {
      const handleDarkMode = () => {
        applyTheme(themeRef.current);
      };
      
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", handleDarkMode);
      }
      
      return () => {
        if (typeof mediaQuery.removeEventListener === "function") {
          mediaQuery.removeEventListener("change", handleDarkMode);
        }
      };
    } catch {
      // matchMedia not supported — no dynamic theme updates
    }
  }, [applyTheme]);
}