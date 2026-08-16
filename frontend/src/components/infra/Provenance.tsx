import type { Envelope } from "../../lib/api";

/* Every panel states where its data came from. Stale numbers presented as
 * current are worse than an error, because they remove the reader's ability to
 * tell that anything is wrong. */
export default function Provenance({ env }: { env: Envelope<unknown> | null }) {
  if (!env) return null;

  const tone = env.mock
    ? "var(--warn)"
    : env.degraded
      ? "var(--warn)"
      : "var(--ok)";

  const text = env.mock
    ? "mock data"
    : env.source === "live"
      ? "live"
      : env.source === "cache"
        ? `cached ${Math.round(env.age_seconds)}s`
        : `stale ${Math.round(env.age_seconds)}s · breaker ${env.breaker_state}`;

  return (
    <span
      className="mono"
      style={{ fontSize: "0.625rem", color: tone, display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: tone,
          display: "inline-block",
        }}
      />
      {text}
    </span>
  );
}
