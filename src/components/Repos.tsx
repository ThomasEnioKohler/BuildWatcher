import { useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Connection, RepoConfig } from "../types";
import { uid } from "../config";
import { listRepos } from "../providers";

interface Props {
  repos: RepoConfig[];
  connections: Connection[];
  onChange: (r: RepoConfig[]) => void;
}

export default function Repos({ repos, connections, onChange }: Props) {
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? "");
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Verfügbare Repos der gewählten Verbindung
  const [available, setAvailable] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showList, setShowList] = useState(false);

  const activeConnId = connectionId || connections[0]?.id || "";
  const conn = connections.find((c) => c.id === activeConnId);

  async function loadAvailable() {
    if (!conn) return;
    setLoading(true);
    setError("");
    try {
      setAvailable(await listRepos(conn));
    } catch (e: any) {
      setError(`Repos konnten nicht geladen werden: ${String(e?.message ?? e)}`);
      setAvailable([]);
    } finally {
      setLoading(false);
    }
  }

  // Bei Verbindungswechsel Repo-Liste laden
  useEffect(() => {
    setAvailable([]);
    if (!editingId) setName("");
    if (conn) loadAvailable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConnId]);

  const alreadyAdded = useMemo(
    () => new Set(repos.filter((r) => r.connectionId === activeConnId).map((r) => r.name)),
    [repos, activeConnId]
  );

  const filtered = useMemo(() => {
    const q = name.trim().toLowerCase();
    return available
      .filter((n) => !q || n.toLowerCase().includes(q))
      .slice(0, 50);
  }, [available, name]);

  function add(repoName?: string) {
    const finalName = (repoName ?? name).trim();
    if (!conn) {
      setError("Zuerst eine Verbindung anlegen.");
      return;
    }
    if (!/^[^/\s]+\/[^\s]+$/.test(finalName)) {
      setError('Format: "owner/repo" bzw. "group/project"');
      return;
    }
    setError("");
    const entry: RepoConfig = {
      id: editingId ?? uid(),
      connectionId: conn.id,
      name: finalName,
      branch: branch.trim() || undefined,
    };
    onChange(
      editingId ? repos.map((r) => (r.id === editingId ? entry : r)) : [...repos, entry]
    );
    setName("");
    setBranch("");
    setShowList(false);
    setEditingId(null);
  }

  function remove(id: string) {
    onChange(repos.filter((r) => r.id !== id));
    if (editingId === id) cancelEdit();
  }

  function startEdit(r: RepoConfig) {
    setEditingId(r.id);
    setConnectionId(r.connectionId);
    setName(r.name);
    setBranch(r.branch ?? "");
    setShowList(false);
    setError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setName("");
    setBranch("");
    setError("");
  }

  const connLabel = (id: string) => {
    const c = connections.find((x) => x.id === id);
    return c ? `${c.provider === "github" ? "GitHub" : "GitLab"} (${c.username ?? c.host})` : "?";
  };

  return (
    <div>
      <h2>Überwachte Repos</h2>

      {repos.length > 0 && (
        <table className="list">
          <tbody>
            {repos.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.name}</td>
                <td>{r.branch ? `Branch: ${r.branch}` : "alle Branches"}</td>
                <td>{connLabel(r.connectionId)}</td>
                <td className="actions">
                  <button onClick={() => startEdit(r)}>Bearbeiten</button>
                  <button className="danger" onClick={() => remove(r.id)}>
                    Entfernen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>{editingId ? "Repo bearbeiten" : "Repo hinzufügen"}</h3>
      <div className="form">
        <label>
          Verbindung
          <select value={activeConnId} onChange={(e) => setConnectionId(e.target.value)}>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {connLabel(c.id)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Repo / Projekt
          <div className="picker">
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setShowList(true);
              }}
              onFocus={() => setShowList(true)}
              placeholder={
                loading
                  ? "Lade Repos…"
                  : available.length
                    ? "Suchen oder auswählen…"
                    : "owner/repo"
              }
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            {showList && filtered.length > 0 && (
              <ul className="picker-list">
                {filtered.map((n) => (
                  <li
                    key={n}
                    className={alreadyAdded.has(n) ? "added" : ""}
                    onClick={() => {
                      if (alreadyAdded.has(n)) return;
                      setName(n);
                      setShowList(false);
                    }}
                  >
                    <span className="mono">{n}</span>
                    {alreadyAdded.has(n) && <span className="tag">bereits überwacht</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </label>

        <label>
          Branch-Filter (optional)
          <input
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="z. B. main – leer = alle"
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </label>

        <div className="row-buttons">
          <button className="primary" onClick={() => add()}>
            {editingId ? "Speichern" : "Hinzufügen"}
          </button>
          {editingId && <button onClick={cancelEdit}>Abbrechen</button>}
          <button onClick={loadAvailable} disabled={loading || !conn}>
            {loading ? "Lade…" : "Repo-Liste aktualisieren"}
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {!connections.length && (
        <p className="muted">Noch keine Verbindung vorhanden – zuerst unter „Verbindungen" anmelden.</p>
      )}

      {conn?.provider === "github" && (
        <div className="help">
          <h4>Ein Organisations-Repo fehlt in der Liste?</h4>
          <p>
            GitHub-Organisationen haben „OAuth App access restrictions": Jede OAuth-App
            muss pro Organisation freigegeben werden, sonst liefert die API deren Repos
            nicht – obwohl du sie im Browser siehst. So gibst du sie frei:
          </p>
          <ol>
            <li>
              <a onClick={() => openUrl("https://github.com/settings/applications")}>
                github.com/settings/applications
              </a>{" "}
              öffnen → Tab „Authorized OAuth Apps" → <strong>BuildWatcher</strong>{" "}
              anklicken.
            </li>
            <li>
              Unter <strong>Organization access</strong> steht die Organisation vermutlich
              mit ✗ oder „Request"-Button.
            </li>
            <li>
              Als Owner der Organisation: <strong>Grant</strong> klicken. Sonst:{" "}
              <strong>Request</strong> – ein Org-Owner muss die App dann in den
              Org-Settings genehmigen (Third-party Access → OAuth app policy).
            </li>
            <li>Danach hier auf „Repo-Liste aktualisieren" klicken.</li>
          </ol>
          <p className="muted">
            Ausserdem lädt die Liste maximal 300 Repos (nach letzter Aktivität sortiert).
            Fehlende Repos kannst du jederzeit manuell als{" "}
            <code>owner/repo</code> eintippen – erscheint danach beim Überwachen ein
            404-Fehler, fehlt sicher die Org-Freigabe.
          </p>
        </div>
      )}
    </div>
  );
}
