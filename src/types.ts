export type Provider = "github" | "gitlab";

export interface Connection {
  id: string;
  provider: Provider;
  /** Basis-URL, z. B. https://github.com oder https://gitlab.com (auch self-hosted) */
  host: string;
  clientId: string;
  token: string;
  username?: string;
}

export interface RepoConfig {
  id: string;
  connectionId: string;
  /** GitHub: "owner/repo" – GitLab: "group/project" */
  name: string;
  /** Optionaler Branch-Filter; leer = alle Branches */
  branch?: string;
}

export type RunStatus =
  | "running"
  | "queued"
  | "success"
  | "failure"
  | "cancelled"
  | "unknown";

export interface BuildRun {
  id: string;
  branch: string;
  workflow: string;
  status: RunStatus;
  url: string;
  startedAt?: string;
  finishedAt?: string;
}

export type OverallStatus = "green" | "yellow" | "red" | "gray";

export interface MessageSettings {
  notifyStart: boolean;
  notifyFinish: boolean;
  /** Platzhalter: {repo} {branch} {workflow} {result} */
  startTemplate: string;
  finishTemplate: string;
  pollSeconds: number;
}

export const DEFAULT_SETTINGS: MessageSettings = {
  notifyStart: true,
  notifyFinish: true,
  startTemplate: "🔨 Build gestartet: {repo} ({branch}) – {workflow}",
  finishTemplate: "Build beendet: {repo} ({branch}) – {result}",
  pollSeconds: 30,
};

export interface JobInfo {
  name: string;
  stage?: string;
  status: RunStatus;
  durationSec?: number;
  url: string;
}

export interface RunDetails {
  /** Auslöser, z. B. push, pull_request, schedule */
  trigger?: string;
  /** Run-/Pipeline-Nummer */
  number?: string;
  /** Wer den Build ausgelöst hat */
  author?: string;
  commitSha?: string;
  commitMessage?: string;
  jobs: JobInfo[];
}

export interface DeviceFlowInfo {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresIn: number;
}
