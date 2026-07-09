import { useState } from "react";
import { repoStatus, type RepoState } from "../monitor";
import { RESULT_LABEL } from "../notify";
import type { BuildRun, OverallStatus, RepoConfig, RunDetails } from "../types";
import { overallStatus } from "../monitor";
import BuildDetails from "./BuildDetails";

interface Props {
  states: RepoState[];
  lastPoll: Date | null;
  onRefresh: () => void;
  /** Gibt null bei Erfolg zurück, sonst eine Fehlermeldung. */
  onCancelRun: (repo: RepoConfig, runId: string) => Promise<string | null>;
  loadDetails: (repo: RepoConfig, runId: string) => Promise<RunDetails>;
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
  onRefresh,
  onCancelRun,
  loadDetails,
}: Props) {
  const overall = overallStatus(states);
  const [selected, setSelected] = useState<{ repo: RepoConfig; run: BuildRun } | null>(
    null
  );

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
