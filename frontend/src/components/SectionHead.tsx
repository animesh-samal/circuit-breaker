/* The heading block every section opens with: a small accent eyebrow, the
 * heading, and an optional lead paragraph. `accent` is the tail of the heading
 * that takes the gradient -- one phrase, never the whole line, or the gradient
 * stops reading as emphasis. */

interface Props {
  eyebrow: string;
  title: string;
  accent?: string;
  lead?: React.ReactNode;
}

export function SectionHead({ eyebrow, title, accent, lead }: Props) {
  return (
    <div className="section-head">
      <p className="eyebrow">{eyebrow}</p>
      <h2>
        {title}
        {accent && (
          <>
            {" "}
            <span className="gradient-text">{accent}</span>
          </>
        )}
      </h2>
      {lead && <p className="section-lead">{lead}</p>}
    </div>
  );
}

/* Same shape for the top of a standalone page, with an h1. */
export function PageHead({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: React.ReactNode }) {
  return (
    <header className="page-head">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {lead && <p className="section-lead">{lead}</p>}
    </header>
  );
}
