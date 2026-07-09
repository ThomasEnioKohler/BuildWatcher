import { useEffect, useState } from "react";
import {
  branchCounts,
  estimateDurationSec,
  overallStatus,
  repoStatus,
  type RepoState,
} from "../monitor";
import { RESULT_LABEL } from "../notify";
import type { BuildRun, OverallStatus, RepoConfig, RunDetails } from "../types";
import BuildDetails from "./BuildDetails";

interface Props {
  states: RepoState[];
  lastPoll: Date | null;
  pollSeconds: number;
  onRefresh: () => void;
  /** Gibt null bei Erfolg zurück, sonst eine Fehlermeldung. */
  onCancelRun: (repo: RepoConfig, runId: string) => Promise<string | null>;
  loadDetails: (repo: RepoConfig, runId: string) => Promise<RunDetails>;
}

function fmtShort(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} s`;
  return `${Math.round(sec / 60)} min`;
}

/** Fortschrittsbalken für einen laufenden Build, geschätzt aus der Historie. */
function RunProgress({ run, history }: { run: BuildRun; history: BuildRun[] }) {
  const est = estimateDurationSec(history, run.workflow);
  const elapsed = run.startedAt
    ? (Date.now() - new Date(run.startedAt).getTime()) / 1000
    : null;
  if (est && elapsed !== null && elapsed >= 0) {
    const pct = Math.min(97, Math.round((elapsed / est) * 100));
    const remaining = Math.max(0, est - elapsed);
    return (
      <span className="progress-wrap">
        <span className="progress">
          <span className="progress-fill" style={{ width: `${pct}%` }} />
        </span>
        <span className="muted progress-text">
          {pct}% · noch ~{fmtShort(remaining)}
        </span>
      </span>
    );
  }
  return (
    <span className="progress-wrap">
      <span className="progress">
        <span className="progress-fill indeterminate" />
      </span>
      {elapsed !== null && (
        <span className="muted progress-text">läuft seit {fmtShort(elapsed)}</span>
      )}
    </span>
  );
}

const BANNER: Record<OverallStatus, string> = {
  green: "✅ Alles grün",
  yellow: "🟡 Builds laufen",
  red: "🔴 Achtung – fehlgeschlagene Builds",
  gray: "Keine Daten",
};

function formatDuration(run: BuildRun): string | null {
  if (!run.startedAt || !run.finishedAt) return null;
  const sec = Math.round(
    (new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000
  );
  if (sec < 0) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m} min ${s} s` : `${s} s`;
}

/** Build-Punkt mit Detail-Tooltip beim Hover. */
function RunDot({ run, onOpen }: { run: BuildRun; onOpen: () => void }) {
  const duration = formatDuration(run);
  return (
    <span className="dot-wrap">
      <span className={`dot small ${run.status}`} onClick={onOpen} />
      <span className="dot-tip">
        <strong>{run.workflow}</strong>
        <span className={`tip-status ${run.status}`}>{RESULT_LABEL[run.status]}</span>
        <span>Branch: {run.branch}</span>
        {run.startedAt && <span>Start: {new Date(run.startedAt).toLocaleString()}</span>}
        {duration && <span>Dauer: {duration}</span>}
        <span className="muted">Klicken für Details</span>
      </span>
    </span>
  );
}

/** Gruppiert Runs nach Branch; Branches nach neuestem Run sortiert. */
function groupByBranch(runs: BuildRun[]): [string, BuildRun[]][] {
  const map = new Map<string, BuildRun[]>();
  for (const r of runs) {
    const list = map.get(r.branch) ?? [];
    list.push(r);
    map.set(r.branch, list);
  }
  return [...map.entries()];
}

export default function Dashboard({
  states,
  lastPoll,
  pollSeconds,
  onRefresh,
  onCancelRun,
  loadDetails,
}: Props) {
  const overall = overallStatus(states);
  const counts = branchCounts(states);
  const [selected, setSelected] = useState<{ repo: RepoConfig; run: BuildRun } | null>(
    null
  );

  // Sekündlicher Tick, damit Fortschrittsbalken laufender Builds vorrücken
  const anyRunning = states.some((s) =>
    s.runs.some((r) => r.status === "running" || r.status === "queued")
  );
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [anyRunning]);

  return (
    <div>
      <div className={`banner ${overall}`}>
        <span>{BANNER[overall]}</span>
        <span className="muted">
          {lastPoll ? `Stand ${lastPoll.toLocaleTimeString()}` : ""}
          <button onClick={onRefresh} style={{ marginLeft: 12 }}>
            Aktualisieren
          </button>
        </span>
      </div>

      {states.length > 0 && (
        <div className="statusbar">
          <span className="sb-ok">● {counts.ok} ok</span>
          <span className="sb-run">● {counts.running} laufend</span>
          <span className="sb-fail">● {counts.failed} fehlgeschlagen</span>
          <span className="muted">
            {states.length} {states.length === 1 ? "Repo" : "Repos"} · Poll alle{" "}
            {pollSeconds} s
          </span>
        </div>
      )}

      {!states.length && (
        <p className="muted">
          Keine Repos konfiguriert. Unter „Verbindungen" anmelden, dann unter „Repos"
          Repositories hinzufügen.
        </p>
      )}

      {states.map((st) => {
        const status = st.error ? "red" : repoStatus(st.runs);
        return (
          <div key={st.repo.id} className={`repo-card ${status}`}>
            <div className="repo-head">
              <span className={`dot ${status}`} />
              <strong className="mono">{st.repo.name}</strong>
              {st.repo.branch && <span className="tag">Filter: {st.repo.branch}</span>}
            </div>
            {st.error ? (
              <p className="error">{st.error}</p>
            ) : !st.runs.length ? (
              <p className="muted">Keine Builds gefunden</p>
            ) : (
              groupByBranch(st.runs).map(([branch, runs]) => {
                const latest = runs[0];
                const branchStat = repoStatus(runs);
                return (
                  <div key={branch} className="branch-row">
                    <span className={`dot small ${branchStat}`} />
                    <span className="branch-name mono">{branch}</span>
                    <div className="history">
                      {runs.slice(0, 15).map((r) => (
                        <RunDot
                          key={r.id}
                          run={r}
                          onOpen={() => setSelected({ repo: st.repo, run: r })}
                        />
                      ))}
                    </div>
                    <a
                      className="branch-latest"
                      onClick={() => setSelected({ repo: st.repo, run: latest })}
                    >
                      {latest.workflow} · {RESULT_LABEL[latest.status]}
                    </a>
                    {(latest.status === "running" || latest.status === "queued") && (
                      <RunProgress run={latest} history={runs} />
                    )}
                  </div>
                );
              })
            )}
          </div>
        );
      })}

      {selected && (
        <BuildDetails
          repo={selected.repo}
          run={selected.run}
          loadDetails={loadDetails}
          onCancel={onCancelRun}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
