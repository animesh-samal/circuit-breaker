import { STATS } from "../../content/profile";
import Reveal from "../Reveal";
import { SectionHead } from "../SectionHead";

export default function About() {
  return (
    <section id="about" className="section section--alt">
      <div className="container">
        <Reveal>
          <SectionHead eyebrow="About" title="From signals and circuits to" accent="shipping software." />
        </Reveal>

        <div className="about-grid">
          <Reveal className="about-copy">
            <p>
              I studied Electronics and Telecommunication Engineering at IGIT
              Sarang, and spent most of it closer to signals and circuits than to
              servers. My thesis used gradient boosting to optimise solar panel
              tilt angles.
            </p>
            <p>
              I joined Deloitte in October 2024 on the data side, and drifted
              toward the part nobody else wanted: why releases broke, why merges
              conflicted, why deploying took thirty minutes of somebody&rsquo;s
              afternoon. That turned into owning the pipeline, then the branching
              strategy, then the release process for the team.
            </p>

            <h3>What I&rsquo;m doing now</h3>
            <p>
              Learning the parts of this discipline I hadn&rsquo;t touched at work
              &mdash; Terraform, Kubernetes, and running production infrastructure
              end to end &mdash; by building and operating this site rather than
              reading about them.
            </p>
          </Reveal>

          <Reveal>
            <aside className="card card--static about-aside">
              <p className="card-kicker">Why &ldquo;Circuit Breaker&rdquo;</p>
              <p>
                A circuit breaker is a component that opens a circuit when current
                exceeds a safe threshold, protecting everything downstream. It is
                also the name of a pattern in distributed systems: when a
                dependency starts failing, you stop calling it, because retrying a
                service that is already struggling adds load to the thing you need
                to recover.
              </p>
              <p>
                Same idea, same name, two disciplines &mdash; which is roughly the
                route I took. This site implements the software version around
                every call it makes to AWS, and shows the state of each breaker on
                the infrastructure page.
              </p>
            </aside>
          </Reveal>
        </div>

        <Reveal>
          <ul className="stat-grid" aria-label="At Deloitte">
            {STATS.map((s) => (
              <li className="card stat-card" key={s.label}>
                <strong>{s.value}</strong>
                <span>{s.label}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
