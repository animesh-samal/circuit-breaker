import { SKILL_GROUPS } from "../../content/profile";
import Reveal from "../Reveal";
import { SectionHead } from "../SectionHead";

export default function Skills() {
  return (
    <section id="skills" className="section section--alt">
      <div className="container">
        <Reveal>
          <SectionHead
            eyebrow="Skills"
            title="What I work with,"
            accent="grouped by the job it does."
            lead="No progress bars. Just the tools I have actually used, sorted by what they are for."
          />
        </Reveal>

        <Reveal>
          <div className="skill-grid">
            {SKILL_GROUPS.map((group) => (
              <div className="card skill-card" key={group.title}>
                <h3>{group.title}</h3>
                <ul className="chips chips--sm">
                  {group.items.map((item) => (
                    <li className="chip" key={item}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
