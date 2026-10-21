import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { ledClass, useSystemStatus } from "../lib/systemStatus";
import type { ThemeId } from "../lib/useTheme";
import Icon from "./Icons";
import ThemeMenu from "./ThemeMenu";

/* Section links point into the one-page home; route links leave it. Both live
 * in one list so the bar reads in page order rather than grouped by type. */
type Item = { label: string; section: string } | { label: string; route: string };

const ITEMS: Item[] = [
  { label: "About", section: "about" },
  { label: "Experience", section: "experience" },
  { label: "Skills", section: "skills" },
  { label: "Projects", section: "projects" },
  { label: "Infrastructure", route: "/infrastructure" },
  { label: "Writing", route: "/blog" },
  { label: "Contact", section: "contact" },
];

// "home" and "writing" are watched too, so the highlight clears over the hero
// and the writing teaser instead of sticking to whichever link was last.
const WATCHED = ["home", "about", "experience", "skills", "projects", "writing", "contact"];

/* Which home section sits under the reading line. The root margin shrinks the
 * viewport to a thin band 40% of the way down, so exactly one section crosses
 * it at a time -- a plain "is it visible" check would light two links whenever
 * a boundary is on screen. */
function useActiveSection(enabled: boolean): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setActive(null);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    for (const id of WATCHED) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [enabled]);

  return active;
}

export default function Nav({ theme, setTheme }: { theme: ThemeId; setTheme: (t: ThemeId) => void }) {
  const { pathname, key } = useLocation();
  const { health } = useSystemStatus();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const activeSection = useActiveSection(pathname === "/");

  // Any navigation closes the phone menu, including back/forward.
  useEffect(() => setOpen(false), [key]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // The bar is borderless over the hero and picks up a hairline once content
  // scrolls under it. Passive, and it only sets state when the answer flips.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`site-header${scrolled || open ? " is-scrolled" : ""}`}>
      <nav className="container nav-bar" aria-label="Main">
        <Link to="/#home" className="brand">
          <span className="brand-mark" aria-hidden="true">
            AS
          </span>
          <span className="brand-name">Animesh Samal</span>
        </Link>

        <ul id="nav-links" className={`nav-links${open ? " is-open" : ""}`}>
          {ITEMS.map((item) => {
            const isRoute = "route" in item;
            const to = isRoute ? item.route : `/#${item.section}`;
            const active = isRoute ? pathname.startsWith(item.route) : activeSection === item.section;
            return (
              <li key={item.label}>
                <Link
                  to={to}
                  className={`nav-link${active ? " is-active" : ""}`}
                  aria-current={active ? (isRoute ? "page" : "location") : undefined}
                >
                  {/* The lamp carries real state: green when every breaker is
                      closed, amber when one has tripped, red when the API is
                      unreachable. */}
                  {isRoute && item.route === "/infrastructure" && (
                    <span className={ledClass(health)} aria-hidden="true" />
                  )}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="nav-actions">
          <ThemeMenu theme={theme} setTheme={setTheme} />
          <button
            type="button"
            className="pill-btn menu-btn"
            aria-expanded={open}
            aria-controls="nav-links"
            aria-label={open ? "Close navigation" : "Open navigation"}
            onClick={() => setOpen((o) => !o)}
          >
            <Icon name={open ? "close" : "menu"} />
          </button>
        </div>
      </nav>
    </header>
  );
}
