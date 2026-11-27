/* The shape of the site's editable content, and the copy that is built in.
 *
 * Everything the pages say about me that the admin panel can change is one
 * document of this shape. profile.ts holds the words that ship with the site,
 * and DEFAULT_CONTENT assembles them into this shape. The saved document (from
 * /api/content) is laid over it field by field, so a half-filled document, an
 * empty database or an unreachable API all still give a complete page.
 *
 * The field names match the API exactly (including the underscores), so a
 * document can be sent and read back without translating it.
 */

import {
  AVAILABILITY,
  EDUCATION,
  JOB,
  JOURNEY,
  PROJECTS,
  SKILL_GROUPS,
  STATS,
  type JourneyStop,
  type Project,
} from "./profile";

export type { JourneyStop };

export interface AvailabilityRow {
  label: string;
  value: string;
  ok?: boolean | undefined;
}

export interface Stat {
  value: string;
  label: string;
}

export interface Job {
  company: string;
  role: string;
  dates: string;
  points: string[];
  stack: string[];
}

export interface Education {
  degree: string;
  school: string;
  detail: string;
  years: string;
}

export interface SkillGroup {
  title: string;
  items: string[];
}

export interface SiteProject extends Project {
  /* Stable identity, so reordering and editing never confuses two projects. */
  id: string;
  /* One short line for the tunnel card. */
  tagline?: string | undefined;
  /* Hidden projects stay in the admin panel but not on the site. */
  hidden?: boolean | undefined;
}

export interface CvInfo {
  key: string;
  filename: string;
  sha256: string;
  size: number;
  updated_at: string;
}

export interface SiteContent {
  availability: AvailabilityRow[];
  stats: Stat[];
  job: Job;
  education: Education;
  skill_groups: SkillGroup[];
  projects: SiteProject[];
  journey: JourneyStop[];
  /* Set by the server when a CV is uploaded; never edited as text. */
  cv?: CvInfo | undefined;
}

/* "Circuit Breaker" -> "circuit-breaker". */
export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "project";
}

/* The one-line summary for a project: the tagline if there is one, otherwise the
   first sentence of the description, cut short. */
export function projectTagline(project: Pick<SiteProject, "tagline" | "blurb">): string {
  if (project.tagline) return project.tagline;
  const first = project.blurb.split(/(?<=[.!?])\s/)[0] ?? project.blurb;
  return first.length > 80 ? `${first.slice(0, 77).trimEnd()}...` : first;
}

const TAGLINES: Record<string, string> = {
  "Circuit Breaker": "A cluster I run myself, end to end.",
  SolarOptimate: "Weather data in, best tilt angle out.",
};

export const DEFAULT_CONTENT: SiteContent = {
  availability: AVAILABILITY,
  stats: STATS,
  job: JOB,
  education: EDUCATION,
  skill_groups: SKILL_GROUPS,
  projects: PROJECTS.map((p) => ({ ...p, id: slugify(p.title), tagline: TAGLINES[p.title] })),
  journey: JOURNEY,
};

/* Lay a saved document over the built-in one. A field that is absent keeps the
   built-in value; a field that is present replaces it whole. The saved document
   came through the API's checks, but it is read as untrusted all the same: each
   field is only taken if it has the right basic shape. */
export function mergeContent(base: SiteContent, saved: unknown): SiteContent {
  if (typeof saved !== "object" || saved === null) return base;
  const s = saved as Record<string, unknown>;
  const list = <T>(value: unknown, fallback: T[]): T[] => (Array.isArray(value) ? (value as T[]) : fallback);
  const obj = <T extends object>(value: unknown, fallback: T): T =>
    typeof value === "object" && value !== null && !Array.isArray(value) ? (value as T) : fallback;

  return {
    availability: list(s.availability, base.availability),
    stats: list(s.stats, base.stats),
    job: obj(s.job, base.job),
    education: obj(s.education, base.education),
    skill_groups: list(s.skill_groups, base.skill_groups),
    projects: list(s.projects, base.projects),
    journey: list(s.journey, base.journey),
    cv: s.cv ? (s.cv as CvInfo) : undefined,
  };
}

/* A link is safe to put in an href only if it is an https URL or a path on this
   site. The API refuses anything else before saving; this is the second lock,
   for a document that did not come through it. */
export function safeHref(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("https://") || (value.startsWith("/") && !value.startsWith("//"))) return value;
  return undefined;
}
