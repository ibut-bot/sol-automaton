import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import type {
  AutomatonDatabase,
  AgentState,
  TurnRecord,
  HeartbeatEntry,
  TransactionRecord,
  InstalledTool,
  ModificationRecord,
  SkillRecord,
  ChildRecord,
  RegistryEntry,
  ReputationEntry,
} from "../types.js";
import { SCHEMA_VERSION, CREATE_TABLES } from "./schema.js";

export function createDatabase(dbPath: string): AutomatonDatabase {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(CREATE_TABLES);

  const versionRow = db
    .prepare("SELECT MAX(version) as v FROM schema_version")
    .get() as { v: number | null } | undefined;
  const currentVersion = versionRow?.v ?? 0;

  if (currentVersion < SCHEMA_VERSION) {
    db.prepare(
      "INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, datetime('now'))",
    ).run(SCHEMA_VERSION);
  }

  // ─── Identity ──────────────────────────────────────────────

  const setIdentity = (key: string, value: string) => {
    db.prepare("INSERT OR REPLACE INTO identity (key, value) VALUES (?, ?)").run(key, value);
  };

  const getIdentity = (key: string): string | undefined => {
    const row = db.prepare("SELECT value FROM identity WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value;
  };

  // ─── Turns ─────────────────────────────────────────────────

  const insertTurn = (turn: TurnRecord) => {
    db.prepare(
      `INSERT INTO turns (id, timestamp, thinking, tool_calls, token_usage, input_source)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      turn.id,
      turn.timestamp,
      turn.thinking,
      JSON.stringify(turn.toolCalls),
      JSON.stringify(turn.tokenUsage),
      turn.inputSource ?? null,
    );
  };

  const getRecentTurns = (count: number): TurnRecord[] => {
    const rows = db.prepare("SELECT * FROM turns ORDER BY timestamp DESC LIMIT ?").all(count) as any[];
    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      thinking: r.thinking,
      toolCalls: JSON.parse(r.tool_calls || "[]"),
      tokenUsage: JSON.parse(r.token_usage || "{}"),
      inputSource: r.input_source ?? undefined,
    })).reverse();
  };

  const getTurnCount = (): number => {
    const row = db.prepare("SELECT COUNT(*) as count FROM turns").get() as { count: number };
    return row.count;
  };

  // ─── KV ────────────────────────────────────────────────────

  const getKV = (key: string): string | undefined => {
    const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value;
  };

  const setKV = (key: string, value: string) => {
    db.prepare("INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(key, value);
  };

  const deleteKV = (key: string) => {
    db.prepare("DELETE FROM kv WHERE key = ?").run(key);
  };

  // ─── Agent State ───────────────────────────────────────────

  const getAgentState = (): AgentState => (getKV("agent_state") as AgentState) || "sleeping";
  const setAgentState = (state: AgentState) => setKV("agent_state", state);

  // ─── Heartbeat ─────────────────────────────────────────────

  const getHeartbeatEntries = (): HeartbeatEntry[] => {
    const rows = db.prepare("SELECT * FROM heartbeat_entries").all() as any[];
    return rows.map((r) => ({
      name: r.name,
      schedule: r.schedule,
      task: r.task,
      enabled: !!r.enabled,
    }));
  };

  const upsertHeartbeatEntry = (entry: HeartbeatEntry) => {
    db.prepare(
      `INSERT OR REPLACE INTO heartbeat_entries (name, schedule, task, enabled, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
    ).run(entry.name, entry.schedule, entry.task, entry.enabled ? 1 : 0);
  };

  // ─── Transactions ──────────────────────────────────────────

  const insertTransaction = (tx: TransactionRecord) => {
    db.prepare(
      `INSERT INTO transactions (id, type, amount_cents, balance_after_cents, description, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(tx.id, tx.type, tx.amountCents, tx.balanceAfterCents, tx.description, tx.timestamp);
  };

  // ─── Installed Tools ───────────────────────────────────────

  const getInstalledTools = (): InstalledTool[] => {
    const rows = db.prepare("SELECT * FROM installed_tools WHERE enabled = 1").all() as any[];
    return rows.map((r) => ({
      id: r.id, name: r.name, type: r.type,
      config: JSON.parse(r.config || "{}"),
      installedAt: r.installed_at, enabled: !!r.enabled,
    }));
  };

  const installTool = (tool: InstalledTool) => {
    db.prepare(
      `INSERT OR REPLACE INTO installed_tools (id, name, type, config, installed_at, enabled)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(tool.id, tool.name, tool.type, JSON.stringify(tool.config ?? {}), tool.installedAt, tool.enabled ? 1 : 0);
  };

  // ─── Modifications ─────────────────────────────────────────

  const insertModification = (mod: ModificationRecord) => {
    db.prepare(
      `INSERT INTO modifications (id, timestamp, type, description, diff, reversible)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(mod.id, mod.timestamp, mod.type, mod.description, mod.diff ?? null, mod.reversible ? 1 : 0);
  };

  const getRecentModifications = (count: number): ModificationRecord[] => {
    const rows = db.prepare("SELECT * FROM modifications ORDER BY timestamp DESC LIMIT ?").all(count) as any[];
    return rows.map((r) => ({
      id: r.id, timestamp: r.timestamp, type: r.type,
      description: r.description, diff: r.diff ?? undefined,
      reversible: !!r.reversible,
    })).reverse();
  };

  // ─── Skills ────────────────────────────────────────────────

  const getSkills = (activeOnly?: boolean): SkillRecord[] => {
    const q = activeOnly ? "SELECT * FROM skills WHERE enabled = 1" : "SELECT * FROM skills";
    const rows = db.prepare(q).all() as any[];
    return rows.map((r) => ({
      name: r.name, description: r.description, source: r.source,
      path: r.path, enabled: !!r.enabled, installedAt: r.installed_at,
    }));
  };

  const upsertSkill = (skill: SkillRecord) => {
    db.prepare(
      `INSERT OR REPLACE INTO skills (name, description, source, path, enabled, installed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(skill.name, skill.description, skill.source, skill.path, skill.enabled ? 1 : 0, skill.installedAt);
  };

  // ─── Children ──────────────────────────────────────────────

  const getChildren = (): ChildRecord[] => {
    const rows = db.prepare("SELECT * FROM children ORDER BY created_at DESC").all() as any[];
    return rows.map((r) => ({
      id: r.id, name: r.name, address: r.address,
      sandboxId: r.sandbox_id, status: r.status,
      fundedAmountCents: r.funded_amount_cents, createdAt: r.created_at,
    }));
  };

  const insertChild = (child: ChildRecord) => {
    db.prepare(
      `INSERT INTO children (id, name, address, sandbox_id, funded_amount_cents, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(child.id, child.name, child.address, child.sandboxId, child.fundedAmountCents, child.status, child.createdAt);
  };

  const getChildById = (id: string): ChildRecord | undefined => {
    const row = db.prepare("SELECT * FROM children WHERE id = ?").get(id) as any | undefined;
    if (!row) return undefined;
    return {
      id: row.id, name: row.name, address: row.address,
      sandboxId: row.sandbox_id, status: row.status,
      fundedAmountCents: row.funded_amount_cents, createdAt: row.created_at,
    };
  };

  const updateChildStatus = (id: string, status: string) => {
    db.prepare("UPDATE children SET status = ? WHERE id = ?").run(status, id);
  };

  // ─── Registry ──────────────────────────────────────────────

  const getRegistryEntry = (): RegistryEntry | undefined => {
    const row = db.prepare("SELECT * FROM registry LIMIT 1").get() as any | undefined;
    if (!row) return undefined;
    return {
      agentId: row.agent_id, txHash: row.tx_hash,
      agentURI: row.agent_uri, registeredAt: row.registered_at,
      network: row.network,
    };
  };

  const setRegistryEntry = (entry: RegistryEntry) => {
    db.prepare(
      `INSERT OR REPLACE INTO registry (agent_id, tx_hash, agent_uri, registered_at, network)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(entry.agentId, entry.txHash, entry.agentURI, entry.registeredAt, entry.network);
  };

  // ─── Reputation ────────────────────────────────────────────

  const getReputation = (address: string): ReputationEntry[] => {
    const rows = db.prepare("SELECT * FROM reputation WHERE to_agent = ? ORDER BY timestamp DESC").all(address) as any[];
    return rows.map((r) => ({
      fromAgent: r.from_agent, toAgent: r.to_agent,
      score: r.score, comment: r.comment,
      txHash: r.tx_hash ?? "", timestamp: r.timestamp,
    }));
  };

  const insertReputation = (entry: ReputationEntry) => {
    db.prepare(
      `INSERT INTO reputation (from_agent, to_agent, score, comment, tx_hash, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(entry.fromAgent, entry.toAgent, entry.score, entry.comment, entry.txHash, entry.timestamp);
  };

  const close = () => db.close();

  return {
    getAgentState, setAgentState,
    getTurnCount, insertTurn, getRecentTurns,
    getKV, setKV, deleteKV,
    setIdentity, getIdentity,
    insertModification, getRecentModifications,
    insertTransaction,
    upsertHeartbeatEntry, getHeartbeatEntries,
    installTool, getInstalledTools,
    getSkills, upsertSkill,
    getChildren, insertChild, getChildById, updateChildStatus,
    getRegistryEntry, setRegistryEntry,
    getReputation, insertReputation,
    close,
  };
}
