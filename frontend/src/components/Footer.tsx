import { Link } from "react-router-dom";

import { CV, GITHUB, LINKEDIN } from "../content/profile";
import { useSystemStatus } from "../lib/systemStatus";

/* The footer carries build provenance -- the commit currently serving the page,
 * which is the cheapest possible proof that the site is genuinely live. */
export default function Footer() {
  const { version } = useSystemStatus();

  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div>
          <Link to="/#home" className="brand">
            <span className="brand-mark" aria-hidden="true">
              AS
            </span>
            <span className="brand-name">Animesh Samal</span>
          </Link>
          <p className="footer-note">DevOps Engineer · Hyderabad. Built and operated by me.</p>
        </div>

        <nav aria-label="Footer" className="footer-links">
          <Link to="/infrastructure">Infrastructure</Link>
          <Link to="/blog">Writing</Link>
          <Link to="/terminal">Terminal</Link>
          <a href={GITHUB}>GitHub</a>
          <a href={LINKEDIN}>LinkedIn</a>
          <a href={CV} download>
            CV
          </a>
        </nav>
      </div>

      <div className="container footer-meta mono">
        <span>© {new Date().getFullYear()} Animesh Samal</span>
        <span>
          serving{" "}
          <span style={{ color: "var(--text-dim)" }}>
            {version ? `${version.git_tag} · ${version.git_sha.slice(0, 7)}` : "…"}
          </span>
        </span>
      </div>
    </footer>
  );
}
