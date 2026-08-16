import { useEffect, useState } from "react";

import { api, type VersionInfo } from "../lib/api";

/* Slim footer. Identity and availability moved to the utility box, so this now
 * only carries build provenance -- the commit currently serving the page, which
 * is the cheapest possible proof that the site is genuinely live. */
export default function StatusBar() {
  const [version, setVersion] = useState<VersionInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .version()
      .then((v) => {
        if (!cancelled) setVersion(v);
      })
      .catch(() => {
        /* The footer is decoration. It must never surface an error. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer style={{ borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
      <div
        style={{
          maxWidth: "var(--page)",
          margin: "0 auto",
          padding: "1rem 1.5rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "1.5rem",
          fontFamily: "var(--font-mono)",
          fontSize: "0.75rem",
          color: "var(--text-mute)",
        }}
      >
        <span>Built and operated by Animesh Samal</span>
        <span style={{ marginLeft: "auto" }}>
          serving{" "}
          <span style={{ color: "var(--text-dim)" }}>
            {version ? `${version.git_tag} · ${version.git_sha.slice(0, 7)}` : "…"}
          </span>
        </span>
      </div>
    </footer>
  );
}
