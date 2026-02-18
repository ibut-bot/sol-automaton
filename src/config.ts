import fs from "fs";
import path from "path";
import os from "os";
import type { AutomatonConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

const AUTOMATON_DIR = path.join(os.homedir(), ".sol-automaton");
const CONFIG_FILENAME = "automaton.json";

export function getConfigPath(): string {
  return path.join(AUTOMATON_DIR, CONFIG_FILENAME);
}

export function loadConfig(): AutomatonConfig | null {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return { ...DEFAULT_CONFIG, ...raw } as AutomatonConfig;
  } catch {
    return null;
  }
}

export function saveConfig(config: AutomatonConfig): void {
  fs.mkdirSync(AUTOMATON_DIR, { recursive: true });
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function resolvePath(p: string): string {
  if (p.startsWith("~")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

export function createConfig(params: {
  name: string;
  genesisPrompt: string;
  creatorMessage?: string;
  creatorAddress: string;
  solanaAddress: string;
  inferenceModel?: string;
  lowComputeModel?: string;
  solanaRpcUrl?: string;
  parentAddress?: string;
}): AutomatonConfig {
  return {
    name: params.name,
    genesisPrompt: params.genesisPrompt,
    creatorMessage: params.creatorMessage,
    creatorAddress: params.creatorAddress,
    inferenceModel: params.inferenceModel || DEFAULT_CONFIG.inferenceModel || "claude-sonnet",
    lowComputeModel: params.lowComputeModel || DEFAULT_CONFIG.lowComputeModel || "deepseek",
    maxTokensPerTurn: DEFAULT_CONFIG.maxTokensPerTurn || 4096,
    heartbeatConfigPath: DEFAULT_CONFIG.heartbeatConfigPath || "~/.sol-automaton/heartbeat.yml",
    dbPath: DEFAULT_CONFIG.dbPath || "~/.sol-automaton/state.db",
    logLevel: (DEFAULT_CONFIG.logLevel as AutomatonConfig["logLevel"]) || "info",
    solanaRpcUrl: params.solanaRpcUrl || DEFAULT_CONFIG.solanaRpcUrl || "https://api.mainnet-beta.solana.com",
    solanaAddress: params.solanaAddress,
    version: DEFAULT_CONFIG.version || "0.2.0",
    skillsDir: DEFAULT_CONFIG.skillsDir || "~/.sol-automaton/skills",
    maxChildren: DEFAULT_CONFIG.maxChildren || 3,
    parentAddress: params.parentAddress,
  };
}
