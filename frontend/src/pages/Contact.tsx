const LINKS: Array<[string, string, string]> = [
  ["Email", "animesh7667@gmail.com", "mailto:animesh7667@gmail.com"],
  [
    "LinkedIn",
    "linkedin.com/in/animesh-samal-a63366b9",
    "https://www.linkedin.com/in/animesh-samal-a63366b9/",
  ],
  ["GitHub", "github.com/animesh-samal", "https://github.com/animesh-samal"],
];

export default function Contact() {
  return (
    <div style={{ maxWidth: "var(--measure)" }}>
      <h1 style={{ marginBottom: "1.5rem" }}>Contact</h1>

      <p className="prose" style={{ marginBottom: "2rem" }}>
        Open to DevOps, platform, and SRE roles. Based in Hyderabad, happy with
        remote or hybrid. I reply within a day.
      </p>

      <dl style={{ margin: 0 }}>
        {LINKS.map(([label, text, href]) => (
          <div
            key={label}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 130px) minmax(0, 1fr)",
              gap: "1rem",
              padding: "0.9rem 0",
              borderTop: "1px solid var(--border)",
            }}
          >
            <dt className="label" style={{ margin: 0 }}>
              {label}
            </dt>
            <dd style={{ margin: 0 }}>
              <a href={href} style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem" }}>
                {text}
              </a>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
