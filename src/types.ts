import type { Keypair } from "@solana/web3.js";
import type { PrivateKeyAccount } from "viem";

// ─── Wallet ──────────────────────────────────────────────────

export interface WalletData {
  mnemonic: string;
  createdAt: string;
}

export interface DualWallet {
  solana: Keypair;
  evm: PrivateKeyAccount;
  mnemonic: string;
}

// ─── Identity ────────────────────────────────────────────────

export interface AutomatonIdentity {
  name: string;
  solanaAddress: string;
  evmAddress: string;
  solana: Keypair;
  evm: PrivateKeyAccount;
  sandboxId: string;
  apiKey: string;
  createdAt: string;
}

// ─── Config ──────────────────────────────────────────────────

export interface AutomatonConfig {
  name: string;
  genesisPrompt: string;
  creatorMessage?: string;
  creatorAddress: string; // Solana address of the creator
  registeredWithConway: boolean;
  sandboxId: string;
  conwayApiUrl: string;
  conwayApiKey: string;
  inferenceModel: string;
  maxTokensPerTurn: number;
  heartbeatConfigPath: string;
  dbPath: string;
  logLevel: "debug" | "info" | "warn" | "error";
  solanaRpcUrl: string;
  solanaAddress: string;
  evmAddress: string;
  version: string;
  skillsDir: string;
  maxChildren: number;
  parentAddress?: string;
  socialRelayUrl?: string;
}

export const DEFAULT_CONFIG: Partial<AutomatonConfig> = {
  conwayApiUrl: "https://api.conway.tech",
  inferenceModel: "claude-opus-4.6",
  maxTokensPerTurn: 4096,
  heartbeatConfigPath: "~/.sol-automaton/heartbeat.yml",
  dbPath: "~/.sol-automaton/state.db",
  logLevel: "info",
  solanaRpcUrl: "https://api.mainnet-beta.solana.com",
  version: "0.1.0",
  skillsDir: "~/.sol-automaton/skills",
  maxChildren: 3,
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
  conwayCreditsCents: number;
  solanaUsdcBalance: number;
  solanaSolBalance: number;
}

// ─── Tools ───────────────────────────────────────────────────

export type ToolCategory =
  | "vm"
  | "conway"
  | "solana"
  | "self_mod"
  | "survival"
  | "financial"
  | "skills"
  | "git"
  | "registry"
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
  conway: ConwayClient;
  inference: InferenceClient;
  db: AutomatonDatabase;
  social?: SocialClientInterface;
}

export interface ToolCallResult {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result: string;
  durationMs: number;
  error?: string;
}

export interface InferenceToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// ─── Conway Client ───────────────────────────────────────────

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface PortInfo {
  port: number;
  publicUrl: string;
  sandboxId: string;
}

export interface CreateSandboxOptions {
  name?: string;
  vcpu?: number;
  memoryMb?: number;
  diskGb?: number;
  region?: string;
}

export interface SandboxInfo {
  id: string;
  status: string;
  region: string;
  vcpu: number;
  memoryMb: number;
  diskGb: number;
  terminalUrl?: string;
  createdAt: string;
}

export interface PricingTier {
  name: string;
  vcpu: number;
  memoryMb: number;
  diskGb: number;
  monthlyCents: number;
}

export interface CreditTransferResult {
  transferId: string;
  status: string;
  toAddress: string;
  amountCents: number;
  balanceAfterCents?: number;
}

export interface DomainSearchResult {
  domain: string;
  available: boolean;
  registrationPrice?: number;
  renewalPrice?: number;
  currency: string;
}

export interface DomainRegistration {
  domain: string;
  status: string;
  expiresAt?: string;
  transactionId?: string;
}

export interface DnsRecord {
  id: string;
  type: string;
  host: string;
  value: string;
  ttl?: number;
  distance?: number;
}

export interface ModelInfo {
  id: string;
  provider: string;
  pricing: {
    inputPerMillion: number;
    outputPerMillion: number;
  };
}

export interface ConwayClient {
  exec: (command: string, timeout?: number) => Promise<ExecResult>;
  writeFile: (path: string, content: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  exposePort: (port: number) => Promise<PortInfo>;
  removePort: (port: number) => Promise<void>;
  createSandbox: (options: CreateSandboxOptions) => Promise<SandboxInfo>;
  deleteSandbox: (id: string) => Promise<void>;
  listSandboxes: () => Promise<SandboxInfo[]>;
  getCreditsBalance: () => Promise<number>;
  getCreditsPricing: () => Promise<PricingTier[]>;
  transferCredits: (
    toAddress: string,
    amountCents: number,
    note?: string,
  ) => Promise<CreditTransferResult>;
  searchDomains: (
    query: string,
    tlds?: string,
  ) => Promise<DomainSearchResult[]>;
  registerDomain: (
    domain: string,
    years?: number,
  ) => Promise<DomainRegistration>;
  listDnsRecords: (domain: string) => Promise<DnsRecord[]>;
  addDnsRecord: (
    domain: string,
    type: string,
    host: string,
    value: string,
    ttl?: number,
  ) => Promise<DnsRecord>;
  deleteDnsRecord: (domain: string, recordId: string) => Promise<void>;
  listModels: () => Promise<ModelInfo[]>;
}

// ─── Inference Client ────────────────────────────────────────

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
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  model: string;
}

export interface InferenceClient {
  chat: (
    messages: InferenceMessage[],
    tools?: InferenceToolDefinition[],
    model?: string,
  ) => Promise<InferenceResponse>;
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
  sandboxId: string;
  status: string;
  fundedAmountCents: number;
  createdAt: string;
}

export interface RegistryEntry {
  agentId: string;
  txHash: string;
  agentURI: string;
  registeredAt: string;
  network: string;
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
  getRegistryEntry: () => RegistryEntry | undefined;
  setRegistryEntry: (entry: RegistryEntry) => void;
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

// ─── Genesis ─────────────────────────────────────────────────

export interface GenesisConfig {
  name: string;
  specialization?: string;
  message?: string;
}
