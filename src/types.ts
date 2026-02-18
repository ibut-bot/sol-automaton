import type { Keypair } from "@solana/web3.js";

// ─── Wallet ──────────────────────────────────────────────────

export interface WalletData {
  secretKey: string; // base58-encoded secret key
  createdAt: string;
}

// ─── Identity ────────────────────────────────────────────────

export interface AutomatonIdentity {
  name: string;
  solanaAddress: string;
  solana: Keypair;
  createdAt: string;
}

// ─── Config ──────────────────────────────────────────────────

export interface AutomatonConfig {
  name: string;
  genesisPrompt: string;
  creatorMessage?: string;
  creatorAddress: string;
  inferenceModel: string;
  lowComputeModel: string;
  maxTokensPerTurn: number;
  heartbeatConfigPath: string;
  dbPath: string;
  logLevel: "debug" | "info" | "warn" | "error";
  solanaRpcUrl: string;
  solanaAddress: string;
  version: string;
  skillsDir: string;
  maxChildren: number;
  parentAddress?: string;
  socialRelayUrl?: string;
}

export const DEFAULT_CONFIG: Partial<AutomatonConfig> = {
  inferenceModel: "claude-sonnet",
  lowComputeModel: "deepseek",
  maxTokensPerTurn: 4096,
  heartbeatConfigPath: "~/.sol-automaton/heartbeat.yml",
  dbPath: "~/.sol-automaton/state.db",
  logLevel: "info",
  solanaRpcUrl: "https://api.mainnet-beta.solana.com",
  version: "0.1.0",
  skillsDir: "~/.sol-automaton/skills",
  maxChildren: 3,
};

// ─── x402engine models and pricing ───────────────────────────

export const X402_MODELS: Record<string, { path: string; price: number; provider: string }> = {
  "claude-opus": { path: "/api/llm/claude-opus", price: 0.09, provider: "Anthropic" },
  "claude-sonnet": { path: "/api/llm/claude-sonnet", price: 0.06, provider: "Anthropic" },
  "claude-haiku": { path: "/api/llm/claude-haiku", price: 0.02, provider: "Anthropic" },
  "gpt-5.2": { path: "/api/llm/gpt-5.2", price: 0.08, provider: "OpenAI" },
  "gpt-5": { path: "/api/llm/gpt-5", price: 0.035, provider: "OpenAI" },
  "gpt-5-mini": { path: "/api/llm/gpt-5-mini", price: 0.007, provider: "OpenAI" },
  "o3": { path: "/api/llm/o3", price: 0.03, provider: "OpenAI" },
  "o4-mini": { path: "/api/llm/o4-mini", price: 0.02, provider: "OpenAI" },
  "gemini-pro": { path: "/api/llm/gemini-pro", price: 0.035, provider: "Google" },
  "gemini-flash": { path: "/api/llm/gemini-flash", price: 0.009, provider: "Google" },
  "deepseek": { path: "/api/llm/deepseek", price: 0.005, provider: "DeepSeek" },
  "deepseek-r1": { path: "/api/llm/deepseek-r1", price: 0.01, provider: "DeepSeek" },
  "llama": { path: "/api/llm/llama", price: 0.002, provider: "Meta" },
  "grok": { path: "/api/llm/grok", price: 0.06, provider: "xAI" },
  "kimi": { path: "/api/llm/kimi", price: 0.03, provider: "Moonshot" },
  "qwen": { path: "/api/llm/qwen", price: 0.004, provider: "Qwen" },
  "mistral": { path: "/api/llm/mistral", price: 0.006, provider: "Mistral" },
  "perplexity": { path: "/api/llm/perplexity", price: 0.06, provider: "Perplexity" },
};

// ─── Agent State ─────────────────────────────────────────────

export type AgentState =
  | "running"
  | "sleeping"
  | "low_compute"
  | "critical"
  | "dead";

export type SurvivalTier = "normal" | "low_compute" | "critical" | "dead";

// ─── Financial ───────────────────────────────────────────────

export interface FinancialState {
  solanaUsdcBalance: number;
  solanaSolBalance: number;
}

// ─── Tools ───────────────────────────────────────────────────

export type ToolCategory =
  | "local"
  | "solana"
  | "self_mod"
  | "survival"
  | "financial"
  | "skills"
  | "git"
  | "replication";

export interface AutomatonTool {
  name: string;
  description: string;
  category: ToolCategory;
  dangerous?: boolean;
  parameters: Record<string, unknown>;
  execute: (
    args: Record<string, unknown>,
    ctx: ToolContext,
  ) => Promise<string>;
}

export interface ToolContext {
  identity: AutomatonIdentity;
  config: AutomatonConfig;
  db: AutomatonDatabase;
}

export interface ToolCallResult {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result: string;
  durationMs: number;
  error?: string;
}

// ─── Inference ───────────────────────────────────────────────

export interface InferenceMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

export interface InferenceResponse {
  content: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface InferenceClient {
  chat: (messages: InferenceMessage[], model?: string) => Promise<InferenceResponse>;
  getDefaultModel: () => string;
  setLowComputeMode: (enabled: boolean) => void;
}

// ─── Database ────────────────────────────────────────────────

export interface TurnRecord {
  id: string;
  timestamp: string;
  thinking: string;
  toolCalls: ToolCallResult[];
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
  inputSource?: string;
}

export interface ModificationRecord {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  diff?: string;
  reversible?: boolean;
}

export interface TransactionRecord {
  id: string;
  type: string;
  amountCents: number;
  balanceAfterCents: number;
  description: string;
  timestamp: string;
}

export interface HeartbeatEntry {
  name: string;
  schedule: string;
  task: string;
  enabled: boolean;
}

export interface SkillRecord {
  name: string;
  description: string;
  source: string;
  path: string;
  enabled: boolean;
  installedAt: string;
}

export interface ChildRecord {
  id: string;
  name: string;
  address: string;
  vpsHost: string;
  status: string;
  fundedAmountCents: number;
  createdAt: string;
}

export interface InstalledTool {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  installedAt: string;
  enabled: boolean;
}

export interface ReputationEntry {
  fromAgent: string;
  toAgent: string;
  score: number;
  comment: string;
  txHash: string;
  timestamp: string;
}

export interface AutomatonDatabase {
  getAgentState: () => AgentState;
  setAgentState: (state: AgentState) => void;
  getTurnCount: () => number;
  insertTurn: (turn: TurnRecord) => void;
  getRecentTurns: (count: number) => TurnRecord[];
  getKV: (key: string) => string | undefined;
  setKV: (key: string, value: string) => void;
  deleteKV: (key: string) => void;
  setIdentity: (key: string, value: string) => void;
  getIdentity: (key: string) => string | undefined;
  insertModification: (mod: ModificationRecord) => void;
  getRecentModifications: (count: number) => ModificationRecord[];
  insertTransaction: (tx: TransactionRecord) => void;
  upsertHeartbeatEntry: (entry: HeartbeatEntry) => void;
  getHeartbeatEntries: () => HeartbeatEntry[];
  installTool: (tool: InstalledTool) => void;
  getInstalledTools: () => InstalledTool[];
  getSkills: (activeOnly?: boolean) => SkillRecord[];
  upsertSkill: (skill: SkillRecord) => void;
  getChildren: () => ChildRecord[];
  insertChild: (child: ChildRecord) => void;
  getChildById: (id: string) => ChildRecord | undefined;
  updateChildStatus: (id: string, status: string) => void;
  getRegistryEntry: () => { agentId: string; txHash: string; agentURI: string; registeredAt: string; network: string } | undefined;
  setRegistryEntry: (entry: { agentId: string; txHash: string; agentURI: string; registeredAt: string; network: string }) => void;
  getReputation: (address: string) => ReputationEntry[];
  insertReputation: (entry: ReputationEntry) => void;
  close: () => void;
}

// ─── Skills ──────────────────────────────────────────────────

export interface Skill {
  name: string;
  description: string;
  instructions: string;
  path: string;
  source: string;
  enabled: boolean;
}

// ─── Social ──────────────────────────────────────────────────

export interface SocialClientInterface {
  send: (
    toAddress: string,
    content: string,
    replyTo?: string,
  ) => Promise<{ id: string }>;
  checkInbox: () => Promise<
    Array<{ id: string; from: string; content: string; timestamp: string }>
  >;
}
