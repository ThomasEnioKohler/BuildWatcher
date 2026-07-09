import { useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Connection, DeviceFlowInfo, Provider } from "../types";
import { uid } from "../config";
import { fetchUsername, github, gitlab } from "../providers";

interface Props {
  connections: Connection[];
  onChange: (c: Connection[]) => void;
}

type FlowState =
  | { phase: "idle" }
  | { phase: "waiting"; info: DeviceFlowInfo }
  | { phase: "error"; message: string };

export default function Connections({ connections, onChange }: Props) {
  const [provider, setProvider] = useState<Provider>("github");
  const [host, setHost] = useState("https://gitlab.com");
  const [clientId, setClientId] = useState("");
  const [flow, setFlow] = useState<FlowState>({ phase: "idle" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const cancelled = useRef(false);

  const effectiveHost = provider === "github" ? "https://github.com" : host.replace(/\/+$/, "");

  async function startLogin() {
    if (!clientId.trim()) {
      setFlow({ phase: "error", message: "Client-ID der OAuth-App eingeben." });
      return;
    }
    cancelled.current = false;
    try {
      const info =
        provider === "github"
          ? await github.startDeviceFlow(clientId.trim())
          : await gitlab.startDeviceFlow(effectiveHost, clientId.trim());
      setFlow({ phase: "waiting", info });
      await openUrl(info.verificationUri);

      // Pollen bis Token da ist oder abgelaufen
      let interval = info.interval;
      const deadline = Date.now() + info.expiresIn * 1000;
      while (!cancelled.current && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, interval * 1000));
        if (cancelled.current) return;
        const res =
          provider === "github"
            ? await github.pollDeviceFlow(clientId.trim(), info.deviceCode)
            : await gitlab.pollDeviceFlow(effectiveHost, clientId.trim(), info.deviceCode);
        if (res.slowDown) interval += 5;
        if (res.token) {
          const conn: Connection = {
            id: editingId ?? uid(),
            provider,
            host: effectiveHost,
            clientId: clientId.trim(),
            token: res.token,
          };
          conn.username = await fetchUsername(conn);
          onChange(
            editingId
              ? connections.map((c) => (c.id === editingId ? conn : c))
              : [...connections, conn]
          );
          setFlow({ phase: "idle" });
          setClientId("");
          setEditingId(null);
          return;
        }
      }
      if (!cancelled.current)
        setFlow({ phase: "error", message: "Zeit abgelaufen – bitte erneut versuchen." });
    } catch (e: any) {
      setFlow({ phase: "error", message: String(e?.message ?? e) });
    }
  }

  function cancel() {
    cancelled.current = true;
    setFlow({ phase: "idle" });
  }

  function remove(id: string) {
    onChange(connections.filter((c) => c.id !== id));
    if (editingId === id) cancelEdit();
  }

  function startEdit(c: Connection) {
    cancelled.current = true;
    setFlow({ phase: "idle" });
    setEditingId(c.id);
    setProvider(c.provider);
    setHost(c.provider === "gitlab" ? c.host : "https://gitlab.com");
    setClientId(c.clientId);
  }

  function cancelEdit() {
    setEditingId(null);
    setClientId("");
    setFlow({ phase: "idle" });
  }

  return (
    <div>
      <h2>Verbindungen</h2>

      {connections.length > 0 && (
        <table className="list">
          <tbody>
            {connections.map((c) => (
              <tr key={c.id}>
                <td className="mono">{c.provider === "github" ? "GitHub" : "GitLab"}</td>
                <td>{c.host}</td>
                <td>{c.username ? `@${c.username}` : "—"}</td>
                <td className="actions">
                  <button onClick={() => startEdit(c)}>Bearbeiten</button>
                  <button className="danger" onClick={() => remove(c.id)}>
                    Entfernen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>
        {editingId
          ? "Verbindung bearbeiten (erneute Anmeldung nötig)"
          : "Neue Verbindung (OAuth Device Flow)"}
      </h3>
      <div className="form">
        <label>
          Provider
          <select
            value={provider}
            disabled={!!editingId}
            onChange={(e) => setProvider(e.target.value as Provider)}
          >
            <option value="github">GitHub</option>
            <option value="gitlab">GitLab</option>
          </select>
        </label>
        {provider === "gitlab" && (
          <label>
            Server-URL
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="https://gitlab.example.com"
            />
          </label>
        )}
        <label>
          Client-ID der OAuth-App
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder={provider === "github" ? "Iv1.…" : "Application ID"}
          />
        </label>

        {flow.phase !== "waiting" && (
          <div className="row-buttons">
            <button className="primary" onClick={startLogin}>
              {editingId ? "Speichern & neu anmelden" : "Anmelden"}
            </button>
            {editingId && <button onClick={cancelEdit}>Abbrechen</button>}
          </div>
        )}
      </div>

      {flow.phase === "waiting" && (
        <div className="device-code">
          <p>
            Gib diesen Code auf der geöffneten Seite ein
            {" "}
            (<a onClick={() => openUrl(flow.info.verificationUri)}>Seite erneut öffnen</a>):
          </p>
          <div className="code">{flow.info.userCode}</div>
          <p className="muted">Warte auf Bestätigung…</p>
          <button onClick={cancel}>Abbrechen</button>
        </div>
      )}
      {flow.phase === "error" && <p className="error">{flow.message}</p>}

      {provider === "github" ? (
        <div className="help">
          <h4>Woher bekomme ich die Client-ID? (einmalige Einrichtung)</h4>
          <ol>
            <li>
              <a onClick={() => openUrl("https://github.com/settings/applications/new")}>
                github.com/settings/applications/new
              </a>{" "}
              öffnen (Settings → Developer settings → OAuth Apps → „New OAuth App").
            </li>
            <li>
              <strong>Application name</strong>: z. B. <code>BuildWatcher</code>
            </li>
            <li>
              <strong>Homepage URL</strong>: beliebig, z. B. <code>http://localhost</code>
            </li>
            <li>
              <strong>Authorization callback URL</strong>: beliebig, z. B.{" "}
              <code>http://localhost</code> – wird beim Device Flow nicht genutzt, ist
              aber ein Pflichtfeld.
            </li>
            <li>
              <strong>„Enable Device Flow" unbedingt anhaken</strong> – ohne diesen Haken
              schlägt die Anmeldung fehl.
            </li>
            <li>„Register application" klicken.</li>
            <li>
              Auf der nächsten Seite wird die <strong>Client ID</strong> angezeigt (z. B.{" "}
              <code>Iv1.abc123…</code>). Nur diese hier oben eintragen –{" "}
              <strong>kein Client Secret generieren</strong>, es wird nicht benötigt.
            </li>
            <li>
              „Anmelden" klicken: Es öffnet sich <code>github.com/login/device</code>,
              dort den angezeigten Code eingeben und bestätigen – fertig.
            </li>
          </ol>
        </div>
      ) : (
        <div className="help">
          <h4>Woher bekomme ich die Application ID? (einmalige Einrichtung)</h4>
          <ol>
            <li>
              <a onClick={() => openUrl(`${effectiveHost}/-/user_settings/applications`)}>
                {effectiveHost}/-/user_settings/applications
              </a>{" "}
              öffnen (User Settings → Applications) und neue Application anlegen.
            </li>
            <li>
              <strong>„Confidential" deaktivieren</strong> (Device Flow braucht kein
              Secret).
            </li>
            <li>
              Scope <code>api</code> auswählen (wird auch zum Abbrechen von Pipelines
              benötigt).
            </li>
            <li>
              Die angezeigte <strong>Application ID</strong> hier oben eintragen und
              „Anmelden" klicken, dann den Code bestätigen.
            </li>
            <li className="muted">Benötigt GitLab ≥ 17.2 (Device Flow).</li>
          </ol>
        </div>
      )}
    </div>
  );
}
