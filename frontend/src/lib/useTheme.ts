import { useEffect, useState } from "react";

/* Labels say what the theme does before they say what it is called. A control
   labelled "Folio" tells a first-time visitor nothing; "Dark" does.
   `swatch` is the pair of colours shown beside each option in the theme menu,
   so a visitor can see a theme before choosing it. */
export const THEMES = [
  { id: "dark", label: "Dark", hint: "Midnight navy, blue to cyan", swatch: ["#070e1a", "#2ad4d0"] },
  { id: "light", label: "Light", hint: "Clean white, deep blue", swatch: ["#f7f9fc", "#136cd6"] },
  { id: "warm", label: "Warm", hint: "Walnut and gold", swatch: ["#14100d", "#c9a227"] },
  { id: "oxblood", label: "Dark red", hint: "Deep red leather", swatch: ["#17100f", "#c4553d"] },
  { id: "ghibli", label: "Ghibli", hint: "Meadow green and warm sky", swatch: ["#cfe6ee", "#4f8a5b"] },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const STORAGE_KEY = "cb-theme";

/* Ids from before the redesign. The old default was written to storage on
   every first visit, so without this map every returning visitor would be
   pinned to whatever "folio" now resolves to instead of the new default.
   index.html carries the same map for the pre-paint script. */
const LEGACY: Record<string, ThemeId> = {
  folio: "dark",
  vellum: "light",
  blueprint: "dark",
};

function isTheme(value: string): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

function initialTheme(): ThemeId {
  if (typeof window === "undefined") return "dark";

  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be blocked outright; fall through to the OS preference.
  }
  if (stored) {
    const mapped = LEGACY[stored] ?? stored;
    if (isTheme(mapped)) return mapped;
  }

  // Respect an explicit OS preference for light, but default everything else
  // to Dark -- the dark binding is the intended presentation.
  const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches;
  return prefersLight ? "light" : "dark";
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeId>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;

    // Mobile browsers tint their toolbar with this. Left static, a light theme
    // sits under a dark toolbar and the page looks cut off at the top.
    const background = THEMES.find((t) => t.id === theme)?.swatch[0];
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", background ?? "#070e1a");

    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private browsing can reject writes. A theme that fails to persist is
      // not worth breaking the page over.
    }
  }, [theme]);

  return { theme, setTheme };
}
