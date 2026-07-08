# BuildWatcher

Desktop-Tray-App (Tauri 2 + React) zur Überwachung von CI/CD-Builds auf **GitHub** (Actions) und **GitLab** (Pipelines) – inkl. self-hosted GitLab.

## Features

- **OAuth Device Flow** – Anmeldung ohne Token-Kopieren: Code eingeben, fertig. Kein Client-Secret nötig.
- **Mehrere Repos** über mehrere Verbindungen/Server gleichzeitig überwachen, optional mit Branch-Filter.
- **Aggregierter Status im Tray-Icon**: grün = alles ok, gelb = Builds laufen, rot = Build fehlgeschlagen. Tooltip zeigt Zusammenfassung über alle Repos.
- **Dashboard** mit Status und Build-Historie (klickbare Punkte → öffnet Build im Browser) pro Repo.
- **Konfigurierbare Notifications** bei Build-Start und Build-Ende inkl. Resultat. Templates mit Platzhaltern `{repo}` `{branch}` `{workflow}` `{result}`, einzeln ein-/ausschaltbar.
- Fenster schließen = in den Tray minimieren; Beenden über Tray-Menü.

## Voraussetzungen

- Node.js ≥ 18, Rust (stable) + [Tauri-Systemabhängigkeiten](https://tauri.app/start/prerequisites/)

## Starten

```bash
npm install
npm run tauri dev      # Entwicklung
npm run tauri build    # Installierbares Bundle
```

## OAuth-App einrichten (einmalig)

**GitHub:** Settings → Developer settings → OAuth Apps → New OAuth App. Callback-URL beliebig (wird nicht genutzt), danach **„Enable Device Flow"** aktivieren. Die *Client ID* in BuildWatcher eintragen.

**GitLab (≥ 17.2):** User Settings → Applications → neue Application, **Confidential deaktivieren**, Scope `read_api`. Die *Application ID* in BuildWatcher eintragen. Bei self-hosted GitLab die Server-URL angeben.

In der App: Verbindungen → Provider wählen → Client-ID → „Anmelden" → angezeigten Code auf der geöffneten Seite bestätigen.

## Architektur

```
src/
  providers/github.ts   Device Flow + Actions-Runs (REST)
  providers/gitlab.ts   Device Flow + Pipelines (REST)
  providers/index.ts    gemeinsames Provider-Interface
  monitor.ts            Statusaggregation (Repo + gesamt)
  notify.ts             Message-Templates + Desktop-Notifications
  tray.ts               Tray-Icon (Statusfarbe, Menü)
  config.ts             Persistenz (tauri-plugin-store → config.json)
  components/           Dashboard, Repos, Verbindungen, Einstellungen
src-tauri/              Rust-Host (Plugins: http, notification, store, opener)
```

Polling (Standard 30 s, einstellbar) statt Webhooks → funktioniert hinter Firewalls. Neue CI-Systeme lassen sich als weiterer Provider-Adapter ergänzen.

## Release & Versionierung

`npm run release` fragt interaktiv nach dem Bump-Typ (patch/minor/major), erhöht die Version (in Git: mit Commit + Tag), baut das Bundle und erzeugt die `latest.json` für den Auto-Updater. Die Version steht nur in `package.json` – `tauri.conf.json` liest sie von dort; die App zeigt sie links unten an.

## Auto-Update einrichten (einmalig)

1. **Signatur-Schlüssel erzeugen:**
   ```bash
   npm run tauri signer generate -- -w ~/.tauri/buildwatcher.key
   ```
   Den ausgegebenen **Public Key** in `src-tauri/tauri.conf.json` bei `plugins.updater.pubkey` eintragen. Vor jedem Release-Build:
   ```bash
   export TAURI_SIGNING_PRIVATE_KEY=~/.tauri/buildwatcher.key
   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="…"   # falls gesetzt
   ```
2. **Öffentliches GitHub-Repo** für die Releases anlegen (nur für Downloads – der Code kann woanders privat bleiben). `OWNER/REPO` an zwei Stellen ersetzen: `plugins.updater.endpoints` in `src-tauri/tauri.conf.json` und `GITHUB_REPO` in `scripts/release.mjs`.
3. **Veröffentlichen:** `npm run release` – mit installierter [gh CLI](https://cli.github.com) wird das GitHub-Release auf Wunsch direkt erstellt (Tag `vX.Y.Z` mit `.app.tar.gz` + `latest.json`). Sonst manuell anhängen.

Die App prüft bei jedem Start den Endpoint. Bei neuer Version erscheint ein Banner „Update verfügbar" mit „Installieren & neu starten" – Download wird gegen den Public Key verifiziert.

## Hinweise

- Tokens liegen aktuell in der Store-Datei (`config.json` im App-Config-Verzeichnis). Follow-up: OS-Keychain.
- GitHub Rate Limit: 5000 Requests/h – bei sehr vielen Repos Poll-Intervall erhöhen.
