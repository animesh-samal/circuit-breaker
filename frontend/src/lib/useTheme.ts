import { useEffect, useState } from "react";

/* Labels say what the theme does before they say what it is called. A control
   labelled "Folio" tells a first-time visitor nothing; "Dark" does. */
export const THEMES = [
  { id: "folio", label: "Dark", hint: "Warm ink and walnut" },
  { id: "vellum", label: "Light", hint: "Aged paper, ink brown" },
  { id: "blueprint", label: "Dark blue", hint: "Navy and cyan" },
  { id: "oxblood", label: "Dark red", hint: "Deep red leather" },
  { id: "ghibli", label: "Ghibli", hint: "Meadow green and warm sky" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const STORAGE_KEY = "cb-theme";

function initialTheme(): ThemeId {
  if (typeof window === "undefined") return "folio";

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && THEMES.some((t) => t.id === stored)) return stored as ThemeId;

  // Respect an explicit OS preference for light, but default everything else
  // to Folio -- the dark binding is the intended presentation.
  const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches;
  return prefersLight ? "vellum" : "folio";
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeId>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private browsing can reject writes. A theme that fails to persist is
      // not worth breaking the page over.
    }
  }, [theme]);

  return { theme, setTheme };
}
