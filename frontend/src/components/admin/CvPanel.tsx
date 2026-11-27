import { useRef, useState } from "react";

import type { CvInfo } from "../../content/site";
import { AdminError, uploadCv } from "../../lib/adminApi";

const MAX_BYTES = 5 * 1024 * 1024;

const formatSize = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/* Replace the CV. The file goes straight to the API, which checks that it really
   is a PDF and not too large. Uploading is separate from saving the text: it takes
   effect on its own, and is kept in the version history. */
export default function CvPanel({ cv, onUploaded }: { cv: CvInfo | undefined; onUploaded: (version: number, cv: CvInfo) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function choose(selected: File | null) {
    setMessage(null);
    if (selected && selected.size > MAX_BYTES) {
      setFile(null);
      setMessage({ ok: false, text: "That file is larger than 5 MB. Export a smaller PDF." });
      return;
    }
    if (selected && selected.type !== "application/pdf" && !selected.name.toLowerCase().endsWith(".pdf")) {
      setFile(null);
      setMessage({ ok: false, text: "The CV must be a PDF." });
      return;
    }
    setFile(selected);
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await uploadCv(file);
      onUploaded(result.version, result.cv);
      setFile(null);
      if (input.current) input.current.value = "";
      setMessage({ ok: true, text: "Uploaded. The new CV is live at the download link now." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof AdminError ? err.message : "The upload failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adm-stack">
      <article className="adm-card">
        <h3>Current CV</h3>
        {cv ? (
          <p>
            Uploaded {formatDate(cv.updated_at)} · {formatSize(cv.size)}.{" "}
            <a href="/api/cv" target="_blank" rel="noopener" className="text-link">
              Open it
            </a>
          </p>
        ) : (
          <p>
            No CV has been uploaded yet, so the site is giving out the PDF that came with it.{" "}
            <a href="/api/cv" target="_blank" rel="noopener" className="text-link">
              Open it
            </a>
          </p>
        )}
      </article>

      <article className="adm-card">
        <h3>Upload a new CV</h3>
        <p className="adm-lead">A PDF, up to 5 MB. Every “Download CV” button on the site gives out the new file straight away. The old one is kept.</p>
        <div className="adm-upload">
          <input
            ref={input}
            type="file"
            accept="application/pdf,.pdf"
            aria-label="Choose a PDF"
            onChange={(e) => choose(e.target.files?.[0] ?? null)}
          />
          <button type="button" className="btn btn-primary" disabled={!file || busy} onClick={upload}>
            {busy ? "Uploading..." : "Upload"}
          </button>
        </div>
        {message && (
          <p className={message.ok ? "adm-ok" : "adm-error"} role={message.ok ? "status" : "alert"}>
            {message.text}
          </p>
        )}
      </article>
    </div>
  );
}
