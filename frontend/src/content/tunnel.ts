/* What the card tunnel says.
 *
 * Every fact here is read from profile.ts, so a CV update is still an edit to
 * that one file. This file only adds the short lines the tunnel needs of its
 * own (a title, a one-line caption) and picks which parts of the profile each
 * card shows.
 */

import {
  AVAILABILITY,
  CONTACT_LINKS,
  CV,
  EMAIL,
  FOCUS,
  HERO_STACK,
  JOB,
  JOURNEY,
  PROJECTS,
  SKILL_GROUPS,
  STATS,
  type JourneyStop,
  type Project,
} from "./profile";

export type TunnelId = "hello" | "deloitte" | "releases" | "circuit" | "solar" | "skills" | "contact";

export interface InsideLink {
  label: string;
  href: string;
  /* A route inside this site, so it should use the router instead of a plain link. */
  internal?: boolean;
}

/* The detail panel behind "Step inside". Every field is optional so each card
   shows only what it has. */
export interface Inside {
  sub: string;
  paragraphs?: string[];
  points?: string[];
  flow?: string;
  facts?: Array<{ label: string; value: string }>;
  chips?: string[];
  links?: InsideLink[];
}

export interface TunnelCard {
  id: TunnelId;
  name: string;
  kind: string;
  say: string;
  inside: Inside;
}

/* These lookups fail loudly if the profile changes shape, so a rename in
   profile.ts shows up at build time instead of as a blank card. */
function fail(message: string): never {
  throw new Error(`tunnel: ${message}`);
}

function project(title: string): Project {
  return PROJECTS.find((p) => p.title === title) ?? fail(`no project called ${title}`);
}

function stop(title: string): JourneyStop {
  return JOURNEY.find((s) => s.title === title) ?? fail(`no journey stop called ${title}`);
}

function stat(startsWith: string): { value: string; label: string } {
  return STATS.find((s) => s.label.startsWith(startsWith)) ?? fail(`no stat starting ${startsWith}`);
}

function only(list: string[], keep: string[]): string[] {
  return list.filter((item) => keep.includes(item));
}

/* Pieces the card faces draw directly. */
export const DEPLOY_STAT = stat("Deploy time");
export const DATA_STAT = stop("Joined Deloitte").stat ?? fail("Joined Deloitte has no stat");
export const CIRCUIT = project("Circuit Breaker");
export const SOLAR = project("SolarOptimate");
export { EMAIL, JOB };

/* Chips on the skills card, all taken from the skill groups. */
export const SKILL_CHIPS = [
  "Kubernetes",
  "Terraform",
  "AWS",
  "Docker",
  "GitHub Actions",
  "GitLab CI",
  "Python",
  "SQL",
  "Bash",
  "TypeScript",
  "k3s",
  "Trivy",
  "ECR",
  "IAM",
  "CloudWatch",
];

/* Material for the cards on the tunnel walls. They are scenery, but they only
   ever say true things: phrases are skills, numbers come from the stats. */
export const WALL_PHRASES = [
  ...FOCUS,
  "Infrastructure as code",
  "Pipeline design",
  "Rollbacks that work",
  "Observability",
  "Cost engineering",
  "Runbooks",
  "Tag-triggered deploys",
  "Python ETL",
];

const SHORT_LABELS = ["per deploy", "releases led", "fewer conflicts", "credentials fixed"];
const CGPA = stop("Started engineering").stat ?? fail("Started engineering has no stat");

export const WALL_NUMBERS: Array<[string, string]> = [
  ...STATS.map((s, i): [string, string] => [s.value, SHORT_LABELS[i] ?? s.label]),
  [DATA_STAT.value, "of data a month"],
  [CGPA.value, CGPA.label],
];

export const WALL_CODE: string[][] = [
  ["$ terraform plan", "$ terraform apply", "Apply complete."],
  ["$ git tag v0.4.0", "$ git push origin v0.4.0", "deploying..."],
  ["$ kubectl get pods", "web-7d9f   1/1  Running", "api-5c8b   1/1  Running"],
  ["$ trivy image web:latest", "Total: 0 (HIGH, CRITICAL)"],
  ["$ kubectl rollout status", 'deployment "web" successfully', "rolled out"],
];

export const WALL_STACK = ["CI/CD", "Terraform", "AWS", "Kubernetes", "Docker", "Python", "SQL", "Git"];

const circuitLinks: InsideLink[] = [];
if (CIRCUIT.live) circuitLinks.push({ label: "Live console", href: CIRCUIT.live, internal: true });
if (CIRCUIT.source) circuitLinks.push({ label: "Source", href: CIRCUIT.source });

export const TUNNEL_CARDS: TunnelCard[] = [
  {
    id: "hello",
    name: "Hello",
    kind: "Intro",
    say: "DevOps engineer in Hyderabad. Open to work.",
    inside: {
      sub: "Intro",
      paragraphs: [
        "I build and look after the pipelines that put code in front of users. Data engineer and deployment lead at Deloitte USI, based in Hyderabad.",
      ],
      facts: AVAILABILITY.map(({ label, value }) => ({ label, value })),
      chips: HERO_STACK,
    },
  },
  {
    id: "deloitte",
    name: "Deloitte",
    kind: "Work · Oct 2024 to now",
    say: "Data engineer, healthcare pipelines.",
    inside: {
      sub: `${JOB.company} · ${JOB.dates}`,
      paragraphs: [`${JOB.role}.`],
      points: JOB.points.slice(3),
      chips: only(JOB.stack, ["Python", "SQL", "AWS S3", "Secrets Manager"]),
    },
  },
  {
    id: "releases",
    name: "Releases",
    kind: "Work · Deployment lead",
    say: "Deploys from 25–30 minutes to under two.",
    inside: {
      sub: `${JOB.company} · release process`,
      points: JOB.points.slice(0, 3),
      chips: only(JOB.stack, ["GitLab CI", "Git", "SAST"]),
    },
  },
  {
    id: "circuit",
    name: "Circuit Breaker",
    kind: "Project · This site",
    say: "A cluster I run myself, end to end.",
    inside: {
      sub: "Project · React, FastAPI, Kubernetes, Terraform",
      paragraphs: [CIRCUIT.blurb, ...(CIRCUIT.extra ? [CIRCUIT.extra] : [])],
      flow: CIRCUIT.flow,
      chips: CIRCUIT.stack,
      links: circuitLinks,
    },
  },
  {
    id: "solar",
    name: "SolarOptimate",
    kind: "Thesis · Final year",
    say: "Weather data in, best tilt angle out.",
    inside: {
      sub: "Undergraduate thesis · Python, XGBoost, scikit-learn",
      paragraphs: [SOLAR.blurb],
      flow: SOLAR.flow,
      chips: SOLAR.stack,
    },
  },
  {
    id: "skills",
    name: "Skills",
    kind: "Stack",
    say: "Pipelines, containers, clusters and cloud.",
    inside: {
      sub: "Skills, grouped",
      facts: SKILL_GROUPS.map((g) => ({ label: g.title, value: g.items.join(", ") })),
    },
  },
  {
    id: "contact",
    name: "Contact",
    kind: "Say hello",
    say: "I reply within a day.",
    inside: {
      sub: "Open to DevOps, platform and SRE roles",
      paragraphs: ["Based in Hyderabad, happy with remote or hybrid. I reply within a day."],
      flow: EMAIL,
      facts: AVAILABILITY.filter((row) => row.label === "Status" || row.label === "Timezone").map(
        ({ label, value }) => ({ label, value }),
      ),
      links: [...CONTACT_LINKS.map(({ label, href }) => ({ label, href })), { label: "CV", href: CV }],
    },
  },
];
