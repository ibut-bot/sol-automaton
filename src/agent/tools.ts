/**
 * Tool Registry
 *
 * Assembles all tools (Conway VM, Solana DeFi, self-mod, survival, etc.)
 * and exposes them to the agent loop.
 */

import type {
  AutomatonTool,
  ToolContext,
  ToolCallResult,
  InferenceToolDefinition,
} from "../types.js";
import { createSolanaTools } from "../solana/tools.js";

const FORBIDDEN_COMMAND_PATTERNS = [
  /rm\s+(-rf?\s+)?.*\.sol-automaton/,
  /rm\s+(-rf?\s+)?.*state\.db/,
  /rm\s+(-rf?\s+)?.*wallet\.json/,
  /rm\s+(-rf?\s+)?.*automaton\.json/,
  /kill\s+.*automaton/,
  /pkill\s+.*automaton/,
  /DROP\s+TABLE/i,
  /TRUNCATE/i,
];

function isForbiddenCommand(command: string, sandboxId: string): string | null {
  for (const pattern of FORBIDDEN_COMMAND_PATTERNS) {
    if (pattern.test(command)) {
      return `Blocked: Command matches self-harm pattern: ${pattern.source}`;
    }
  }
  if (command.includes("sandbox_delete") && command.includes(sandboxId)) {
    return "Blocked: Cannot delete own sandbox";
  }
  return null;
}

export function createBuiltinTools(sandboxId: string): AutomatonTool[] {
  const vmTools: AutomatonTool[] = [
    {
      name: "exec",
      description: "Execute a shell command in your sandbox. Returns stdout, stderr, and exit code.",
      category: "vm",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command to execute" },
          timeout: { type: "number", description: "Timeout in milliseconds (default: 30000)" },
        },
        required: ["command"],
      },
      execute: async (args, ctx) => {
        const command = args.command as string;
        const forbidden = isForbiddenCommand(command, ctx.identity.sandboxId);
        if (forbidden) return forbidden;
        const result = await ctx.conway.exec(command, (args.timeout as number) || 30000);
        return `exit_code: ${result.exitCode}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`;
      },
    },
    {
      name: "write_file",
      description: "Write content to a file in your sandbox.",
      category: "vm",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path" },
          content: { type: "string", description: "File content" },
        },
        required: ["path", "content"],
      },
      execute: async (args, ctx) => {
        const filePath = args.path as string;
        if (filePath.includes("wallet.json") || filePath.includes("state.db")) {
          return "Blocked: Cannot overwrite critical identity/state files directly";
        }
        await ctx.conway.writeFile(filePath, args.content as string);
        return `File written: ${filePath}`;
      },
    },
    {
      name: "read_file",
      description: "Read content from a file in your sandbox.",
      category: "vm",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to read" },
        },
        required: ["path"],
      },
      execute: async (args, ctx) => ctx.conway.readFile(args.path as string),
    },
    {
      name: "expose_port",
      description: "Expose a port from your sandbox to the internet. Returns a public URL.",
      category: "vm",
      parameters: {
        type: "object",
        properties: {
          port: { type: "number", description: "Port number to expose" },
        },
        required: ["port"],
      },
      execute: async (args, ctx) => {
        const info = await ctx.conway.exposePort(args.port as number);
        return `Port ${info.port} exposed at: ${info.publicUrl}`;
      },
    },
  ];

  const conwayTools: AutomatonTool[] = [
    {
      name: "check_credits",
      description: "Check your current Conway compute credit balance.",
      category: "conway",
      parameters: { type: "object", properties: {} },
      execute: async (_args, ctx) => {
        const balance = await ctx.conway.getCreditsBalance();
        return `Conway credit balance: $${(balance / 100).toFixed(2)} (${balance} cents)`;
      },
    },
    {
      name: "list_models",
      description: "List all available inference models with pricing.",
      category: "conway",
      parameters: { type: "object", properties: {} },
      execute: async (_args, ctx) => {
        const models = await ctx.conway.listModels();
        return models.map((m) => `${m.id} (${m.provider}) — $${m.pricing.inputPerMillion}/$${m.pricing.outputPerMillion} per 1M tokens`).join("\n");
      },
    },
  ];

  const survivalTools: AutomatonTool[] = [
    {
      name: "sleep",
      description: "Enter sleep mode for a specified duration. Heartbeat continues running.",
      category: "survival",
      parameters: {
        type: "object",
        properties: {
          duration_seconds: { type: "number", description: "How long to sleep in seconds" },
          reason: { type: "string", description: "Why you are sleeping" },
        },
        required: ["duration_seconds"],
      },
      execute: async (args, ctx) => {
        const duration = args.duration_seconds as number;
        ctx.db.setAgentState("sleeping");
        ctx.db.setKV("sleep_until", new Date(Date.now() + duration * 1000).toISOString());
        return `Entering sleep mode for ${duration}s. Reason: ${(args.reason as string) || "none"}`;
      },
    },
    {
      name: "system_synopsis",
      description: "Get a full system status report: credits, balances, sandbox info, tools, heartbeat.",
      category: "survival",
      parameters: { type: "object", properties: {} },
      execute: async (_args, ctx) => {
        const credits = await ctx.conway.getCreditsBalance();
        const { Connection } = await import("@solana/web3.js");
        const { getSolanaUsdcBalance, getSolanaSolBalance } = await import("../solana/x402.js");
        const connection = new Connection(ctx.config.solanaRpcUrl, "confirmed");
        const usdc = await getSolanaUsdcBalance(connection, ctx.identity.solana.publicKey);
        const sol = await getSolanaSolBalance(connection, ctx.identity.solana.publicKey);
        const tools = ctx.db.getInstalledTools();
        const heartbeats = ctx.db.getHeartbeatEntries();
        const turns = ctx.db.getTurnCount();
        const state = ctx.db.getAgentState();
        return `=== SYSTEM SYNOPSIS ===
Name: ${ctx.config.name}
Solana: ${ctx.identity.solanaAddress}
Creator: ${ctx.config.creatorAddress}
Sandbox: ${ctx.identity.sandboxId}
State: ${state}
Conway Credits: $${(credits / 100).toFixed(2)}
Solana USDC: ${usdc.toFixed(2)}
Solana SOL: ${sol.toFixed(4)}
Total turns: ${turns}
Installed tools: ${tools.length}
Active heartbeats: ${heartbeats.filter((h) => h.enabled).length}
Model: ${ctx.inference.getDefaultModel()}
========================`;
      },
    },
  ];

  const selfModTools: AutomatonTool[] = [
    {
      name: "edit_own_file",
      description: "Edit a file in your own codebase. Changes are audited. Some files are protected.",
      category: "self_mod",
      dangerous: true,
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to edit" },
          content: { type: "string", description: "New file content" },
          description: { type: "string", description: "Why you are making this change" },
        },
        required: ["path", "content", "description"],
      },
      execute: async (args, ctx) => {
        const filePath = args.path as string;
        const protected_files = ["wallet.json", "constitution.md", "state.db"];
        if (protected_files.some((f) => filePath.includes(f))) {
          return `Blocked: ${filePath} is a protected file.`;
        }
        await ctx.conway.writeFile(filePath, args.content as string);
        const { ulid } = await import("ulid");
        ctx.db.insertModification({
          id: ulid(),
          timestamp: new Date().toISOString(),
          type: "code_edit",
          description: `${args.description}: ${filePath}`,
          reversible: true,
        });
        return `File edited: ${filePath} (audited)`;
      },
    },
    {
      name: "install_npm_package",
      description: "Install an npm package in your environment.",
      category: "self_mod",
      parameters: {
        type: "object",
        properties: {
          package: { type: "string", description: "Package name" },
        },
        required: ["package"],
      },
      execute: async (args, ctx) => {
        const pkg = args.package as string;
        const result = await ctx.conway.exec(`npm install -g ${pkg}`, 60000);
        const { ulid } = await import("ulid");
        ctx.db.insertModification({
          id: ulid(),
          timestamp: new Date().toISOString(),
          type: "tool_install",
          description: `Installed npm package: ${pkg}`,
          reversible: true,
        });
        return result.exitCode === 0 ? `Installed: ${pkg}` : `Failed: ${result.stderr}`;
      },
    },
  ];

  const solanaTools = createSolanaTools();

  return [...vmTools, ...conwayTools, ...solanaTools, ...survivalTools, ...selfModTools];
}

export function toolsToInferenceFormat(tools: AutomatonTool[]): InferenceToolDefinition[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  tools: AutomatonTool[],
  context: ToolContext,
): Promise<ToolCallResult> {
  const tool = tools.find((t) => t.name === toolName);
  const startTime = Date.now();

  if (!tool) {
    return { id: `tc_${Date.now()}`, name: toolName, arguments: args, result: "", durationMs: 0, error: `Unknown tool: ${toolName}` };
  }

  try {
    const result = await tool.execute(args, context);
    return { id: `tc_${Date.now()}`, name: toolName, arguments: args, result, durationMs: Date.now() - startTime };
  } catch (err: any) {
    return { id: `tc_${Date.now()}`, name: toolName, arguments: args, result: "", durationMs: Date.now() - startTime, error: err.message || String(err) };
  }
}
