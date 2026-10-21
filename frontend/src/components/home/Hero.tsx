import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { CV, FOCUS, HERO_STACK } from "../../content/profile";
import { ledClass, useSystemStatus, type Health } from "../../lib/systemStatus";
import Icon from "../Icons";

/* Cycles through what I work on. Screen readers get the whole list once, as a
 * sentence, instead of an announcement every few seconds; reduced motion gets
 * the first item and no cursor. */
function RotatingFocus() {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setI((n) => (n + 1) % FOCUS.length), 2600);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <p className="hero-rotate">
      <span className="sr-only">I work on {FOCUS.join(", ")}.</span>
      <span aria-hidden="true">
        <span className="hero-rotate-prefix">I work on </span>
        <span key={i} className="hero-rotate-word">
          {FOCUS[i]}
        </span>
        <span className="cursor" />
      </span>
    </p>
  );
}

const BADGE: Record<Health, { title: string; detail: string }> = {
  ok: { title: "All systems normal", detail: "live from Kubernetes" },
  degraded: { title: "Running degraded", detail: "a circuit breaker is open" },
  down: { title: "Console unreachable", detail: "the API is not answering" },
  unknown: { title: "Checking the cluster", detail: "one moment" },
};

/* The badge on the portrait reports the real state of the cluster, the same
 * signal as the lamp in the nav. If the API is down it says so -- a portfolio
 * about honest telemetry cannot fake its own. */
function LiveBadge() {
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

export default function Hero() {
  return (
    <section id="home" className="hero">
      <div className="container hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">DevOps · CI/CD · Kubernetes · AWS</p>
          <h1 className="hero-name">Animesh Samal</h1>
          <p className="hero-role">DevOps Engineer in Hyderabad</p>
          <RotatingFocus />

          <p className="hero-lead">
            I build the pipelines that ship other people&rsquo;s work. Two years
            at Deloitte building GitLab CI pipelines, owning release engineering
            for a multi-developer codebase, and cutting deployment time from half
            an hour to under two minutes.
          </p>

          <div className="hero-actions">
            <Link to="/infrastructure" className="btn btn-primary">
              See it running live
              <Icon name="arrow-right" />
            </Link>
            <Link to="/#contact" className="btn btn-ghost">
              Get in touch
            </Link>
            <a href={CV} download className="btn btn-ghost">
              <Icon name="download" />
              Download CV
            </a>
          </div>

          <ul className="chips" aria-label="Core stack">
            {HERO_STACK.map((item) => (
              <li className="chip" key={item}>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="hero-visual">
          <div className="portrait">
            <img src="/animesh-portrait.jpg" alt="Animesh Samal" width={750} height={1000} />
          </div>
          <LiveBadge />
        </div>
      </div>
    </section>
  );
}
