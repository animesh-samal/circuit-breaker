/* Profile content.
 *
 * Everything the home page says about me, kept apart from the layout so a CV
 * update is an edit to this file and nothing else. Same idea as posts.ts.
 */

export const GITHUB = "https://github.com/animesh-samal";
export const LINKEDIN = "https://www.linkedin.com/in/animesh-samal-a63366b9/";
export const EMAIL = "animesh7667@gmail.com";
export const CV = "/Animesh_Samal_CV.pdf";

export const CONTACT_LINKS: Array<{ label: string; text: string; href: string; icon: "mail" | "linkedin" | "github" }> = [
  { label: "Email", text: EMAIL, href: `mailto:${EMAIL}`, icon: "mail" },
  { label: "LinkedIn", text: "linkedin.com/in/animesh-samal-a63366b9", href: LINKEDIN, icon: "linkedin" },
  { label: "GitHub", text: "github.com/animesh-samal", href: GITHUB, icon: "github" },
];

export const AVAILABILITY: Array<{ label: string; value: string; ok?: boolean }> = [
  { label: "Status", value: "Available for work", ok: true },
  { label: "Based in", value: "Hyderabad · remote or hybrid" },
  { label: "Timezone", value: "IST · GMT+5:30" },
  { label: "Replies", value: "Within 24 hours" },
];

/* Rotated through on the hero. Kept short so the line never wraps on a phone. */
export const FOCUS = ["CI/CD pipelines", "Kubernetes on AWS", "Terraform", "release engineering"];

export const HERO_STACK = ["Kubernetes", "Terraform", "AWS", "Docker", "GitHub Actions", "GitLab CI", "Python"];

/* Every figure here is lifted from the Deloitte bullets below. A stat card with
   a number that is not backed by the CV is the fastest way to lose a reader. */
export const STATS: Array<{ value: string; label: string }> = [
  { value: "< 2 min", label: "Deploy time, down from 25–30 minutes" },
  { value: "20+", label: "Staging and production releases led" },
  { value: "80–90%", label: "Fewer merge-conflict issues" },
  { value: "100+", label: "Exposed-credential findings fixed" },
];

export const JOB = {
  company: "Deloitte USI — AI & Data",
  role: "Data engineer · deployment lead",
  dates: "Oct 2024 — present",
  points: [
    "Built and maintained GitLab CI pipelines automating build, test and deployment, cutting deployment time from 25–30 minutes to under two minutes.",
    "Designed and enforced the Git branching strategy and repository structure, leading 20+ staging and production releases across a 5–8 person team and reducing merge-conflict issues by 80–90%.",
    "Identified and remediated 100+ exposed-credential findings and resolved the corresponding SAST pipeline failures.",
    "Maintained Python ETL pipelines processing 100–300 GB of healthcare data per month, with transformation logic in Python and SQL.",
    "Worked with AWS S3 and Secrets Manager for credential and data handling across pipeline-integrated systems.",
  ],
  stack: ["GitLab CI", "Git", "Python", "SQL", "AWS S3", "Secrets Manager", "SAST"],
};

export const EDUCATION = {
  degree: "B.Tech, Electronics and Telecommunication Engineering",
  school: "Indira Gandhi Institute of Technology, Sarang, Odisha",
  detail: "CGPA 8.73/10",
  years: "2020–2024",
};

export const SKILL_GROUPS: Array<{ title: string; items: string[] }> = [
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

export interface Project {
  tag: string;
  title: string;
  blurb: string;
  /* A one-line picture of how the thing works, shown in monospace. */
  flow: string;
  extra?: string;
  stack: string[];
  source?: string;
  live?: string;
}

export const PROJECTS: Project[] = [
  {
    tag: "01 · This site",
    title: "Circuit Breaker",
    blurb:
      "A React and FastAPI application on Kubernetes, provisioned with Terraform and shipped by a tag-triggered pipeline. It reports its own pod status, deploy history, response times and running cost, and exposes a control that deletes a container so you can watch it recover.",
    flow: "git tag → GitHub Actions (build · scan · push) → ECR → SSM → k3s on EC2",
    extra:
      "The infrastructure page reads live from the Kubernetes API and CloudWatch. Nothing on it is a screenshot.",
    stack: ["Terraform", "Kubernetes", "Docker", "GitHub Actions", "AWS", "FastAPI", "React"],
    source: `${GITHUB}/circuit-breaker`,
    live: "/infrastructure",
  },
  {
    tag: "02 · Thesis",
    title: "SolarOptimate",
    blurb:
      "Undergraduate thesis. Predicting the optimal tilt angle for solar panels from meteorological data using gradient-boosted trees, to raise collected irradiance over a fixed-angle baseline.",
    flow: "meteorological data → gradient-boosted trees → optimal tilt angle",
    stack: ["Python", "XGBoost", "scikit-learn"],
  },
];
