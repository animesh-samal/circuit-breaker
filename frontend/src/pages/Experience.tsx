const WORK = [
  "Built and maintained GitLab CI pipelines automating build, test and deployment, cutting deployment time from 25–30 minutes to under two minutes.",
  "Designed and enforced the Git branching strategy and repository structure, leading 20+ staging and production releases across a 5–8 person team and reducing merge-conflict issues by 80–90%.",
  "Identified and remediated 100+ exposed-credential findings and resolved the corresponding SAST pipeline failures.",
  "Maintained Python ETL pipelines processing 100–300 GB of healthcare data per month, with transformation logic in Python and SQL.",
  "Worked with AWS S3 and Secrets Manager for credential and data handling across pipeline-integrated systems.",
];

const SKILL_GROUPS: Array<{ title: string; items: string[] }> = [
  {
    title: "CI/CD & release",
    items: [
      "GitLab CI",
      "GitHub Actions",
      "Pipeline design",
      "Semantic versioning",
      "Tag-triggered deploys",
      "Merge request workflows",
      "Rollback",
    ],
  },
  {
    title: "Containers",
    items: ["Docker", "Multi-stage builds", "Non-root images", "Amazon ECR", "Trivy scanning"],
  },
  {
    title: "Orchestration",
    items: [
      "Kubernetes",
      "k3s",
      "Deployments",
      "Services",
      "Ingress",
      "Probes",
      "RBAC",
      "HPA",
      "Rolling updates",
    ],
  },
  {
    title: "Infrastructure as code",
    items: ["Terraform", "Remote state", "State locking", "Reusable modules", "Plan and apply in CI"],
  },
  {
    title: "AWS",
    items: [
      "EC2",
      "VPC",
      "IAM",
      "OIDC",
      "S3",
      "Secrets Manager",
      "CloudWatch",
      "ECR",
      "DynamoDB",
      "Cost Explorer",
    ],
  },
  {
    title: "Languages",
    items: ["Python", "SQL", "Bash", "TypeScript", "C++", "YAML"],
  },
  {
    title: "Practice",
    items: [
      "Observability",
      "Cost engineering",
      "Incident debugging",
      "SAST remediation",
      "Code review",
      "Runbooks",
    ],
  },
];

export default function Experience() {
  return (
    <div>
      <h1 style={{ marginBottom: "2.5rem" }}>Experience</h1>

      <section style={{ marginBottom: "3.5rem", maxWidth: "var(--measure)" }}>
        <h2>Deloitte USI — AI &amp; Data</h2>
        <p className="label" style={{ margin: "0.6rem 0 0.25rem" }}>
          Data engineer · deployment lead
        </p>
        <p className="label" style={{ margin: "0 0 1.5rem" }}>
          Oct 2024 — present
        </p>

        <ul style={{ paddingLeft: "1.1rem", margin: 0 }}>
          {WORK.map((item) => (
            <li key={item} className="prose" style={{ marginBottom: "0.85rem" }}>
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginBottom: "3.5rem" }}>
        <h2 style={{ marginBottom: "1.25rem" }}>Skills</h2>
        <div className="skill-grid">
          {SKILL_GROUPS.map((group) => (
            <div className="skill-card" key={group.title}>
              <span className="label">{group.title}</span>
              <div className="chips">
                {group.items.map((item) => (
                  <span className="chip" key={item}>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: "var(--measure)" }}>
        <h2 style={{ marginBottom: "1rem" }}>Education</h2>
        <p className="prose" style={{ marginBottom: 0 }}>
          B.Tech, Electronics and Telecommunication Engineering — Indira Gandhi
          Institute of Technology, Sarang, Odisha. 2020–2024, CGPA 8.73/10.
        </p>
      </section>
    </div>
  );
}
