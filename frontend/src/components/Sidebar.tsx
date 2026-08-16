import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

import { api } from "../lib/api";
import Icon, { type IconName } from "./Icons";

const LINKS: Array<{ to: string; label: string; icon: IconName; end?: boolean }> = [
  { to: "/", label: "Home", icon: "home", end: true },
  { to: "/about", label: "About", icon: "user" },
  { to: "/experience", label: "Experience", icon: "briefcase" },
  { to: "/infrastructure", label: "Infrastructure", icon: "server" },
  { to: "/terminal", label: "Terminal", icon: "terminal" },
  { to: "/blog", label: "Writing", icon: "book" },
  { to: "/contact", label: "Contact", icon: "mail" },
];

type Health = "unknown" | "ok" | "degraded" | "down";

/* The Infrastructure lamp carries real state rather than merely echoing which
 * page is open: green when every breaker is closed, amber when one has tripped,
 * red when the API cannot be reached. Someone reading the About page can
 * therefore see the cluster is unhappy without navigating anywhere. */
function useSystemHealth(): Health {
  const [health, setHealth] = useState<Health>("unknown");

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const { breakers } = await api.breakers();
        if (cancelled) return;
        setHealth(breakers.some((b) => b.state !== "closed") ? "degraded" : "ok");
      } catch {
        if (!cancelled) setHealth("down");
      }
    };

    void check();
    const timer = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return health;
}

function ledClass(to: string, health: Health): string {
  if (to !== "/infrastructure") return "led";
  if (health === "degraded") return "led led--warn";
  if (health === "down") return "led led--down";
  if (health === "ok") return "led led--on";
  return "led";
}

export default function Sidebar() {
  const health = useSystemHealth();

  return (
    <aside className="sidebar">
      <div
        className="sidebar-head"
        style={{
          paddingBottom: "0.85rem",
          marginBottom: "0.85rem",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span className="label">Navigation</span>
      </div>

      <nav aria-label="Main">
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.15rem" }}>
          {LINKS.map((l) => (
            <li key={l.to}>
              <NavLink
                to={l.to}
                end={l.end}
                className={({ isActive }) => `nav-item${isActive ? " is-active" : ""}`}
              >
                <span className={ledClass(l.to, health)} aria-hidden="true" />
                <Icon name={l.icon} />
                {l.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
