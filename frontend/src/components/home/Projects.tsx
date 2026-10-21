import { Link } from "react-router-dom";

import { GITHUB, PROJECTS } from "../../content/profile";
import Icon from "../Icons";
import Reveal from "../Reveal";
import { SectionHead } from "../SectionHead";

export default function Projects() {
  return (
    <section id="projects" className="section">
      <div className="container">
        <Reveal>
          <SectionHead eyebrow="Projects" title="Things I have" accent="built and run." />
        </Reveal>

        <Reveal>
          <div className="project-grid">
            {PROJECTS.map((p, i) => (
              <article key={p.title} className={`card project-card${i === 0 ? " project-card--lead" : ""}`}>
                <p className="card-kicker">{p.tag}</p>
                <h3>{p.title}</h3>
                <p>{p.blurb}</p>
                <p className="flow mono">{p.flow}</p>
                {p.extra && <p>{p.extra}</p>}
                <p className="tech-line">{p.stack.join(" · ")}</p>

                {(p.live || p.source) && (
                  <div className="card-links">
                    {p.live && (
                      <Link to={p.live} className="text-link">
                        Live console
                        <Icon name="arrow-right" size={14} />
                      </Link>
                    )}
                    {p.source && (
                      <a href={p.source} className="text-link">
                        Source
                        <Icon name="arrow-up-right" size={14} />
                      </a>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        </Reveal>

        <Reveal>
          <a href={GITHUB} className="text-link section-foot">
            All repositories on GitHub
            <Icon name="arrow-up-right" size={14} />
          </a>
        </Reveal>
      </div>
    </section>
  );
}
