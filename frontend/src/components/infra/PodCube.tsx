import type { PodInfo } from "../../lib/api";

type PodState = "ready" | "pending" | "restarting" | "failed";

const TONE: Record<PodState, { edge: string; fill: string; glow: string; label: string }> = {
  ready: {
    edge: "var(--ok)",
    fill: "color-mix(in srgb, var(--ok) 16%, transparent)",
    glow: "color-mix(in srgb, var(--ok) 45%, transparent)",
    label: "Running",
  },
  pending: {
    edge: "var(--warn)",
    fill: "color-mix(in srgb, var(--warn) 16%, transparent)",
    glow: "color-mix(in srgb, var(--warn) 45%, transparent)",
    label: "Pending",
  },
  restarting: {
    edge: "var(--warn)",
    fill: "color-mix(in srgb, var(--warn) 22%, transparent)",
    glow: "color-mix(in srgb, var(--warn) 60%, transparent)",
    label: "Restarting",
  },
  failed: {
    edge: "var(--danger)",
    fill: "color-mix(in srgb, var(--danger) 18%, transparent)",
    glow: "color-mix(in srgb, var(--danger) 55%, transparent)",
    label: "Failed",
  },
};

/* Phase and readiness are different things. A pod can report Running while its
 * readiness probe fails -- exactly the state a dependency outage produces -- so
 * "Running" alone is not enough to colour it green. */
export function podState(pod: PodInfo): PodState {
  if (pod.phase === "Failed" || pod.phase === "Unknown") return "failed";
  if (pod.containers.some((c) => c.state === "CrashLoopBackOff" || c.state === "ImagePullBackOff")) {
    return "failed";
  }
  if (pod.phase === "Pending" || pod.phase === "ContainerCreating") return "pending";
  if (!pod.ready) return "restarting";
  return "ready";
}

function shortAge(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

export default function PodCube({ pod }: { pod: PodInfo }) {
  const state = podState(pod);
  const tone = TONE[state];
  const suffix = pod.name.split("-").slice(-2).join("-");

  return (
    <div
      className="pod-tile"
      title={`${pod.name}\n${pod.phase} · ${pod.containers[0]?.image ?? "no image"}\nnode ${pod.node ?? "unscheduled"}`}
    >
      <div
        className="pod-scene"
        style={
          {
            "--pod-edge": tone.edge,
            "--pod-fill": tone.fill,
            "--pod-glow": tone.glow,
            position: "relative",
            width: 44,
            height: 44,
          } as React.CSSProperties
        }
      >
        <span className="pod-halo" aria-hidden="true" />
        <div className="pod-cube" data-state={state}>
          <span className="pod-face pod-f" />
          <span className="pod-face pod-b" />
          <span className="pod-face pod-r" />
          <span className="pod-face pod-l" />
          <span className="pod-face pod-u" />
          <span className="pod-face pod-d" />
        </div>
      </div>

      <div style={{ textAlign: "center", lineHeight: 1.35 }}>
        <div className="mono" style={{ fontSize: "0.6875rem", color: "var(--text-dim)" }}>
          {suffix}
        </div>
        <div className="mono" style={{ fontSize: "0.625rem", color: tone.edge }}>
          {tone.label}
        </div>
        <div className="mono" style={{ fontSize: "0.625rem", color: "var(--text-mute)" }}>
          {shortAge(pod.age_seconds)}
          {pod.restart_count > 0 ? ` · ${pod.restart_count}↻` : ""}
        </div>
      </div>
    </div>
  );
}
