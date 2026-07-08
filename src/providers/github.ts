import { fetch } from "@tauri-apps/plugin-http";
import type { BuildRun, Connection, DeviceFlowInfo, RunStatus } from "../types";

/** Startet den OAuth Device Flow (GitHub). Die OAuth-App muss Device Flow aktiviert haben. */
export async function startDeviceFlow(clientId: string): Promise<DeviceFlowInfo> {
  const r = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, scope: "repo" }),
  });
  if (!r.ok) throw new Error(`GitHub Device Flow fehlgeschlagen (HTTP ${r.status})`);
  const d = await r.json();
  if (d.error) throw new Error(d.error_description ?? d.error);
  return {
    deviceCode: d.device_code,
    userCode: d.user_code,
    verificationUri: d.verification_uri,
    interval: d.interval ?? 5,
    expiresIn: d.expires_in ?? 900,
  };
}

/** Ein Poll-Versuch. Gibt Token zurück, null bei "authorization_pending", wirft bei Fehlern. */
export async function pollDeviceFlow(
  clientId: string,
  deviceCode: string
): Promise<{ token: string | null; slowDown: boolean }> {
  const r = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });
  const d = await r.json();
  if (d.access_token) return { token: d.access_token, slowDown: false };
  if (d.error === "authorization_pending") return { token: null, slowDown: false };
  if (d.error === "slow_down") return { token: null, slowDown: true };
  throw new Error(d.error_description ?? d.error ?? "Unbekannter Fehler");
}

export async function fetchUsername(conn: Connection): Promise<string> {
  const r = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${conn.token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!r.ok) return "";
  return (await r.json()).login ?? "";
}

/** Alle Repos des Benutzers (eigene, Collaborator, Organisationen) – max. 300, nach Aktivität sortiert. */
export async function listRepos(conn: Connection): Promise<string[]> {
  const names: string[] = [];
  for (let page = 1; page <= 3; page++) {
    const r = await fetch(
      `https://api.github.com/user/repos?per_page=100&page=${page}&sort=pushed`,
      {
        headers: {
          Authorization: `Bearer ${conn.token}`,
          Accept: "application/vnd.github+json",
        },
      }
    );
    if (!r.ok) throw new Error(`GitHub API ${r.status} beim Laden der Repos`);
    const d = await r.json();
    names.push(...d.map((repo: any) => repo.full_name as string));
    if (d.length < 100) break;
  }
  return names;
}

function mapStatus(run: { status: string; conclusion: string | null }): RunStatus {
  if (run.status === "completed") {
    switch (run.conclusion) {
      case "success":
        return "success";
      case "cancelled":
      case "skipped":
        return "cancelled";
      case null:
        return "unknown";
      default:
        return "failure"; // failure, timed_out, action_required, ...
    }
  }
  if (run.status === "queued" || run.status === "waiting" || run.status === "pending")
    return "queued";
  return "running"; // in_progress
}

/** Letzte Workflow-Runs eines Repos ("owner/repo"). */
export async function listRuns(conn: Connection, repoName: string): Promise<BuildRun[]> {
  const r = await fetch(
    `https://api.github.com/repos/${repoName}/actions/runs?per_page=20`,
    {
      headers: {
        Authorization: `Bearer ${conn.token}`,
        Accept: "application/vnd.github+json",
      },
    }
  );
  if (!r.ok) throw new Error(`GitHub API ${r.status} für ${repoName}`);
  const d = await r.json();
  return (d.workflow_runs ?? []).map(
    (run: any): BuildRun => ({
      id: String(run.id),
      branch: run.head_branch ?? "?",
      workflow: run.name ?? "Workflow",
      status: mapStatus(run),
      url: run.html_url,
      startedAt: run.run_started_at,
      finishedAt: run.status === "completed" ? run.updated_at : undefined,
    })
  );
}
