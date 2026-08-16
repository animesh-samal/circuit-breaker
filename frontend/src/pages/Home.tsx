import { Link } from "react-router-dom";

const GITHUB = "https://github.com/animesh-samal";

const WORK: Array<{
  title: string;
  blurb: string;
  stack: string;
  href: string | null;
  internal?: string;
}> = [
  {
    title: "Circuit Breaker",
    blurb:
      "This site. A React and FastAPI application on Kubernetes, provisioned with Terraform and shipped by a tag-triggered pipeline. It reports its own pod status, deploy history, response times and running cost, and exposes a control that deletes a container so you can watch it recover.",
    stack: "Terraform · Kubernetes · Docker · GitHub Actions · AWS · FastAPI · React",
    href: `${GITHUB}/circuit-breaker`,
    internal: "/infrastructure",
  },
  {
    title: "SolarOptimate",
    blurb:
      "Undergraduate thesis. Predicting the optimal tilt angle for solar panels from meteorological data using gradient-boosted trees, to raise collected irradiance over a fixed-angle baseline.",
    stack: "Python · XGBoost · scikit-learn",
    href: null,
  },
];

export default function Home() {
  return (
    <div style={{ maxWidth: "var(--measure)" }}>
      <section style={{ marginBottom: "3.5rem" }}>
        <h1 style={{ marginBottom: "1.5rem" }}>
          I build the pipelines that ship other people&rsquo;s work.
        </h1>

        <p className="prose" style={{ fontSize: "1.1875rem", color: "var(--text-dim)", margin: 0 }}>
          Two years at Deloitte building GitLab CI pipelines, owning release
          engineering for a multi-developer codebase, and cutting deployment
          time from half an hour to under two minutes.
        </p>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "2rem" }}>
          <Link to="/infrastructure" className="btn-primary">
            See this site&rsquo;s live infrastructure
          </Link>
          <Link to="/experience" className="btn-ghost">
            Experience
          </Link>
        </div>
      </section>

      <section style={{ marginBottom: "3.5rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: "1rem",
            marginBottom: "1.25rem",
          }}
        >
          <h2>Selected work</h2>
          <a href={GITHUB} className="mono" style={{ fontSize: "0.75rem", color: "var(--text-mute)" }}>
            All repositories →
          </a>
        </div>

        <div style={{ display: "grid", gap: "1rem" }}>
          {WORK.map((p) => (
            <article key={p.title} className="card" style={{ padding: "1.25rem 1.4rem" }}>
              <h3 style={{ marginBottom: "0.5rem" }}>{p.title}</h3>
              <p className="prose" style={{ margin: "0 0 0.9rem", fontSize: "1rem" }}>
                {p.blurb}
              </p>
              <p className="label" style={{ margin: "0 0 0.9rem" }}>
                {p.stack}
              </p>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                {p.href && (
                  <a href={p.href} className="mono" style={{ fontSize: "0.75rem" }}>
                    Source →
                  </a>
                )}
                {p.internal && (
                  <Link to={p.internal} className="mono" style={{ fontSize: "0.75rem" }}>
                    Live console →
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card" style={{ padding: "1.75rem" }}>
        <h2 style={{ marginBottom: "0.75rem" }}>This site is the portfolio piece</h2>
        <p className="prose" style={{ margin: "0 0 1rem" }}>
          It runs on Kubernetes, on infrastructure defined in Terraform, deployed
          by a pipeline that builds and ships it on every version tag. The
          infrastructure page reads live from the Kubernetes API and CloudWatch
          &mdash; pod status, deploy history, response times, and what this all
          costs to run, which is currently under five dollars a month.
        </p>
        <p className="prose" style={{ margin: 0 }}>
          There is also a button that deletes one of the running containers so
          you can watch it recover. Nothing here is a screenshot.
        </p>
      </section>
    </div>
  );
}
