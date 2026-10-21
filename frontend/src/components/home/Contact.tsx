import { AVAILABILITY, CONTACT_LINKS, CV, EMAIL } from "../../content/profile";
import Icon from "../Icons";
import Reveal from "../Reveal";
import { SectionHead } from "../SectionHead";

/* No contact form. A form needs somewhere to send to -- a mail relay, a third
 * party with a public key in the page, or a new API endpoint with abuse
 * protection -- and a mailto link does the same job with none of that. */
export default function Contact() {
  return (
    <section id="contact" className="section">
      <div className="container contact-grid">
        <Reveal>
          <SectionHead
            eyebrow="Contact"
            title="Have a role in mind?"
            accent="Let’s talk."
            lead="Open to DevOps, platform, and SRE roles. Based in Hyderabad, happy with remote or hybrid. I reply within a day."
          />

          <ul className="contact-list">
            {CONTACT_LINKS.map((c) => (
              <li key={c.label}>
                <a href={c.href} className="contact-item">
                  <span className="contact-icon">
                    <Icon name={c.icon} size={18} />
                  </span>
                  <span className="contact-text">
                    <span className="contact-label">{c.label}</span>
                    <span className="contact-value">{c.text}</span>
                  </span>
                  <Icon name="arrow-up-right" size={14} />
                </a>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal>
          <div className="card card--static availability">
            <p className="card-kicker">Availability</p>
            <dl>
              {AVAILABILITY.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>
                    {row.ok && <span className="led led--on" aria-hidden="true" />}
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="availability-actions">
              <a href={`mailto:${EMAIL}`} className="btn btn-primary">
                <Icon name="mail" />
                Email me
              </a>
              <a href={CV} download className="btn btn-ghost">
                <Icon name="download" />
                Download CV
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
