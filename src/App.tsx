import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import type {
  Connection,
  MessageSettings,
  RepoConfig,
  RunStatus,
} from "./types";
import { DEFAULT_SETTINGS } from "./types";
import {
  loadConnections,
  loadRepos,
  loadSettings,
  saveConnections,
  saveRepos,
  saveSettings,
} from "./config";
import { cancelRun, listRuns } from "./providers";
import { formatMessage, notify } from "./notify";
import { initTray, updateTray } from "./tray";
import { checkForUpdate, type UpdateInfo } from "./updater";
import { overallStatus, overallTooltip, type RepoState } from "./monitor";
import Dashboard from "./components/Dashboard";
import Connections from "./components/Connections";
import Repos from "./components/Repos";
import Settings from "./components/Settings";

type Tab = "dashboard" | "repos" | "connections" | "settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [repos, setRepos] = useState<RepoConfig[]>([]);
  const [settings, setSettings] = useState<MessageSettings>(DEFAULT_SETTINGS);
  const [states, setStates] = useState<RepoState[]>([]);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const [version, setVersion] = useState("");
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);

  // Run-Status-Gedächtnis für Notification-Diffs
  const seenRuns = useRef(new Map<string, RunStatus>());
  const initializedRepos = useRef(new Set<string>());
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Initial laden + Tray + Fenster-schließen = verstecken
  useEffect(() => {
    (async () => {
      const [c, r, s] = await Promise.all([
        loadConnections(),
        loadRepos(),
        loadSettings(),
      ]);
      setConnections(c);
      setRepos(r);
      setSettings(s);
      setVersion(await getVersion());
      await initTray();
      setUpdate(await checkForUpdate());
    })();
    // Update-Check zusätzlich alle 4 Stunden (App läuft oft lange im Tray)
    const updateTimer = setInterval(async () => {
      const u = await checkForUpdate();
      if (u) setUpdate(u);
    }, 4 * 60 * 60 * 1000);
    const unlisten = getCurrentWindow().onCloseRequested(async (e) => {
      e.preventDefault();
      await getCurrentWindow().hide();
    });
    return () => {
      unlisten.then((f) => f());
      clearInterval(updateTimer);
    };
  }, []);

  const poll = useCallback(async (repoList: RepoConfig[], connList: Connection[]) => {
    const s = settingsRef.current;
    const results: RepoState[] = await Promise.all(
      repoList.map(async (repo): Promise<RepoState> => {
        const conn = connList.find((c) => c.id === repo.connectionId);
        if (!conn) return { repo, runs: [], error: "Verbindung fehlt" };
        try {
          let runs = await listRuns(conn, repo.name);
          if (repo.branch) runs = runs.filter((r) => r.branch === repo.branch);
          return { repo, runs };
        } catch (e: any) {
          return { repo, runs: [], error: String(e?.message ?? e) };
        }
      })
    );

    // Notifications: Diff gegen letzten bekannten Stand
    for (const st of results) {
      const initialized = initializedRepos.current.has(st.repo.id);
      for (const run of st.runs) {
        const key = `${st.repo.id}:${run.id}`;
        const prev = seenRuns.current.get(key);
        const isActive = run.status === "running" || run.status === "queued";
        const isDone =
          run.status === "success" ||
          run.status === "failure" ||
          run.status === "cancelled";

        if (initialized) {
          if (prev === undefined && isActive && s.notifyStart) {
            notify("BuildWatcher", formatMessage(s.startTemplate, st.repo.name, run));
          }
          const wasActive = prev === "running" || prev === "queued";
          if ((wasActive || prev === undefined) && isDone && s.notifyFinish) {
            notify("BuildWatcher", formatMessage(s.finishTemplate, st.repo.name, run));
          }
        }
        seenRuns.current.set(key, run.status);
      }
      initializedRepos.current.add(st.repo.id);
    }

    setStates(results);
    setLastPoll(new Date());
    await updateTray(overallStatus(results), overallTooltip(results));
  }, []);

  // Poll-Loop
  useEffect(() => {
    if (!repos.length) {
      updateTray("gray", "BuildWatcher – keine Repos konfiguriert").catch(() => {});
      setStates([]);
      return;
    }
    poll(repos, connections);
    const t = setInterval(
      () => poll(repos, connections),
      Math.max(10, settings.pollSeconds) * 1000
    );
    return () => clearInterval(t);
  }, [repos, connections, settings.pollSeconds, poll]);

  const handleCancelRun = async (repo: RepoConfig, runId: string): Promise<string | null> => {
    const conn = connections.find((c) => c.id === repo.connectionId);
    if (!conn) return "Verbindung fehlt";
    try {
      await cancelRun(conn, repo.name, runId);
      setTimeout(() => poll(repos, connections), 2000);
      return null;
    } catch (e: any) {
      return String(e?.message ?? e);
    }
  };

  const updateConnections = async (c: Connection[]) => {
    setConnections(c);
    await saveConnections(c);
  };
  const updateRepos = async (r: RepoConfig[]) => {
    setRepos(r);
    await saveRepos(r);
  };
  const updateSettings = async (s: MessageSettings) => {
    setSettings(s);
    await saveSettings(s);
  };

  return (
    <div className="app">
      <nav>
        <h1>
          <span className="logo" /> BuildWatcher
        </h1>
        {(
          [
            ["dashboard", "Dashboard"],
            ["repos", "Repos"],
            ["connections", "Verbindungen"],
            ["settings", "Einstellungen"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
        {version && <div className="version">v{version}</div>}
      </nav>
      <main>
        {update && (
          <div className="update-banner">
            <span>
              🚀 Update <strong>v{update.version}</strong> verfügbar
              {update.notes ? ` – ${update.notes}` : ""}
            </span>
            <span className="row-buttons">
              <button
                className="primary"
                disabled={installing}
                onClick={async () => {
                  setInstalling(true);
                  try {
                    await update.install();
                  } catch (e) {
                    console.error(e);
                    setInstalling(false);
                  }
                }}
              >
                {installing ? "Installiere…" : "Installieren & neu starten"}
              </button>
              <button disabled={installing} onClick={() => setUpdate(null)}>
                Später
              </button>
            </span>
          </div>
        )}
        {tab === "dashboard" && (
          <Dashboard
            states={states}
            lastPoll={lastPoll}
            onRefresh={() => poll(repos, connections)}
            onCancelRun={handleCancelRun}
          />
        )}
        {tab === "repos" && (
          <Repos repos={repos} connections={connections} onChange={updateRepos} />
        )}
        {tab === "connections" && (
          <Connections connections={connections} onChange={updateConnections} />
        )}
        {tab === "settings" && (
          <Settings
            settings={settings}
            onChange={updateSettings}
            onUpdateFound={setUpdate}
          />
        )}
      </main>
    </div>
  );
}
