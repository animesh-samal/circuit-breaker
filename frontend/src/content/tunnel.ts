/* What the card tunnel says.
 *
 * The cards are built from the site's content (see site.ts), so changing the
 * content in the admin panel changes the tunnel too: add a project and it gets a
 * card, hide one and its card goes. This file only picks which parts of the
 * content each card shows, and adds the few short lines of its own (a card title,
 * a caption) that have no home in the content.
 *
 * Nothing here may throw on unexpected content. The content is edited by hand,
 * so every lookup has a fallback; a missing statistic means an empty figure,
 * never a blank page.
 */

import { CONTACT_LINKS, CV, EMAIL, FOCUS, HERO_STACK } from "./profile";
import { projectTagline, safeHref, type Job, type SiteContent, type SiteProject, type Stat } from "./site";

export type FaceKind = "hello" | "work" | "numbers" | "project" | "skills" | "contact";

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
  id: string;
  face: FaceKind;
  name: string;
  kind: string;
  say: string;
  inside: Inside;
  /* Set on project cards. */
  project?: SiteProject | undefined;
  /* Picks the card's colours when several cards share a face. */
  tone: number;
}

/* Raw material for the cards on the tunnel walls. They are scenery, but they only
   ever say true things: phrases are skills, numbers come from the stats. */
export interface WallMaterial {
  numbers: Array<[string, string]>;
  phrases: string[];
}

export interface TunnelData {
  cards: TunnelCard[];
  /* The two figures the "work" and "numbers" cards show large. */
  lead: Stat;
  second: Stat;
  job: Job;
  skillChips: string[];
  material: WallMaterial;
}

/* Fixed decoration for the wall cards: commands and stack names, which are
   scenery and not claims. */
export const WALL_CODE: string[][] = [
  ["$ terraform plan", "$ terraform apply", "Apply complete."],
  ["$ git tag v0.4.0", "$ git push origin v0.4.0", "deploying..."],
  ["$ kubectl get pods", "web-7d9f   1/1  Running", "api-5c8b   1/1  Running"],
  ["$ trivy image web:latest", "Total: 0 (HIGH, CRITICAL)"],
  ["$ kubectl rollout status", 'deployment "web" successfully', "rolled out"],
];

export const WALL_STACK = ["CI/CD", "Terraform", "AWS", "Kubernetes", "Docker", "Python", "SQL", "Git"];

const MAX_PROJECT_CARDS = 4;
const NO_STAT: Stat = { value: "", label: "" };

/* "Deloitte USI — AI & Data" -> "Deloitte USI". */
function shortName(company: string): string {
  return company.split(/\s[—–·|-]\s/)[0]?.trim() || company;
}

/* "Deploy time, down from 25–30 minutes" -> "Deploy time". */
function shortLabel(label: string): string {
  return label.split(",")[0]?.trim() || label;
}

function projectCard(project: SiteProject, tone: number): TunnelCard {
  const links: InsideLink[] = [];
  const live = safeHref(project.live);
  const source = safeHref(project.source);
  if (live) {
    links.push({
      label: live === "/infrastructure" ? "Live console" : "Live site",
      href: live,
      internal: live.startsWith("/"),
    });
  }
  if (source) links.push({ label: "Source", href: source });

  const paragraphs = [project.blurb];
  if (project.extra) paragraphs.push(project.extra);

  const inside: Inside = {
    sub: [project.tag, project.stack.slice(0, 4).join(", ")].filter(Boolean).join(" · "),
    paragraphs,
    chips: project.stack,
    links,
  };
  if (project.flow) inside.flow = project.flow;

  return {
    id: `project-${project.id}`,
    face: "project",
    name: project.title,
    kind: project.tag,
    say: projectTagline(project),
    inside,
    project,
    tone,
  };
}

export function buildTunnel(content: SiteContent): TunnelData {
  const { availability, stats, job, skill_groups, projects, journey } = content;
  const lead = stats[0] ?? NO_STAT;
  const second = stats[1] ?? lead;

  const skillItems = skill_groups.flatMap((g) => g.items);
  const skillChips = skillItems.slice(0, 15);

  const cards: TunnelCard[] = [
    {
      id: "hello",
      face: "hello",
      name: "Hello",
      kind: "Intro",
      say: "DevOps engineer in Hyderabad. Open to work.",
      tone: 0,
      inside: {
        sub: "Intro",
        paragraphs: [
          "I build and look after the pipelines that put code in front of users. Data engineer and deployment lead at Deloitte USI, based in Hyderabad.",
        ],
        facts: availability.map(({ label, value }) => ({ label, value })),
        chips: HERO_STACK,
      },
    },
    {
      id: "work",
      face: "work",
      name: shortName(job.company),
      kind: `Work · ${job.dates}`,
      say: job.role,
      tone: 0,
      inside: {
        sub: `${job.company} · ${job.dates}`,
        paragraphs: [`${job.role}.`],
        points: job.points,
        chips: job.stack,
      },
    },
    {
      id: "numbers",
      face: "numbers",
      name: "In numbers",
      kind: "Impact",
      say: lead.label || "What changed while I was there.",
      tone: 0,
      inside: {
        sub: `${shortName(job.company)} · what changed`,
        facts: stats.map((s) => ({ label: s.label, value: s.value })),
      },
    },
    ...projects
      .filter((p) => !p.hidden)
      .slice(0, MAX_PROJECT_CARDS)
      .map((p, i) => projectCard(p, i)),
    {
      id: "skills",
      face: "skills",
      name: "Skills",
      kind: "Stack",
      say: "Pipelines, containers, clusters and cloud.",
      tone: 0,
      inside: {
        sub: "Skills, grouped",
        facts: skill_groups.map((g) => ({ label: g.title, value: g.items.join(", ") })),
      },
    },
    {
      id: "contact",
      face: "contact",
      name: "Contact",
      kind: "Say hello",
      say: "I reply within a day.",
      tone: 0,
      inside: {
        sub: "Open to DevOps, platform and SRE roles",
        paragraphs: ["Based in Hyderabad, happy with remote or hybrid. I reply within a day."],
        flow: EMAIL,
        facts: availability
          .filter((row) => row.label === "Status" || row.label === "Timezone")
          .map(({ label, value }) => ({ label, value })),
        links: [...CONTACT_LINKS.map(({ label, href }) => ({ label, href })), { label: "CV", href: CV }],
      },
    },
  ];

  const stopStats = journey.flatMap((stop) => (stop.stat ? [stop.stat] : []));
  const numbers: Array<[string, string]> = [...stats, ...stopStats].map((s) => [s.value, shortLabel(s.label)]);

  const material: WallMaterial = {
    numbers: numbers.length > 0 ? numbers : [["", ""]],
    phrases: [...FOCUS, ...skill_groups.map((g) => g.title), ...skillItems.slice(0, 10)],
  };

  return { cards, lead, second, job, skillChips, material };
}
