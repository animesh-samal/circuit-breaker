export default function About() {
  return (
    <div style={{ maxWidth: "var(--measure)" }}>
      <h1 style={{ marginBottom: "2rem" }}>About</h1>

      {/* Photo floats beside the opening paragraphs on desktop and drops above
          them on narrow screens. shape-outside is deliberately not used -- text
          wrapping around a rounded edge reads as decoration; a clean rectangular
          gutter reads as a book plate. */}
      <img
        src="/animesh-portrait.jpg"
        alt="Animesh Samal"
        width={750}
        height={1000}
        loading="lazy"
        style={{
          float: "right",
          width: "min(240px, 40%)",
          height: "auto",
          marginLeft: "1.75rem",
          marginBottom: "1.25rem",
          borderRadius: "8px",
          border: "1px solid var(--border-strong)",
        }}
      />

      <p className="prose">
        I studied Electronics and Telecommunication Engineering at IGIT Sarang,
        and spent most of it closer to signals and circuits than to servers. My
        thesis used gradient boosting to optimise solar panel tilt angles.
      </p>

      <p className="prose">
        I joined Deloitte in October 2024 on the data side, and drifted toward
        the part nobody else wanted: why releases broke, why merges conflicted,
        why deploying took thirty minutes of somebody&rsquo;s afternoon. That
        turned into owning the pipeline, then the branching strategy, then the
        release process for the team.
      </p>

      <h2 style={{ margin: "2.5rem 0 1rem", clear: "none" }}>Why &ldquo;Circuit Breaker&rdquo;</h2>

      <p className="prose">
        A circuit breaker is a component that opens a circuit when current
        exceeds a safe threshold, protecting everything downstream. It is also
        the name of a pattern in distributed systems: when a dependency starts
        failing, you stop calling it, because retrying a service that is already
        struggling adds load to the thing you need to recover.
      </p>

      <p className="prose" style={{ clear: "both" }}>
        Same idea, same name, two disciplines &mdash; which is roughly the route
        I took. This site implements the software version around every call it
        makes to AWS, and shows the state of each breaker on the infrastructure
        page.
      </p>

      <h2 style={{ margin: "2.5rem 0 1rem" }}>What I&rsquo;m doing now</h2>

      <p className="prose" style={{ marginBottom: 0 }}>
        Learning the parts of this discipline I hadn&rsquo;t touched at work
        &mdash; Terraform, Kubernetes, and running production infrastructure end
        to end &mdash; by building and operating this site rather than reading
        about them.
      </p>
    </div>
  );
}
