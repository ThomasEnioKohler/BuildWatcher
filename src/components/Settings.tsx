import type { MessageSettings } from "../types";
import { DEFAULT_SETTINGS } from "../types";

interface Props {
  settings: MessageSettings;
  onChange: (s: MessageSettings) => void;
}

export default function Settings({ settings, onChange }: Props) {
  const set = <K extends keyof MessageSettings>(key: K, value: MessageSettings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <div>
      <h2>Einstellungen</h2>

      <h3>Benachrichtigungen</h3>
      <div className="form">
        <label className="row">
          <input
            type="checkbox"
            checked={settings.notifyStart}
            onChange={(e) => set("notifyStart", e.target.checked)}
          />
          Message bei Build-Start
        </label>
        <label>
          Template Build-Start
          <input
            value={settings.startTemplate}
            disabled={!settings.notifyStart}
            onChange={(e) => set("startTemplate", e.target.value)}
          />
        </label>

        <label className="row">
          <input
            type="checkbox"
            checked={settings.notifyFinish}
            onChange={(e) => set("notifyFinish", e.target.checked)}
          />
          Message bei Build-Ende (mit Resultat)
        </label>
        <label>
          Template Build-Ende
          <input
            value={settings.finishTemplate}
            disabled={!settings.notifyFinish}
            onChange={(e) => set("finishTemplate", e.target.value)}
          />
        </label>

        <p className="muted">
          Platzhalter: <code>{"{repo}"}</code> <code>{"{branch}"}</code>{" "}
          <code>{"{workflow}"}</code> <code>{"{result}"}</code>
        </p>

        <label>
          Poll-Intervall (Sekunden)
          <input
            type="number"
            min={10}
            value={settings.pollSeconds}
            onChange={(e) => set("pollSeconds", Math.max(10, Number(e.target.value) || 30))}
          />
        </label>

        <button onClick={() => onChange({ ...DEFAULT_SETTINGS })}>
          Auf Standard zurücksetzen
        </button>
      </div>
    </div>
  );
}
