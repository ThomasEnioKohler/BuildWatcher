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
