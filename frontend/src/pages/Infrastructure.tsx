import { api } from "../lib/api";
import { usePolling } from "../lib/usePolling";
import ChaosButton from "../components/infra/ChaosButton";
import PodCube from "../components/infra/PodCube";
import Provenance from "../components/infra/Provenance";
import Sparkline from "../components/infra/Sparkline";

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: "2rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "1rem",
          marginBottom: "0.9rem",
        }}
      >
        <h2 style={{ fontSize: "1.25rem" }}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default function Infrastructure() {
  const cluster = usePolling(api.cluster, 5000);
  const metrics = usePolling(api.metrics, 60_000);
  const cost = usePolling(api.cost, 300_000);
  const deploys = usePolling(api.deploys, 60_000);
  const breakers = usePolling(api.breakers, 15_000);

  const snapshot = cluster.data?.data;
  const deployments = snapshot?.deployments ?? [];
  const pods = snapshot?.pods ?? [];

  return (
    <div>
      <h1>Infrastructure</h1>
      <p className="prose" style={{ marginBottom: "2rem" }}>
        Everything below is read from the running system when you load this page
        &mdash; the Kubernetes API for pods, CloudWatch for metrics, Cost
        Explorer for spend. Nothing here is a screenshot.
      </p>

      {/* ---- cluster ---- */}
      <Section title="Cluster" aside={<Provenance env={cluster.data} />}>
        <div className="holo-panel" style={{ padding: "1.25rem" }}>
          {cluster.error && !snapshot && (
            <p className="mono" style={{ fontSize: "0.8125rem", color: "var(--danger)", margin: 0 }}>
              cluster unreachable — {cluster.error}
            </p>
          )}

          {cluster.loading && !snapshot && (
            <p className="mono" style={{ fontSize: "0.8125rem", color: "var(--text-mute)", margin: 0 }}>
              connecting…
            </p>
          )}

          {deployments.map((dep) => {
            const own = pods.filter((p) => p.name.startsWith(dep.name));
            return (
              <div
                key={dep.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                  flexWrap: "wrap",
                  padding: "0.75rem 0",
                  borderTop: "1px solid var(--border)",
                }}
              >
                <div style={{ minWidth: 168 }}>
                  <div className="mono" style={{ fontSize: "0.8125rem", color: "var(--text)" }}>
                    {dep.name}
                  </div>
                  <div className="mono" style={{ fontSize: "0.6875rem", color: "var(--text-mute)" }}>
                    {dep.ready}/{dep.desired} ready
                  </div>
                </div>

                <svg className="flow-line" preserveAspectRatio="none" aria-hidden="true">
                  <line x1="0" y1="1" x2="100%" y2="1" />
                </svg>

                <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                  {own.length === 0 ? (
                    <span className="mono" style={{ fontSize: "0.6875rem", color: "var(--text-mute)" }}>
                      no pods
                    </span>
                  ) : (
                    own.map((p) => <PodCube key={p.name} pod={p} />)
                  )}
                </div>
              </div>
            );
          })}

          {snapshot && (
            <p
              className="mono"
              style={{ fontSize: "0.6875rem", color: "var(--text-mute)", margin: "0.75rem 0 0" }}
            >
              namespace {snapshot.namespace} · {pods.length} pods · node{" "}
              {pods[0]?.node ?? "—"}
            </p>
          )}
        </div>
      </Section>

      {/* ---- chaos + breakers ---- */}
      <Section title="Resilience" aside={null}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "1rem",
          }}
        >
          <ChaosButton onKilled={cluster.refresh} />

          <div className="stat-tile">
            <span className="label">Circuit breakers</span>
            <div style={{ display: "grid", gap: "0.4rem", marginTop: "0.75rem" }}>
              {(breakers.data?.breakers ?? []).length === 0 && (
                <span className="mono" style={{ fontSize: "0.6875rem", color: "var(--text-mute)" }}>
                  none registered yet — they appear after their first call
                </span>
              )}
              {(breakers.data?.breakers ?? []).map((b) => (
                <div
                  key={b.name}
                  className="mono"
                  style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}
                >
                  <span style={{ color: "var(--text-dim)" }}>{b.name}</span>
                  <span style={{ color: b.state === "closed" ? "var(--ok)" : "var(--warn)" }}>
                    {b.state}
                    {b.consecutive_failures > 0 ? ` · ${b.consecutive_failures} fail` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ---- metrics ---- */}
      <Section title="Metrics" aside={<Provenance env={metrics.data} />}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "1rem",
          }}
        >
          {(metrics.data?.data ?? []).map((series) => {
            const latest = series.values[series.values.length - 1] ?? 0;
            return (
              <div className="stat-tile" key={series.label}>
                <span className="label">{series.label}</span>
                <div
                  className="mono"
                  style={{ fontSize: "1.375rem", color: "var(--text)", margin: "0.3rem 0 0.5rem" }}
                >
                  {latest.toFixed(latest < 10 ? 2 : 0)}
                </div>
                <Sparkline values={series.values} />
              </div>
            );
          })}
          {!metrics.loading && (metrics.data?.data ?? []).length === 0 && (
            <p className="mono" style={{ fontSize: "0.75rem", color: "var(--text-mute)" }}>
              no metric series published yet
            </p>
          )}
        </div>
      </Section>

      {/* ---- cost ---- */}
      <Section title="Cost" aside={<Provenance env={cost.data} />}>
        <div className="stat-tile">
          {cost.data ? (
            <>
              <span className="label">Month to date</span>
              <div className="mono" style={{ fontSize: "1.75rem", margin: "0.35rem 0 1rem" }}>
                ${cost.data.data.month_to_date.toFixed(2)}{" "}
                <span style={{ fontSize: "0.875rem", color: "var(--text-mute)" }}>
                  {cost.data.data.currency}
                </span>
              </div>

              {Object.entries(cost.data.data.by_service).map(([service, amount]) => {
                const pct = (amount / (cost.data!.data.month_to_date || 1)) * 100;
                return (
                  <div key={service} style={{ marginBottom: "0.6rem" }}>
                    <div
                      className="mono"
                      style={{ display: "flex", justifyContent: "space-between", fontSize: "0.6875rem" }}
                    >
                      <span style={{ color: "var(--text-dim)" }}>{service}</span>
                      <span style={{ color: "var(--text-mute)" }}>${amount.toFixed(2)}</span>
                    </div>
                    <div
                      style={{
                        height: 4,
                        borderRadius: 2,
                        background: "var(--surface-2)",
                        marginTop: 4,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          background: "linear-gradient(90deg, var(--accent), var(--accent-2))",
                        }}
                      />
                    </div>
                  </div>
                );
              })}

              <p className="label" style={{ margin: "1rem 0 0", lineHeight: 1.6 }}>
                Refreshed once a day. Cost Explorer bills $0.01 per request, so
                polling it hourly would cost more than the server it reports on.
              </p>
            </>
          ) : (
            <span className="mono" style={{ fontSize: "0.75rem", color: "var(--text-mute)" }}>
              {cost.error ?? "loading…"}
            </span>
          )}
        </div>
      </Section>

      {/* ---- deploys ---- */}
      <Section title="Deploy history" aside={<Provenance env={deploys.data} />}>
        <div className="stat-tile left" style={{ overflowX: "auto" }}>
          <table className="mono" style={{ width: "100%", fontSize: "0.75rem", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-mute)" }}>
                <th style={{ padding: "0.4rem 0.6rem 0.6rem 0" }}>When</th>
                <th style={{ padding: "0.4rem 0.6rem 0.6rem 0" }}>Tag</th>
                <th style={{ padding: "0.4rem 0.6rem 0.6rem 0" }}>SHA</th>
                <th style={{ padding: "0.4rem 0.6rem 0.6rem 0" }}>By</th>
                <th style={{ padding: "0.4rem 0.6rem 0.6rem 0" }}>Took</th>
                <th style={{ padding: "0.4rem 0 0.6rem 0" }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {(deploys.data?.data ?? []).map((d) => (
                <tr key={d.deploy_id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.5rem 0.6rem 0.5rem 0", color: "var(--text-dim)" }}>
                    {new Date(d.started_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </td>
                  <td style={{ padding: "0.5rem 0.6rem 0.5rem 0", color: "var(--text-dim)" }}>{d.git_tag}</td>
                  <td style={{ padding: "0.5rem 0.6rem 0.5rem 0", color: "var(--text-mute)" }}>
                    {d.git_sha.slice(0, 7)}
                  </td>
                  <td style={{ padding: "0.5rem 0.6rem 0.5rem 0", color: "var(--text-mute)" }}>{d.actor}</td>
                  <td style={{ padding: "0.5rem 0.6rem 0.5rem 0", color: "var(--text-mute)" }}>
                    {Math.round(d.duration_seconds)}s
                  </td>
                  <td
                    style={{
                      padding: "0.5rem 0 0.5rem 0",
                      color: d.status === "success" ? "var(--ok)" : "var(--danger)",
                    }}
                  >
                    {d.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {(deploys.data?.data ?? []).length === 0 && (
            <span className="mono" style={{ fontSize: "0.75rem", color: "var(--text-mute)" }}>
              no deploys recorded yet
            </span>
          )}
        </div>
      </Section>
    </div>
  );
}
