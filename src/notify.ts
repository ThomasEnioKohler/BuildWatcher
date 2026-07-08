import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { BuildRun, RunStatus } from "./types";

let granted: boolean | null = null;

async function ensurePermission(): Promise<boolean> {
  if (granted === null) {
    granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
  }
  return granted;
}

export const RESULT_LABEL: Record<RunStatus, string> = {
  success: "✅ erfolgreich",
  failure: "❌ fehlgeschlagen",
  cancelled: "⚪ abgebrochen",
  running: "läuft",
  queued: "wartet",
  unknown: "unbekannt",
};

/** Ersetzt {repo} {branch} {workflow} {result} im Template. */
export function formatMessage(template: string, repoName: string, run: BuildRun): string {
  return template
    .replaceAll("{repo}", repoName)
    .replaceAll("{branch}", run.branch)
    .replaceAll("{workflow}", run.workflow)
    .replaceAll("{result}", RESULT_LABEL[run.status]);
}

export async function notify(title: string, body: string) {
  if (await ensurePermission()) {
    sendNotification({ title, body });
  }
}
