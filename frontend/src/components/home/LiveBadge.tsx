import { Link } from "react-router-dom";

import { ledClass, useSystemStatus, type Health } from "../../lib/systemStatus";

const BADGE: Record<Health, { title: string; detail: string }> = {
  ok: { title: "All systems normal", detail: "live from Kubernetes" },
  degraded: { title: "Running degraded", detail: "a circuit breaker is open" },
  down: { title: "Console unreachable", detail: "the API is not answering" },
  unknown: { title: "Checking the cluster", detail: "one moment" },
};

/* A small badge that reports the real state of the cluster, the same signal as
 * the lamp in the nav. If the API is down it says so -- a portfolio about honest
 * telemetry cannot fake its own. It links to the live console. */
export default function LiveBadge() {
  const { health, version } = useSystemStatus();
  const badge = BADGE[health];
  // A local build has no tag to report; "serving unknown" would read as a fault.
  const tag = version && version.git_tag !== "unknown" ? version.git_tag : null;
  const detail = health === "ok" && tag ? `serving ${tag}` : badge.detail;

  return (
    <Link to="/infrastructure" className="live-badge">
      <span className={ledClass(health)} aria-hidden="true" />
      <span>
        <strong>{badge.title}</strong>
        <span className="mono">{detail}</span>
      </span>
    </Link>
  );
}
