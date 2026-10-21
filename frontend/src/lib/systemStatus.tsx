import { createContext, useContext, useEffect, useState } from "react";

import { api, type VersionInfo } from "./api";

export type Health = "unknown" | "ok" | "degraded" | "down";

interface SystemStatus {
  health: Health;
  version: VersionInfo | null;
}

const StatusContext = createContext<SystemStatus>({ health: "unknown", version: null });

/* One poll for the whole page. The nav lamp, the hero badge and the footer all
 * show some slice of this, and three components polling the same endpoint on
 * three timers would triple the requests for no extra information.
 *
 * Health is green when every breaker is closed, amber when one has tripped, and
 * red when the API cannot be reached -- real state, so someone reading the home
 * page can see the cluster is unhappy without navigating anywhere. */
export function SystemStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SystemStatus>({ health: "unknown", version: null });

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const { breakers } = await api.breakers();
        if (cancelled) return;
        const health: Health = breakers.some((b) => b.state !== "closed") ? "degraded" : "ok";
        setStatus((s) => ({ ...s, health }));
      } catch {
        if (!cancelled) setStatus((s) => ({ ...s, health: "down" }));
      }
    };

    // The serving version only changes on a deploy, which replaces this page's
    // pods anyway. Once per load is enough.
    api
      .version()
      .then((version) => {
        if (!cancelled) setStatus((s) => ({ ...s, version }));
      })
      .catch(() => {
        /* Decoration. It must never surface an error. */
      });

    void check();
    const timer = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return <StatusContext.Provider value={status}>{children}</StatusContext.Provider>;
}

export function useSystemStatus(): SystemStatus {
  return useContext(StatusContext);
}

export function ledClass(health: Health): string {
  if (health === "degraded") return "led led--warn";
  if (health === "down") return "led led--down";
  if (health === "ok") return "led led--on";
  return "led";
}
