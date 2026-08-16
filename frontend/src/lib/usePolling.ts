import { useCallback, useEffect, useRef, useState } from "react";

interface PollState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
}

/* Polling with two properties worth having:
 *
 *   1. It stops while the tab is hidden. A console left open in a background
 *      tab would otherwise poll the Kubernetes API every few seconds forever,
 *      for nobody. Cheap on our side, and the same habit avoids real money on
 *      metered APIs.
 *   2. The first failure does not blank the screen. Existing data is kept and
 *      the error is reported alongside it, which is the whole point of a
 *      console -- the last known state is more useful than an empty panel.
 */
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Held in a ref so a caller passing an inline arrow does not restart the
  // interval on every render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const mounted = useRef(true);

  const run = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      if (!mounted.current) return;
      setData(result);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : "request failed");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void run();

    let timer = window.setInterval(run, intervalMs);

    const onVisibility = () => {
      window.clearInterval(timer);
      if (document.visibilityState === "visible") {
        void run();
        timer = window.setInterval(run, intervalMs);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [run, intervalMs]);

  return { data, error, loading, refresh: run };
}
