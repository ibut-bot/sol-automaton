import fs from "fs";
import path from "path";
import os from "os";
import yaml from "yaml";
import type { HeartbeatEntry, AutomatonDatabase } from "../types.js";

const AUTOMATON_DIR = path.join(os.homedir(), ".sol-automaton");

interface HeartbeatConfig {
  entries: HeartbeatEntry[];
}

export function loadHeartbeatConfig(configPath: string): HeartbeatConfig {
  const resolved = configPath.startsWith("~")
    ? path.join(os.homedir(), configPath.slice(1))
    : configPath;

  if (!fs.existsSync(resolved)) {
    return { entries: getDefaultEntries() };
  }

  try {
    const raw = yaml.parse(fs.readFileSync(resolved, "utf-8"));
    return {
      entries: (raw.entries || []).map((e: any) => ({
        name: e.name,
        schedule: e.schedule,
        task: e.task,
        enabled: e.enabled !== false,
      })),
    };
  } catch {
    return { entries: getDefaultEntries() };
  }
}

export function syncHeartbeatToDb(config: HeartbeatConfig, db: AutomatonDatabase): void {
  for (const entry of config.entries) {
    db.upsertHeartbeatEntry(entry);
  }
}

export function writeDefaultHeartbeatConfig(): void {
  const configPath = path.join(AUTOMATON_DIR, "heartbeat.yml");
  if (fs.existsSync(configPath)) return;
  fs.mkdirSync(AUTOMATON_DIR, { recursive: true });
  fs.writeFileSync(configPath, yaml.stringify({ entries: getDefaultEntries() }), { mode: 0o600 });
}

function getDefaultEntries(): HeartbeatEntry[] {
  return [
    { name: "health_check", schedule: "*/5 * * * *", task: "health_check", enabled: true },
    { name: "balance_monitor", schedule: "*/10 * * * *", task: "balance_monitor", enabled: true },
    { name: "status_ping", schedule: "0 * * * *", task: "status_ping", enabled: true },
  ];
}
