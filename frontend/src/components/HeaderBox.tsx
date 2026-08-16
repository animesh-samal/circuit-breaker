import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, type BreakerStats, type VersionInfo } from "../lib/api";
import { THEMES, type ThemeId } from "../lib/useTheme";

const SOCIALS: Array<[string, string]> = [
  ["GitHub", "https://github.com/animesh-samal"],
  ["LinkedIn", "https://linkedin.com/in/animesh-samal"],
  ["Email", "mailto:animesh7667@gmail.com"],
];

const STATS: Array<[string, string, string | undefined]> = [
  ["Status", "Available for work", "var(--ok)"],
  ["Timezone", "IST · GMT+5:30", undefined],
  ["Replies", "Within 24 hours", undefined],
];

interface Readouts {
  version: VersionInfo | null;
  podsReady: string;
  breakers: BreakerStats[];
  cost: string;
}

interface Props {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
}

function Field({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="label" style={{ marginBottom: "0.2rem" }}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: "0.8125rem", color: tone ?? "var(--text-dim)" }}>
        {value}
      </div>
    </div>
  );
}

export default function HeaderBox({ theme, setTheme }: Props) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<Readouts>({
    version: null,
    podsReady: "…",
    breakers: [],
    cost: "…",
  });

  /* Readouts are fetched on first expand, not on page load. Most visitors never
   * open this, and there is no reason to spend requests -- or, in the case of
   * Cost Explorer, money -- on data nobody asked to see. */
  useEffect(() => {
    if (!open || loaded) return;
    setLoaded(true);

    void (async () => {
      const [version, cluster, breakers, cost] = await Promise.allSettled([
        api.version(),
        api.cluster(),
        api.breakers(),
        api.cost(),
      ]);

      setData({
        version: version.status === "fulfilled" ? version.value : null,
        podsReady:
          cluster.status === "fulfilled"
            ? `${cluster.value.data.pods.filter((p) => p.ready).length}/${cluster.value.data.pods.length}`
            : "unavailable",
        breakers: breakers.status === "fulfilled" ? breakers.value.breakers : [],
        cost:
          cost.status === "fulfilled"
            ? `$${cost.value.data.month_to_date.toFixed(2)} ${cost.value.data.currency}`
            : "unavailable",
      });
    })();
  }, [open, loaded]);

  const tripped = data.breakers.filter((b) => b.state !== "closed");

  return (
    <section className="utility-box" data-open={open} aria-label="Profile and system status">
      <div className="utility-strip">
        <span className="label">Operator</span>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <label className="sr-only" htmlFor="theme-select">
            Colour theme
          </label>
          <select
            id="theme-select"
            className="control control--sm"
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemeId)}
          >
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="control control--sm"
            aria-expanded={open}
            aria-controls="utility-readouts"
            onClick={() => setOpen((o) => !o)}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            Details
            <span className="chev" data-open={open} aria-hidden="true">
              ▾
            </span>
          </button>
        </div>
      </div>

      <div className="utility-body">
        <div className="utility-identity">
          <img
            className="utility-avatar"
            src="/animesh-avatar.jpg"
            alt="Animesh Samal"
            width={64}
            height={64}
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              objectFit: "cover",
              flex: "none",
              border: "1px solid var(--border-strong)",
            }}
          />
          <div style={{ minWidth: 0 }}>
            <Link to="/" className="utility-name">
              Animesh Samal
            </Link>
            <p className="utility-role">DevOps Engineer · Hyderabad</p>
          </div>
        </div>

        <div className="utility-extra">
          <div style={{ display: "grid", gap: "0.1rem" }}>
            {STATS.map(([label, value, tone]) => (
              <div className="stat" key={label}>
                <span className="label">{label}</span>
                <span className="val" style={tone ? { color: tone } : undefined}>
                  {value}
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gap: "0.6rem", justifyItems: "start" }}>
            <a
              href="/Animesh_Samal_CV.pdf"
              download
              className="btn-primary"
              style={{ padding: "0.55rem 1.05rem", fontSize: "0.875rem", whiteSpace: "nowrap" }}
            >
              Download CV
            </a>
            <div style={{ display: "flex", gap: "0.85rem", flexWrap: "wrap" }}>
              {SOCIALS.map(([label, href]) => (
                <a
                  key={label}
                  href={href}
                  className="mono"
                  style={{ fontSize: "0.75rem", color: "var(--text-mute)" }}
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {open && (
        <div className="utility-readouts" id="utility-readouts">
          <Field label="Build" value={data.version ? data.version.git_sha.slice(0, 7) : "…"} />
          <Field label="Release" value={data.version?.git_tag ?? "…"} />
          <Field label="Environment" value={data.version?.environment ?? "…"} />
          <Field label="Pods ready" value={data.podsReady} />
          <Field
            label="Breakers"
            value={
              data.breakers.length === 0
                ? "none registered"
                : tripped.length === 0
                  ? `${data.breakers.length} closed`
                  : `${tripped.length} open`
            }
            tone={tripped.length === 0 ? "var(--ok)" : "var(--warn)"}
          />
          <Field label="Spend this month" value={data.cost} />
        </div>
      )}
    </section>
  );
}
