import { useContent } from "../../lib/content";
import Reveal from "../Reveal";
import { SectionHead } from "../SectionHead";

export default function Experience() {
  const { job, education } = useContent();

  return (
    <section id="experience" className="section section--alt">
      <div className="container">
        <Reveal>
          <SectionHead eyebrow="Experience" title="Pipelines, releases, and" accent="the parts nobody else wanted." />
        </Reveal>

        <Reveal>
          <div className="timeline">
            <article className="job">
              <div className="job-when">
                <span className="job-tag">Work</span>
                <span>{job.dates}</span>
              </div>
              <div>
                <h3>{job.company}</h3>
                <p className="job-role">{job.role}</p>
                <ul className="job-points">
                  {job.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <p className="tech-line">{job.stack.join(" · ")}</p>
              </div>
            </article>

            <article className="job">
              <div className="job-when">
                <span className="job-tag">Education</span>
                <span>{education.years}</span>
              </div>
              <div>
                <h3>{education.degree}</h3>
                <p className="job-role">{education.school}</p>
                <p className="job-detail">{education.detail}</p>
              </div>
            </article>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
