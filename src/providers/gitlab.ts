import { fetch } from "@tauri-apps/plugin-http";
import type {
  BuildRun,
  Connection,
  DeviceFlowInfo,
  JobInfo,
  RunDetails,
  RunStatus,
} from "../types";

/** Startet den OAuth Device Flow (GitLab ≥ 17.2, auch self-hosted). */
export async function startDeviceFlow(
  host: string,
  clientId: string
): Promise<DeviceFlowInfo> {
  const r = await fetch(`${host}/oauth/authorize_device`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, scope: "api" }),
  });
  if (!r.ok) throw new Error(`GitLab Device Flow fehlgeschlagen (HTTP ${r.status})`);
  const d = await r.json();
  if (d.error) throw new Error(d.error_description ?? d.error);
  return {
    deviceCode: d.device_code,
    userCode: d.user_code,
    verificationUri: d.verification_uri_complete ?? d.verification_uri,
    interval: d.interval ?? 5,
    expiresIn: d.expires_in ?? 900,
  };
}

export async function pollDeviceFlow(
  host: string,
  clientId: string,
  deviceCode: string
): Promise<{ token: string | null; slowDown: boolean }> {
  const r = await fetch(`${host}/oauth/token`, {
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
  const r = await fetch(`${conn.host}/api/v4/user`, {
    headers: { Authorization: `Bearer ${conn.token}` },
  });
  if (!r.ok) return "";
  return (await r.json()).username ?? "";
}

/** Details einer Pipeline inkl. Jobs. */
export async function getRunDetails(
  conn: Connection,
  repoName: string,
  runId: string
): Promise<RunDetails> {
  const proj = encodeURIComponent(repoName);
  const headers = { Authorization: `Bearer ${conn.token}` };
  const [pipeRes, jobsRes] = await Promise.all([
    fetch(`${conn.host}/api/v4/projects/${proj}/pipelines/${runId}`, { headers }),
    fetch(`${conn.host}/api/v4/projects/${proj}/pipelines/${runId}/jobs?per_page=50`, {
      headers,
    }),
  ]);
  if (!pipeRes.ok) throw new Error(`GitLab API ${pipeRes.status}`);
  const p = await pipeRes.json();
  const jobs: JobInfo[] = jobsRes.ok
    ? (await jobsRes.json()).map(
        (j: any): JobInfo => ({
          name: j.name,
          stage: j.stage,
          status: mapStatus(j.status),
          durationSec: j.duration ? Math.round(j.duration) : undefined,
          url: j.web_url,
        })
      )
    : [];
  return {
    trigger: p.source,
    number: `#${p.iid ?? p.id}`,
    author: p.user?.username ?? p.user?.name,
    commitSha: p.sha,
    jobs,
  };
}

/** Bricht eine laufende Pipeline ab. Benötigt Scope „api" (nicht nur read_api). */
export async function cancelRun(
  conn: Connection,
  repoName: string,
  runId: string
): Promise<void> {
  const proj = encodeURIComponent(repoName);
  const r = await fetch(
    `${conn.host}/api/v4/projects/${proj}/pipelines/${runId}/cancel`,
    { method: "POST", headers: { Authorization: `Bearer ${conn.token}` } }
  );
  if (!r.ok) {
    if (r.status === 403)
      throw new Error(
        "Keine Berechtigung – die Verbindung braucht den Scope 'api'. Bitte neu anmelden."
      );
    throw new Error(`Abbrechen fehlgeschlagen (HTTP ${r.status})`);
  }
}

/** Alle Projekte, in denen der Benutzer Mitglied ist – max. 300, nach Aktivität sortiert. */
export async function listRepos(conn: Connection): Promise<string[]> {
  const names: string[] = [];
  for (let page = 1; page <= 3; page++) {
    const r = await fetch(
      `${conn.host}/api/v4/projects?membership=true&per_page=100&page=${page}&order_by=last_activity_at`,
      { headers: { Authorization: `Bearer ${conn.token}` } }
    );
    if (!r.ok) throw new Error(`GitLab API ${r.status} beim Laden der Projekte`);
    const d = await r.json();
    names.push(...d.map((p: any) => p.path_with_namespace as string));
    if (d.length < 100) break;
  }
  return names;
}

function mapStatus(s: string): RunStatus {
  switch (s) {
    case "success":
      return "success";
    case "failed":
      return "failure";
    case "canceled":
    case "skipped":
      return "cancelled";
    case "running":
      return "running";
    case "pending":
    case "created":
    case "waiting_for_resource":
    case "preparing":
    case "scheduled":
      return "queued";
    default:
      return "unknown";
  }
}

/** Letzte Pipelines eines Projekts ("group/project"). */
export async function listRuns(conn: Connection, repoName: string): Promise<BuildRun[]> {
  const proj = encodeURIComponent(repoName);
  const r = await fetch(
    `${conn.host}/api/v4/projects/${proj}/pipelines?per_page=20`,
    { headers: { Authorization: `Bearer ${conn.token}` } }
  );
  if (!r.ok) throw new Error(`GitLab API ${r.status} für ${repoName}`);
  const d = await r.json();
  return (d ?? []).map(
    (p: any): BuildRun => ({
      id: String(p.id),
      branch: p.ref ?? "?",
      workflow: `Pipeline #${p.iid ?? p.id}`,
      status: mapStatus(p.status),
      url: p.web_url,
      startedAt: p.created_at,
      finishedAt: p.updated_at,
    })
  );
}
