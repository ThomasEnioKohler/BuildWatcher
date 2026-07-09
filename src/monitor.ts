import type { BuildRun, OverallStatus, RepoConfig } from "./types";

export interface RepoState {
  repo: RepoConfig;
  runs: BuildRun[];
  error?: string;
}

/** Status eines einzelnen Repos: rot wenn letzter abgeschlossener Run fehlschlug,
 *  gelb wenn aktuell etwas läuft, sonst grün. */
export function repoStatus(runs: BuildRun[]): OverallStatus {
  if (!runs.length) return "gray";
  const latestCompleted = runs.find(
    (r) => r.status === "success" || r.status === "failure" || r.status === "cancelled"
  );
  const anyRunning = runs.some((r) => r.status === "running" || r.status === "queued");
  if (latestCompleted?.status === "failure") return "red";
  if (anyRunning) return "yellow";
  if (latestCompleted?.status === "success") return "green";
  return "gray";
}

/** Aggregierter Status über alle Repos: rot > gelb > grün > grau. */
export function overallStatus(states: RepoState[]): OverallStatus {
  const all = states.map((s) => (s.error ? "red" : repoStatus(s.runs)));
  if (all.includes("red")) return "red";
  if (all.includes("yellow")) return "yellow";
  if (all.includes("green")) return "green";
  return "gray";
}

/** Zählt die Status der neuesten Runs pro Branch über alle Repos. */
export function branchCounts(states: RepoState[]): {
  ok: number;
  running: number;
  failed: number;
} {
  const counts = { ok: 0, running: 0, failed: 0 };
  for (const st of states) {
    const seen = new Set<string>();
    for (const run of st.runs) {
      if (seen.has(run.branch)) continue;
      seen.add(run.branch);
      if (run.status === "running" || run.status === "queued") counts.running++;
      else if (run.status === "failure") counts.failed++;
      else if (run.status === "success") counts.ok++;
    }
  }
  return counts;
}

/** Geschätzte Build-Dauer in Sekunden – Durchschnitt der letzten erfolgreichen
 *  Läufe desselben Workflows (max. 5). null, wenn keine Historie vorhanden. */
export function estimateDurationSec(runs: BuildRun[], workflow: string): number | null {
  const durations = runs
    .filter(
      (r) =>
        r.status === "success" && r.workflow === workflow && r.startedAt && r.finishedAt
    )
    .slice(0, 5)
    .map(
      (r) =>
        (new Date(r.finishedAt!).getTime() - new Date(r.startedAt!).getTime()) / 1000
    )
    .filter((s) => s > 0);
  if (!durations.length) return null;
  return durations.reduce((a, b) => a + b, 0) / durations.length;
}

export function overallTooltip(states: RepoState[]): string {
  if (!states.length) return "BuildWatcher – keine Repos konfiguriert";
  const red = states.filter((s) => s.error || repoStatus(s.runs) === "red").length;
  const running = states.filter((s) => repoStatus(s.runs) === "yellow").length;
  const parts = [`${states.length} Repos`];
  if (red) parts.push(`${red} rot`);
  if (running) parts.push(`${running} laufend`);
  if (!red && !running) parts.push("alles grün");
  return `BuildWatcher – ${parts.join(", ")}`;
}
