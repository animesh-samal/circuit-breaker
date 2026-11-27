import { useEffect, useState } from "react";

import { AdminError, getHistory, restoreVersion, type HistoryItem } from "../../lib/adminApi";

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/* Every saved version, newest first. Restoring one saves it as a new version on
   top, so nothing in the list is ever rewritten or lost. */
export default function HistoryPanel({
  currentVersion,
  dirty,
  onRestored,
}: {
  currentVersion: number;
  dirty: boolean;
  onRestored: () => void;
}) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getHistory()
      .then((r) => live && setItems(r.versions))
      .catch((err) => live && setError(err instanceof AdminError ? err.message : "Could not load the history."));
    return () => {
      live = false;
    };
  }, [currentVersion]);

  async function restore(version: number) {
    setBusy(true);
    setError(null);
    try {
      await restoreVersion(version, currentVersion);
      setConfirming(null);
      onRestored();
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Could not restore that version.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !items) return <p className="adm-error">{error}</p>;
  if (!items) return <p>Loading the history...</p>;
  if (items.length === 0) return <p className="adm-empty">Nothing has been saved yet.</p>;

  return (
    <div className="adm-stack">
      <p className="adm-lead">
        Restoring a version saves it as a new one. {dirty && <strong>You have unsaved changes; restoring replaces them.</strong>}
      </p>
      {error && <p className="adm-error" role="alert">{error}</p>}
      <ul className="adm-history">
        {items.map((item) => (
          <li key={item.version}>
            <div>
              <strong>Version {item.version}</strong>
              {item.version === currentVersion && <span className="adm-pill">Live</span>}
              <p className="adm-sub">{formatDate(item.updated_at)}</p>
            </div>
            {item.version !== currentVersion &&
              (confirming === item.version ? (
                <div className="adm-card-actions">
                  <button type="button" className="adm-mini adm-mini--danger" disabled={busy} onClick={() => restore(item.version)}>
                    {busy ? "Restoring..." : "Yes, restore"}
                  </button>
                  <button type="button" className="adm-mini" onClick={() => setConfirming(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button type="button" className="adm-mini" onClick={() => setConfirming(item.version)}>
                  Restore
                </button>
              ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
