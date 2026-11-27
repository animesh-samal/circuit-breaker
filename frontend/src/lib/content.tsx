import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { DEFAULT_CONTENT, mergeContent, type SiteContent } from "../content/site";

/* The content the pages show.
 *
 * The site ships with its words built in (DEFAULT_CONTENT), so it works with no
 * API at all. This provider asks the API for a saved document once, when the
 * page opens, and lays it over the built-in one. Three things follow from that:
 *
 *   - Nothing waits. The first paint uses what is already here, so a slow or
 *     failing API never shows a blank page or a spinner.
 *   - A returning visitor sees the last saved content immediately. The previous
 *     answer is kept in localStorage and used for the first paint, then replaced
 *     by whatever the API says now. Without it, every visit to an edited site
 *     would flash the old words first.
 *   - If the API has nothing saved (or the request fails and there is no kept
 *     copy), the built-in content stands. An answer of "nothing saved" also
 *     clears the kept copy, so deleting content really does take it down.
 */

const CACHE_KEY = "cb-content";
const TIMEOUT_MS = 6000;

const ContentContext = createContext<SiteContent>(DEFAULT_CONTENT);

function readKept(): unknown {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function keep(document: unknown): void {
  try {
    if (document) window.localStorage.setItem(CACHE_KEY, JSON.stringify(document));
    else window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // Private windows and full storage throw. The site works without it.
  }
}

export function ContentProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<SiteContent>(() => mergeContent(DEFAULT_CONTENT, readKept()));

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

    fetch("/api/content", { signal: controller.signal, headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { content?: unknown; source?: string } | null) => {
        // An unavailable store says nothing about what is saved, so leave
        // whatever is already showing alone instead of resetting it.
        if (!body || body.source === "unavailable") return;
        keep(body.content ?? null);
        setContent(mergeContent(DEFAULT_CONTENT, body.content ?? null));
      })
      .catch(() => undefined)
      .finally(() => window.clearTimeout(timer));

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);

  return <ContentContext.Provider value={content}>{children}</ContentContext.Provider>;
}

export function useContent(): SiteContent {
  return useContext(ContentContext);
}
