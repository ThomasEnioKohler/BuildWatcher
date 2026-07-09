import type { BuildRun, Connection } from "../types";
import * as github from "./github";
import * as gitlab from "./gitlab";

/** Gemeinsames Provider-Interface – weitere CI-Systeme hier ergänzen. */
export function listRuns(conn: Connection, repoName: string): Promise<BuildRun[]> {
  return conn.provider === "github"
    ? github.listRuns(conn, repoName)
    : gitlab.listRuns(conn, repoName);
}

export function cancelRun(
  conn: Connection,
  repoName: string,
  runId: string
): Promise<void> {
  return conn.provider === "github"
    ? github.cancelRun(conn, repoName, runId)
    : gitlab.cancelRun(conn, repoName, runId);
}

export function listRepos(conn: Connection): Promise<string[]> {
  return conn.provider === "github" ? github.listRepos(conn) : gitlab.listRepos(conn);
}

export function fetchUsername(conn: Connection): Promise<string> {
  return conn.provider === "github"
    ? github.fetchUsername(conn)
    : gitlab.fetchUsername(conn);
}

export { github, gitlab };
