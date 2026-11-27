import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import CvPanel from "../components/admin/CvPanel";
import { ExperienceEditor, JourneyEditor, ProfileEditor, ProjectsEditor, SkillsEditor } from "../components/admin/editors";
import HistoryPanel from "../components/admin/HistoryPanel";
import LoginForm from "../components/admin/LoginForm";
import { PageHead } from "../components/SectionHead";
import { DEFAULT_CONTENT, mergeContent, type CvInfo, type SiteContent } from "../content/site";
import {
  AdminError,
  getDocument,
  saveDocument,
  signOut,
  toDocument,
  whoAmI,
} from "../lib/adminApi";
import "../styles/admin.css";

/* The admin panel: change what the site says, from a form.
 *
 * The page holds one draft of the whole content. Each tab edits a part of it,
 * nothing is sent until Save, and Save sends the draft with the version it
 * started from, so the API can refuse it if someone saved in between. Uploading a
 * CV and restoring a version are the two things that act immediately, because they
 * are not text edits.
 *
 * Nothing is linked to this page from the site. It is reached by typing /admin,
 * is kept out of search results, and shows nothing until you have signed in. */

type Phase = "checking" | "signed-out" | "signed-in";
type Tab = "projects" | "profile" | "experience" | "skills" | "journey" | "cv" | "history";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "projects", label: "Projects" },
  { id: "profile", label: "Numbers" },
  { id: "experience", label: "Experience" },
  { id: "skills", label: "Skills" },
  { id: "journey", label: "Journey" },
  { id: "cv", label: "CV" },
  { id: "history", label: "History" },
];

/* The page asks search engines to skip it, for as long as it is open. */
function useNoIndex(): void {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex,nofollow";
    document.head.appendChild(meta);
    const title = document.title;
    document.title = "Admin";
    return () => {
      meta.remove();
      document.title = title;
    };
  }, []);
}

const snapshotOf = (content: SiteContent): string => JSON.stringify(toDocument(content));

export default function Admin() {
  useNoIndex();

  const [phase, setPhase] = useState<Phase>("checking");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signedOutNotice, setSignedOutNotice] = useState<string | null>(null);

  const [draft, setDraft] = useState<SiteContent>(DEFAULT_CONTENT);
  const [snapshot, setSnapshot] = useState(() => snapshotOf(DEFAULT_CONTENT));
  const [version, setVersion] = useState(0);
  const [cv, setCv] = useState<CvInfo | undefined>(undefined);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("projects");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string; stale?: boolean } | null>(null);

  const dirty = useMemo(() => snapshotOf(draft) !== snapshot, [draft, snapshot]);

  /* Any request that finds the session gone sends the person back to sign in,
     with a plain reason, instead of leaving a form that can no longer save. */
  const onAdminError = useCallback((err: unknown): string => {
    if (err instanceof AdminError && err.status === 401) {
      setSignedOutNotice("Your session ended. Sign in again to carry on.");
      setPhase("signed-out");
    }
    return err instanceof AdminError ? err.message : "Something went wrong. Try again.";
  }, []);

  const load = useCallback(async () => {
    try {
      const doc = await getDocument();
      const merged = mergeContent(DEFAULT_CONTENT, doc.content);
      setDraft(merged);
      setSnapshot(snapshotOf(merged));
      setVersion(doc.version);
      setCv(merged.cv);
      setUpdatedAt(doc.updated_at);
      setLoadError(null);
      setPhase("signed-in");
    } catch (err) {
      const message = onAdminError(err);
      if (!(err instanceof AdminError && err.status === 401)) setLoadError(message);
    }
  }, [onAdminError]);

  useEffect(() => {
    let live = true;
    whoAmI()
      .then((ok) => {
        if (!live) return;
        if (ok) void load();
        else setPhase("signed-out");
      })
      .catch((err) => {
        if (!live) return;
        setLoadError(err instanceof AdminError ? err.message : "Could not reach the server.");
        setPhase("signed-out");
      });
    return () => {
      live = false;
    };
  }, [load]);

  // Closing the tab with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const result = await saveDocument(version, toDocument(draft));
      setVersion(result.version);
      setUpdatedAt(result.updated_at);
      setSnapshot(snapshotOf(draft));
      setNotice({ ok: true, text: "Saved. The site shows it within about half a minute." });
    } catch (err) {
      const stale = err instanceof AdminError && err.status === 409;
      setNotice({ ok: false, text: onAdminError(err), stale });
    } finally {
      setSaving(false);
    }
  }

  async function leave() {
    try {
      await signOut();
    } catch {
      // The cookie expires by itself; leaving the page is what matters.
    }
    setSignedOutNotice(null);
    setPhase("signed-out");
  }

  const set = <K extends keyof SiteContent>(key: K, value: SiteContent[K]) => setDraft((d) => ({ ...d, [key]: value }));

  /* ---------- the three screens ---------- */

  if (phase === "checking") {
    return (
      <div className="container page">
        <p>Checking your session...</p>
      </div>
    );
  }

  if (phase === "signed-out") {
    return (
      <div className="container page adm">
        <PageHead eyebrow="Admin" title="Sign in" lead="Change what the site says, from a form." />
        {loadError && (
          <p className="adm-error" role="alert">
            {loadError}
          </p>
        )}
        <LoginForm notice={signedOutNotice} onSignedIn={() => void load()} />
      </div>
    );
  }

  return (
    <div className="container page adm">
      <PageHead
        eyebrow="Admin"
        title="Edit the site"
        lead={
          <>
            Change the words and numbers, add a project, replace the CV. Press <strong>Save</strong> to publish.{" "}
            <Link to="/" className="text-link">
              View the site
            </Link>
          </>
        }
      />

      <div className="adm-bar">
        <p className="adm-status">
          {version === 0 ? "Nothing saved yet. The site is showing its built-in content." : `Version ${version} is live.`}
          {updatedAt && version > 0 && ` Saved ${new Date(updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`}
        </p>
        <button type="button" className="btn btn-ghost" onClick={leave}>
          Sign out
        </button>
      </div>

      <div className="adm-tabs" role="tablist" aria-label="What to edit">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`adm-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="adm-panel"
            className={tab === t.id ? "is-active" : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id="adm-panel" role="tabpanel" aria-labelledby={`adm-tab-${tab}`} className="adm-panel">
        {tab === "projects" && <ProjectsEditor value={draft.projects} onChange={(v) => set("projects", v)} />}
        {tab === "profile" && (
          <ProfileEditor
            availability={draft.availability}
            stats={draft.stats}
            onAvailability={(v) => set("availability", v)}
            onStats={(v) => set("stats", v)}
          />
        )}
        {tab === "experience" && (
          <ExperienceEditor job={draft.job} education={draft.education} onJob={(v) => set("job", v)} onEducation={(v) => set("education", v)} />
        )}
        {tab === "skills" && <SkillsEditor value={draft.skill_groups} onChange={(v) => set("skill_groups", v)} />}
        {tab === "journey" && <JourneyEditor value={draft.journey} onChange={(v) => set("journey", v)} />}
        {tab === "cv" && (
          <CvPanel
            cv={cv}
            onUploaded={(v, info) => {
              setVersion(v);
              setCv(info);
            }}
          />
        )}
        {tab === "history" && <HistoryPanel currentVersion={version} dirty={dirty} onRestored={() => void load()} />}
      </div>

      {/* Always in reach, so a change is never one scroll away from being saved. */}
      <div className="adm-save">
        <div>
          {notice && (
            <p className={notice.ok ? "adm-ok" : "adm-error"} role={notice.ok ? "status" : "alert"}>
              {notice.text}{" "}
              {notice.stale && (
                <button type="button" className="adm-link" onClick={() => void load()}>
                  Reload the latest (your edits here are lost)
                </button>
              )}
            </p>
          )}
          {!notice && dirty && <p className="adm-status">You have unsaved changes.</p>}
        </div>
        <div className="adm-save-actions">
          <button type="button" className="btn btn-ghost" disabled={!dirty || saving} onClick={() => void load()}>
            Discard changes
          </button>
          <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={save}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
