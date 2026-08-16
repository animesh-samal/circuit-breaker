/* API client.
 *
 * Every request is same-origin and relative. In development Vite proxies /api
 * to localhost:8000; in production nginx routes /api to the backend Service.
 * The frontend therefore never holds a backend hostname, and CORS never enters
 * the picture -- which is one fewer thing to misconfigure at 2am.
 *
 * Every infrastructure response arrives wrapped in an envelope carrying the
 * provenance of the data. The UI reads `source` and `degraded` and says so
 * plainly rather than presenting stale numbers as current.
 */

export interface Envelope<T> {
  data: T;
  source: "live" | "cache" | "stale" | "mock";
  degraded: boolean;
  age_seconds: number;
  breaker_state: "closed" | "open" | "half_open";
  error: string | null;
  mock: boolean;
}

export interface ContainerInfo {
  name: string;
  image: string;
  ready: boolean;
  restart_count: number;
  state: string;
}

export interface PodInfo {
  name: string;
  phase: string;
  ready: boolean;
  node: string | null;
  pod_ip: string | null;
  started_at: string | null;
  age_seconds: number;
  restart_count: number;
  containers: ContainerInfo[];
}

export interface DeploymentInfo {
  name: string;
  desired: number;
  ready: number;
  available: number;
  updated: number;
  image: string | null;
}

export interface ClusterSnapshot {
  namespace: string;
  pods: PodInfo[];
  deployments: DeploymentInfo[];
  observed_at: string;
}

export interface MetricSeries {
  label: string;
  unit: string;
  timestamps: string[];
  values: number[];
}

export interface CostBreakdown {
  month_to_date: number;
  currency: string;
  by_service: Record<string, number>;
  period_start: string;
  period_end: string;
  forecast: number | null;
}

export interface DeployRecord {
  deploy_id: string;
  git_sha: string;
  git_tag: string;
  actor: string;
  started_at: string;
  duration_seconds: number;
  status: string;
  environment: string;
}

export interface BreakerStats {
  name: string;
  state: "closed" | "open" | "half_open";
  consecutive_failures: number;
  total_failures: number;
  total_successes: number;
  total_rejections: number;
  opened_at: number | null;
  last_error: string | null;
}

export interface VersionInfo {
  app: string;
  environment: string;
  git_sha: string;
  git_tag: string;
  build_time: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/* An explicit timeout on every call. Without one, a hung upstream leaves the
 * UI spinning forever -- the browser's default is minutes. AbortController is
 * the only way to bound a fetch. */
async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`/api${path}`, {
      ...init,
      signal: controller.signal,
      headers: { Accept: "application/json", ...init.headers },
    });

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        detail = body.detail ?? detail;
      } catch {
        /* body was not JSON; the status text will do */
      }
      throw new ApiError(detail, res.status);
    }

    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("request timed out", 408);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  version: () => request<VersionInfo>("/version"),
  cluster: () => request<Envelope<ClusterSnapshot>>("/cluster"),
  metrics: () => request<Envelope<MetricSeries[]>>("/metrics"),
  cost: () => request<Envelope<CostBreakdown>>("/cost"),
  deploys: () => request<Envelope<DeployRecord[]>>("/deploys"),
  breakers: () => request<{ breakers: BreakerStats[] }>("/breakers"),
  killPod: () =>
    request<{ killed: string; message: string; remaining_ready: number }>(
      "/chaos/kill-pod",
      { method: "POST" },
      15000,
    ),
};
