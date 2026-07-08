#!/usr/bin/env node
/** Interaktiver Release: fragt nach Bump-Typ, erhöht die Version, baut optional
 *  und erzeugt die latest.json für den Auto-Updater (GitHub Releases). */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { arch } from "node:os";

const GITHUB_REPO = "ThomasEnioKohler/BuildWatcher";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const [maj, min, pat] = pkg.version.split(".").map(Number);

const options = [
  { type: "patch", next: `${maj}.${min}.${pat + 1}`, hint: "Bugfixes" },
  { type: "minor", next: `${maj}.${min + 1}.0`, hint: "neue Features" },
  { type: "major", next: `${maj + 1}.0.0`, hint: "Breaking Changes" },
];

const rl = createInterface({ input: process.stdin, output: process.stdout });

console.log(`\nBuildWatcher Release – aktuelle Version: v${pkg.version}\n`);
options.forEach((o, i) =>
  console.log(`  ${i + 1}) ${o.type.padEnd(6)} → v${o.next}  (${o.hint})`)
);
console.log("  0) Abbrechen\n");

const choice = (await rl.question("Welcher Bump? [1] ")).trim() || "1";
if (choice === "0") {
  console.log("Abgebrochen.");
  process.exit(0);
}
const selected = options[Number(choice) - 1];
if (!selected) {
  console.error("Ungültige Auswahl.");
  process.exit(1);
}

const isGit = existsSync(join(root, ".git"));
const confirm = (
  await rl.question(
    `v${pkg.version} → v${selected.next}${isGit ? " (mit Git-Commit + Tag)" : ""} – ok? [J/n] `
  )
)
  .trim()
  .toLowerCase();
if (confirm === "n" || confirm === "nein") {
  console.log("Abgebrochen.");
  process.exit(0);
}

const bumpArgs = ["version", selected.type];
if (!isGit) bumpArgs.push("--no-git-tag-version");
let r = spawnSync("npm", bumpArgs, { cwd: root, stdio: "inherit" });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`\n✔ Version ist jetzt v${selected.next}`);

const build = (await rl.question("\nRelease-Build jetzt erstellen? [J/n] "))
  .trim()
  .toLowerCase();
if (build === "n" || build === "nein") {
  rl.close();
  console.log("Fertig – Build später mit: npm run tauri build");
  process.exit(0);
}

if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
  console.warn(
    "\n⚠ TAURI_SIGNING_PRIVATE_KEY ist nicht gesetzt – es werden keine signierten\n" +
      "  Updater-Artefakte (.tar.gz + .sig) erzeugt. Auto-Update funktioniert dann nicht.\n" +
      "  Siehe README, Abschnitt „Auto-Update einrichten\"."
  );
}

r = spawnSync("npm", ["run", "tauri", "build"], { cwd: root, stdio: "inherit" });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(
  `\n✔ Release v${selected.next} gebaut → src-tauri/target/release/bundle/`
);

// ---- latest.json für den Auto-Updater erzeugen ----
const bundleDir = join(root, "src-tauri", "target", "release", "bundle");
const macosDir = join(bundleDir, "macos");
const platform = `darwin-${arch() === "arm64" ? "aarch64" : "x86_64"}`;

let uploadFiles = [];
if (existsSync(macosDir)) {
  const tarball = readdirSync(macosDir).find((f) => f.endsWith(".app.tar.gz"));
  const sigFile = tarball && `${tarball}.sig`;
  if (tarball && existsSync(join(macosDir, sigFile))) {
    const latest = {
      version: selected.next,
      pub_date: new Date().toISOString(),
      platforms: {
        [platform]: {
          signature: readFileSync(join(macosDir, sigFile), "utf8").trim(),
          url: `https://github.com/${GITHUB_REPO}/releases/download/v${selected.next}/${encodeURIComponent(tarball)}`,
        },
      },
    };
    const latestPath = join(bundleDir, "latest.json");
    writeFileSync(latestPath, JSON.stringify(latest, null, 2));
    console.log(`✔ latest.json erzeugt → ${latestPath}`);
    uploadFiles = [join(macosDir, tarball), latestPath];
  } else {
    console.warn("⚠ Kein signiertes Updater-Artefakt gefunden – latest.json übersprungen.");
  }
}

// ---- Optional direkt als GitHub-Release veröffentlichen (gh CLI) ----
if (uploadFiles.length && GITHUB_REPO !== "OWNER/REPO") {
  const hasGh = spawnSync("gh", ["--version"], { stdio: "ignore" }).status === 0;
  if (hasGh) {
    const publish = (
      await rl.question(`\nAls GitHub-Release v${selected.next} auf ${GITHUB_REPO} veröffentlichen? [J/n] `)
    )
      .trim()
      .toLowerCase();
    if (publish !== "n" && publish !== "nein") {
      r = spawnSync(
        "gh",
        [
          "release",
          "create",
          `v${selected.next}`,
          ...uploadFiles,
          "--repo",
          GITHUB_REPO,
          "--title",
          `BuildWatcher v${selected.next}`,
          "--generate-notes",
        ],
        { stdio: "inherit" }
      );
      if (r.status === 0) console.log("✔ Release veröffentlicht – Auto-Update ist live.");
    }
  } else {
    console.log(
      `\nManuell veröffentlichen: GitHub-Release "v${selected.next}" auf ${GITHUB_REPO} anlegen\n` +
        `und diese Dateien anhängen:\n  ${uploadFiles.join("\n  ")}`
    );
  }
} else if (uploadFiles.length) {
  console.log("\nHinweis: GITHUB_REPO in scripts/release.mjs eintragen, um direkt zu veröffentlichen.");
}
rl.close();
