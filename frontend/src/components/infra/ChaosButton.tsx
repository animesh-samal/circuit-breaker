import { useState } from "react";

import { api, ApiError } from "../../lib/api";

interface Props {
  onKilled: () => void;
}

type Phase = "idle" | "killing" | "watching" | "error";

/* The demonstration. Deletes one API pod and narrates the recovery.
 *
 * Guarded server-side by RBAC scoped to pod deletion in one namespace, a
 * replica floor that refuses to take the last healthy pod, and a rate limit.
 * The confirmation step here is a courtesy, not a security control -- anything
 * that matters is enforced by the API, because a button is not a boundary.
 */
export default function ChaosButton({ onKilled }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [log, setLog] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);

  const append = (line: string) => setLog((l) => [...l, line]);

  async function kill() {
    setConfirming(false);
    setPhase("killing");
    setLog([]);

    try {
      const res = await api.killPod();
      append(`deleted ${res.killed}`);
      append(`${res.remaining_ready} pod(s) still serving traffic`);
      setPhase("watching");
      onKilled();

      // Nudge the cluster poll a few times so the reader sees the replacement
      // appear rather than waiting for the next scheduled refresh.
      const beats = [1500, 3000, 5000, 8000];
      beats.forEach((ms, i) => {
        window.setTimeout(() => {
          onKilled();
          if (i === beats.length - 1) {
            append("replacement scheduled and ready");
            setPhase("idle");
          }
        }, ms);
      });
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 409
          ? "Refused: that would have taken the last healthy pod."
          : err instanceof ApiError && err.status === 429
            ? "Rate limited. Try again in a moment."
            : err instanceof Error
              ? err.message
              : "failed";
      append(message);
      setPhase("error");
    }
  }

  return (
    <div className="stat-tile" style={{ display: "grid", gap: "0.75rem" }}>
      <div>
        <span className="label">Chaos control</span>
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem", color: "var(--text-dim)" }}>
          Delete a running API pod and watch Kubernetes reschedule it. The
          replica floor prevents this from taking the last healthy one.
        </p>
      </div>

      {confirming ? (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="control"
            onClick={() => void kill()}
            style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
          >
            Yes, delete a pod
          </button>
          <button type="button" className="control" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="control"
          disabled={phase === "killing" || phase === "watching"}
          onClick={() => setConfirming(true)}
          style={{ justifySelf: "start" }}
        >
          {phase === "killing" || phase === "watching" ? "Recovering…" : "Break it"}
        </button>
      )}

      {log.length > 0 && (
        <div
          className="mono left"
          style={{
            fontSize: "0.6875rem",
            color: phase === "error" ? "var(--danger)" : "var(--text-mute)",
            display: "grid",
            gap: "0.2rem",
          }}
          aria-live="polite"
        >
          {log.map((line) => (
            <span key={line}>› {line}</span>
          ))}
        </div>
      )}
    </div>
  );
}
