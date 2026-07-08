# BuildWatcher – Konzept

Desktop-Tray-App (Windows/macOS/Linux) zur Überwachung von CI/CD, Pull/Merge Requests und Issues auf **GitHub** und **GitLab**. Inspiriert von CatLight.

## Feature-Set

### MVP (v0.1)

| Feature | Beschreibung |
|---|---|
| Tray-Icon mit Statusfarbe | Grün = alles ok, Gelb = Warnung (z. B. Review offen), Rot = Build kaputt |
| Pipeline-Monitoring | GitHub Actions Workflows + GitLab Pipelines pollen (REST API) |
| Desktop-Notifications | Build fehlgeschlagen / erfolgreich / gestartet |
| Verbindungs-Setup | Personal Access Token pro Server, Auswahl der Repos/Projekte |
| Dashboard-Fenster | Liste der überwachten Pipelines mit Status und letzter Historie |

### v0.2

- PR/MR-Notifications: neue eingehende Reviews, Approval/Rejection eigener PRs
- Branch-getrennte Build-Historie (pro Branch/PR eigener Verlauf)
- Notification-Filter: alle Builds / nur eigene / nur Fehlschläge
- Acknowledge: Alert quittieren → Icon wird Outline

### v0.3+

- Priorisierte Action-Liste (Regeln: Reviews > Builds > Issues)
- Watch List (eigene gestartete Builds, eigene PRs, beobachtete Issues)
- Build-Zeitschätzung (Durchschnitt der letzten N erfolgreichen Läufe)
- Issue-Monitoring per Query/Label
- "Wer hat's zuerst gebrochen" (erster fehlgeschlagener Commit auf dem Branch)
- Optional Team-Features (Investigations, Kommentare) → braucht eigenes Backend

## Tech-Stack (Empfehlung)

- **Tauri 2 + TypeScript/React** – kleine Binaries (~10 MB statt ~150 MB bei Electron), natives Tray + Notifications auf allen drei OS, Rust-Backend für Polling
  - Alternative: Electron (mehr Beispiele/Ökosystem, dafür schwergewichtiger)
- **Polling statt Webhooks** – kein öffentlicher Endpoint nötig, funktioniert hinter Firmen-Firewall. Intervall 30–60 s, mit ETag/`If-Modified-Since` gegen Rate Limits
- **APIs**:
  - GitHub: `GET /repos/{owner}/{repo}/actions/runs`, `/pulls`, GraphQL für effiziente Sammel-Queries
  - GitLab: `GET /projects/{id}/pipelines`, `/merge_requests`
- **Lokale Persistenz**: SQLite (Historie, Zeitschätzungen) + verschlüsselter Token-Store (OS-Keychain via Tauri-Plugin)

## Architektur

```
┌─ Tray-Icon ── Statusaggregation (worst-of über alle Quellen)
├─ Poller (Rust, pro Verbindung) ──► Provider-Adapter (GitHub | GitLab)
│     └─ Diff alt/neu ──► Event-Bus ──► Notifications + Dashboard-Update
├─ Dashboard (WebView, React)
└─ SQLite: Runs, Branch-Historie, Ack-Status, Settings
```

Provider-Adapter hinter gemeinsamem Interface (`fetchPipelines()`, `fetchPullRequests()`) → weitere CI-Systeme später leicht ergänzbar. Als Vorbild für ein generisches Format: [CatLight Protocol](https://catlight.io/r/catlight-protocol).

## Offene Punkte

- Auth: PAT reicht für MVP; später OAuth Device Flow für komfortableres Onboarding
- GitHub Rate Limit: 5000 req/h (PAT) – bei vielen Repos GraphQL bündeln
- Self-hosted GitLab: Basis-URL konfigurierbar machen
