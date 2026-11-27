import type { CvInfo, SiteContent } from "../content/site";

/* Client for /api/admin.
 *
 * The session itself is an HttpOnly cookie that scripts cannot see. The only thing
 * kept here is the CSRF token, in a module variable and nowhere else: not in
 * localStorage, not in a cookie, so nothing outside this tab's memory can read
 * it. After a page refresh it is fetched again from /api/admin/me.
 */

export class AdminError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly currentVersion?: number,
  ) {
    super(message);
  }
}

let csrf = "";

export function setCsrf(token: string): void {
  csrf = token;
}

interface FieldIssue {
  loc?: unknown[];
  msg?: string;
}

/* The API answers in three shapes: a plain sentence, an object with a message
   (and the current version, for a conflict), or a list of field problems. All
   three become one readable string. */
function describe(detail: unknown): { message: string; currentVersion?: number } {
  if (typeof detail === "string") return { message: detail };
  if (Array.isArray(detail)) {
    const lines = (detail as FieldIssue[]).slice(0, 4).map((issue) => {
      const where = (issue.loc ?? [])
        .filter((part) => part !== "body" && part !== "content")
        .join(" › ");
      const msg = (issue.msg ?? "is not valid").replace(/^Value error, /, "");
      return where ? `${where}: ${msg}` : msg;
    });
    return { message: `Check these fields. ${lines.join(" · ")}` };
  }
  if (typeof detail === "object" && detail !== null) {
    const d = detail as { message?: string; current_version?: number };
    return d.current_version === undefined
      ? { message: d.message ?? "Something went wrong." }
      : { message: d.message ?? "Something went wrong.", currentVersion: d.current_version };
  }
  return { message: "Something went wrong." };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (method !== "GET") headers.set("X-CSRF-Token", csrf);

  let response: Response;
  try {
    response = await fetch(`/api/admin${path}`, { ...init, headers, credentials: "same-origin" });
  } catch {
    throw new AdminError(0, "Could not reach the server. Check your connection and try again.");
  }

  if (!response.ok) {
    let body: { detail?: unknown } = {};
    try {
      body = (await response.json()) as { detail?: unknown };
    } catch {
      // Not JSON; the status says enough.
    }
    const { message, currentVersion } = describe(body.detail);
    throw new AdminError(response.status, message, currentVersion);
  }
  return (await response.json()) as T;
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export interface SavedDocument {
  version: number;
  content: unknown;
  updated_at: string | null;
  updated_by: string | null;
}

export interface HistoryItem {
  version: number;
  updated_at: string;
  updated_by: string;
}

export async function signIn(password: string, code: string): Promise<void> {
  const { csrf: token } = await request<{ csrf: string }>("/login", json("POST", { password, code }));
  csrf = token;
}

export async function whoAmI(): Promise<boolean> {
  try {
    const { csrf: token } = await request<{ csrf: string }>("/me");
    csrf = token;
    return true;
  } catch (err) {
    if (err instanceof AdminError && (err.status === 401 || err.status === 503)) return false;
    throw err;
  }
}

export async function signOut(): Promise<void> {
  await request<{ ok: boolean }>("/logout", { method: "POST" });
  csrf = "";
}

export const getDocument = (): Promise<SavedDocument> => request<SavedDocument>("/content");

export const saveDocument = (expectedVersion: number, content: Record<string, unknown>) =>
  request<{ version: number; updated_at: string }>(
    "/content",
    json("PUT", { expected_version: expectedVersion, content }),
  );

export const getHistory = (): Promise<{ versions: HistoryItem[] }> => request("/history");

export const restoreVersion = (version: number, expectedVersion: number) =>
  request<{ version: number }>("/restore", json("POST", { version, expected_version: expectedVersion }));

export function uploadCv(file: File): Promise<{ version: number; cv: CvInfo }> {
  return request("/cv", {
    method: "PUT",
    headers: { "Content-Type": "application/pdf", "X-Filename": file.name },
    body: file,
  });
}

/* ---------------------------------------------------------------------------
   Draft -> document
   --------------------------------------------------------------------------- */

const blank = (value: string | undefined): boolean => !value || value.trim() === "";

/* The document the API expects. Empty optional fields are left out rather than
   sent as empty strings, because an empty link is not a link and the API says so.
   The CV is never sent: the server owns it. */
export function toDocument(draft: SiteContent): Record<string, unknown> {
  return {
    availability: draft.availability.map((row) => ({ label: row.label, value: row.value, ok: Boolean(row.ok) })),
    stats: draft.stats,
    job: draft.job,
    education: draft.education,
    skill_groups: draft.skill_groups,
    projects: draft.projects.map((p) => ({
      id: p.id,
      tag: p.tag,
      title: p.title,
      blurb: p.blurb,
      ...(blank(p.tagline) ? {} : { tagline: p.tagline }),
      flow: p.flow ?? "",
      ...(blank(p.extra) ? {} : { extra: p.extra }),
      stack: p.stack,
      ...(blank(p.source) ? {} : { source: p.source }),
      ...(blank(p.live) ? {} : { live: p.live }),
      hidden: Boolean(p.hidden),
    })),
    journey: draft.journey.map((stop) => ({
      when: stop.when,
      title: stop.title,
      place: stop.place,
      text: stop.text,
      icon: stop.icon,
      now: Boolean(stop.now),
      ...(stop.stat && !blank(stop.stat.value) && !blank(stop.stat.label) ? { stat: stop.stat } : {}),
      ...(stop.tags && stop.tags.length > 0 ? { tags: stop.tags } : {}),
    })),
  };
}
