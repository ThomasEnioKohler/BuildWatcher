import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { BuildRun, RepoConfig, RunDetails } from "../types";
import { RESULT_LABEL } from "../notify";

interface Props {
  repo: RepoConfig;
  run: BuildRun;
  loadDetails: (repo: RepoConfig, runId: string) => Promise<RunDetails>;
  /** Gibt null bei Erfolg zurück, sonst eine Fehlermeldung. */
  onCancel: (repo: RepoConfig, runId: string) => Promise<string | null>;
  onClose: () => void;
}

function fmtDuration(sec?: number): string {
  if (sec === undefined) return "–";
  const m = Math.floor(sec / 60);
  return m ? `${m} min ${sec % 60} s` : `${sec} s`;
}

export default function BuildDetails({ repo, run, loadDetails, onCancel, onClose }: Props) {
  const [details, setDetails] = useState<RunDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    loadDetails(repo, run.id)
      .then(setDetails)
      .catch((e) => setError(String(e?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.id]);

  const isActive = run.status === "running" || run.status === "queued";

  async function cancel() {
    setCancelling(true);
    setCancelError(null);
    const err = await onCancel(repo, run.id);
    if (err) {
      setCancelError(err);
      setCancelling(false);
    } else {
      onClose();
    }
  }

  const runDuration =
    run.startedAt && run.finishedAt
      ? Math.round(
          (new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000
        )
      : undefined;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className={`dot ${run.status}`} />
          <div>
            <strong>{run.workflow}</strong>
            {details?.number && <span className="muted"> {details.number}</span>}
            <div className="muted mono" style={{ fontSize: 12 }}>
              {repo.name}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} title="Schließen">
            ✕
          </button>
        </div>

        <div className="detail-grid">
          <span className="muted">Status</span>
          <span className={`tip-status ${run.status}`}>{RESULT_LABEL[run.status]}</span>
          <span className="muted">Branch</span>
          <span className="mono">{run.branch}</span>
          {details?.trigger && (
            <>
              <span className="muted">Auslöser</span>
              <span>{details.trigger}</span>
            </>
          )}
          {details?.author && (
            <>
              <span className="muted">Gestartet von</span>
              <span>@{details.author}</span>
            </>
          )}
          {details?.commitSha && (
            <>
              <span className="muted">Commit</span>
              <span className="mono">
                {details.commitSha.slice(0, 8)}
                {details.commitMessage ? ` – ${details.commitMessage}` : ""}
              </span>
            </>
          )}
          {run.startedAt && (
            <>
              <span className="muted">Start</span>
              <span>{new Date(run.startedAt).toLocaleString()}</span>
            </>
          )}
          <span className="muted">Dauer</span>
          <span>{isActive ? "läuft…" : fmtDuration(runDuration)}</span>
        </div>

        <h3 style={{ marginTop: 18 }}>Jobs</h3>
        {error && <p className="error">{error}</p>}
        {!details && !error && <p className="muted">Lade Details…</p>}
        {details && !details.jobs.length && <p className="muted">Keine Jobs gefunden.</p>}
        {details && details.jobs.length > 0 && (
          <ul className="job-list">
            {details.jobs.map((j, i) => (
              <li key={i} onClick={() => openUrl(j.url)}>
                <span className={`dot small ${j.status}`} />
                <span className="job-name">
                  {j.stage ? `${j.stage} / ` : ""}
                  {j.name}
                </span>
                <span className="muted">{fmtDuration(j.durationSec)}</span>
              </li>
            ))}
          </ul>
        )}

        {cancelError && <p className="error">Abbrechen fehlgeschlagen: {cancelError}</p>}

        <div className="modal-actions">
          {isActive && (
            <button className="danger" disabled={cancelling} onClick={cancel}>
              {cancelling ? "Breche ab…" : "✕ Build abbrechen"}
            </button>
          )}
          <button onClick={() => openUrl(run.url)}>Im Browser öffnen</button>
          <button onClick={onClose}>Schließen</button>
        </div>
      </div>
    </div>
  );
}
