import { EDUCATION, JOB } from "../../content/profile";
import Reveal from "../Reveal";
import { SectionHead } from "../SectionHead";

export default function Experience() {
  return (
    <section id="experience" className="section">
      <div className="container">
        <Reveal>
          <SectionHead eyebrow="Experience" title="Pipelines, releases, and" accent="the parts nobody else wanted." />
        </Reveal>

        <Reveal>
          <div className="timeline">
            <article className="job">
              <div className="job-when">
                <span className="job-tag">Work</span>
                <span>{JOB.dates}</span>
              </div>
              <div>
                <h3>{JOB.company}</h3>
                <p className="job-role">{JOB.role}</p>
                <ul className="job-points">
                  {JOB.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <p className="tech-line">{JOB.stack.join(" · ")}</p>
              </div>
            </article>

            <article className="job">
              <div className="job-when">
                <span className="job-tag">Education</span>
                <span>{EDUCATION.years}</span>
              </div>
              <div>
                <h3>{EDUCATION.degree}</h3>
                <p className="job-role">{EDUCATION.school}</p>
                <p className="job-detail">{EDUCATION.detail}</p>
              </div>
            </article>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
