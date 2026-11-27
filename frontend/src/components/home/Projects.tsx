import { Link } from "react-router-dom";

import { GITHUB } from "../../content/profile";
import { safeHref } from "../../content/site";
import { useContent } from "../../lib/content";
import Icon from "../Icons";
import Reveal from "../Reveal";
import { SectionHead } from "../SectionHead";

export default function Projects() {
  const { projects } = useContent();
  const shown = projects.filter((p) => !p.hidden);

  return (
    <section id="projects" className="section section--alt">
      <div className="container">
        <Reveal>
          <SectionHead eyebrow="Projects" title="Things I have" accent="built and run." />
        </Reveal>

        <Reveal>
          <div className="project-grid">
            {shown.map((p, i) => {
              const live = safeHref(p.live);
              const source = safeHref(p.source);
              // A path on this site goes through the router; a full address is a plain link.
              const liveIsPage = live?.startsWith("/") ?? false;
              const liveLabel = live === "/infrastructure" ? "Live console" : "Live site";
              return (
                <article key={p.id} className={`card project-card${i === 0 ? " project-card--lead" : ""}`}>
                  <p className="card-kicker">{p.tag}</p>
                  <h3>{p.title}</h3>
                  <p>{p.blurb}</p>
                  {p.flow && <p className="flow mono">{p.flow}</p>}
                  {p.extra && <p>{p.extra}</p>}
                  {p.stack.length > 0 && <p className="tech-line">{p.stack.join(" · ")}</p>}

                  {(live || source) && (
                    <div className="card-links">
                      {live &&
                        (liveIsPage ? (
                          <Link to={live} className="text-link">
                            {liveLabel}
                            <Icon name="arrow-right" size={14} />
                          </Link>
                        ) : (
                          <a href={live} className="text-link">
                            {liveLabel}
                            <Icon name="arrow-up-right" size={14} />
                          </a>
                        ))}
                      {source && (
                        <a href={source} className="text-link">
                          Source
                          <Icon name="arrow-up-right" size={14} />
                        </a>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
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
