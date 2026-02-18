import fs from "fs";
import path from "path";
import type { AutomatonConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";
import { getAutomatonDir } from "./identity/wallet.js";
import { loadApiKeyFromConfig } from "./identity/provision.js";

const CONFIG_FILENAME = "automaton.json";

export function getConfigPath(): string {
  return path.join(getAutomatonDir(), CONFIG_FILENAME);
}

export function loadConfig(): AutomatonConfig | null {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const apiKey = raw.conwayApiKey || loadApiKeyFromConfig();
    return { ...DEFAULT_CONFIG, ...raw, conwayApiKey: apiKey } as AutomatonConfig;
  } catch {
    return null;
  }
}

export function saveConfig(config: AutomatonConfig): void {
  const dir = getAutomatonDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
}

export function resolvePath(p: string): string {
  if (p.startsWith("~")) {
    return path.join(process.env.HOME || "/root", p.slice(1));
  }
  return p;
}

export function createConfig(params: {
  name: string;
  genesisPrompt: string;
  creatorMessage?: string;
  creatorAddress: string;
  registeredWithConway: boolean;
  sandboxId: string;
  solanaAddress: string;
  evmAddress: string;
  apiKey: string;
  parentAddress?: string;
  solanaRpcUrl?: string;
}): AutomatonConfig {
  return {
    name: params.name,
    genesisPrompt: params.genesisPrompt,
    creatorMessage: params.creatorMessage,
    creatorAddress: params.creatorAddress,
    registeredWithConway: params.registeredWithConway,
    sandboxId: params.sandboxId,
    conwayApiUrl: DEFAULT_CONFIG.conwayApiUrl || "https://api.conway.tech",
    conwayApiKey: params.apiKey,
    inferenceModel: DEFAULT_CONFIG.inferenceModel || "claude-opus-4.6",
    maxTokensPerTurn: DEFAULT_CONFIG.maxTokensPerTurn || 4096,
    heartbeatConfigPath: DEFAULT_CONFIG.heartbeatConfigPath || "~/.sol-automaton/heartbeat.yml",
    dbPath: DEFAULT_CONFIG.dbPath || "~/.sol-automaton/state.db",
    logLevel: (DEFAULT_CONFIG.logLevel as AutomatonConfig["logLevel"]) || "info",
    solanaRpcUrl: params.solanaRpcUrl || DEFAULT_CONFIG.solanaRpcUrl || "https://api.mainnet-beta.solana.com",
    solanaAddress: params.solanaAddress,
    evmAddress: params.evmAddress,
    version: DEFAULT_CONFIG.version || "0.1.0",
    skillsDir: DEFAULT_CONFIG.skillsDir || "~/.sol-automaton/skills",
    maxChildren: DEFAULT_CONFIG.maxChildren || 3,
    parentAddress: params.parentAddress,
  };
}
