import { LazyStore } from "@tauri-apps/plugin-store";
import type { Connection, MessageSettings, RepoConfig } from "./types";
import { DEFAULT_SETTINGS } from "./types";

const store = new LazyStore("config.json");

export async function loadConnections(): Promise<Connection[]> {
  return (await store.get<Connection[]>("connections")) ?? [];
}

export async function saveConnections(c: Connection[]) {
  await store.set("connections", c);
  await store.save();
}

export async function loadRepos(): Promise<RepoConfig[]> {
  return (await store.get<RepoConfig[]>("repos")) ?? [];
}

export async function saveRepos(r: RepoConfig[]) {
  await store.set("repos", r);
  await store.save();
}

export async function loadSettings(): Promise<MessageSettings> {
  const s = await store.get<Partial<MessageSettings>>("settings");
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export async function saveSettings(s: MessageSettings) {
  await store.set("settings", s);
  await store.save();
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}
