import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateInfo {
  version: string;
  notes?: string;
  /** Lädt das Update herunter, installiert es und startet die App neu. */
  install: () => Promise<void>;
}

/** Prüft auf ein Update. Gibt null zurück, wenn keins verfügbar ist
 *  (oder der Updater nicht konfiguriert/erreichbar ist – Fehler werden geschluckt). */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const update = await check();
    if (!update) return null;
    return {
      version: update.version,
      notes: update.body ?? undefined,
      install: async () => {
        await update.downloadAndInstall();
        await relaunch();
      },
    };
  } catch (e) {
    console.warn("Update-Check fehlgeschlagen:", e);
    return null;
  }
}
