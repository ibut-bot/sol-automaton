import type { AutomatonTool, ToolContext, ToolCallResult } from "../types.js";
import { createSolanaTools } from "../solana/tools.js";
import { localExec, localReadFile, localWriteFile, localListDir, localDeleteFile } from "../local/exec.js";

const FORBIDDEN_PATTERNS = [
  /rm\s+(-rf?\s+)?.*\.sol-automaton/,
  /rm\s+(-rf?\s+)?.*state\.db/,
  /rm\s+(-rf?\s+)?.*wallet\.json/,
  /rm\s+(-rf?\s+)?.*automaton\.json/,
  /kill\s+.*automaton/,
  /pkill\s+.*automaton/,
  /DROP\s+TABLE/i,
  /TRUNCATE/i,
];

function checkForbidden(command: string): string | null {
  for (const p of FORBIDDEN_PATTERNS) {
    if (p.test(command)) return `Blocked: matches self-harm pattern: ${p.source}`;
  }
  return null;
}

export function createBuiltinTools(): AutomatonTool[] {
  const localTools: AutomatonTool[] = [
    {
      name: "exec",
      description: "Execute a shell command on your VPS. Returns stdout, stderr, exit code.",
      category: "local",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute" },
          cwd: { type: "string", description: "Working directory (optional)" },
          timeout: { type: "number", description: "Timeout in ms (default 30000)" },
        },
        required: ["command"],
      },
      execute: async (args, _ctx) => {
        const command = args.command as string;
        const forbidden = checkForbidden(command);
        if (forbidden) return forbidden;
        const result = localExec(command, {
          cwd: args.cwd as string | undefined,
          timeoutMs: (args.timeout as number) || 30_000,
        });
        return `exit_code: ${result.exitCode}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`;
      },
    },
    {
      name: "write_file",
      description: "Write content to a file on your VPS.",
      category: "local",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path" },
          content: { type: "string", description: "File content" },
        },
        required: ["path", "content"],
      },
      execute: async (args, _ctx) => {
        const filePath = args.path as string;
        if (filePath.includes("wallet.json") || filePath.includes("state.db")) {
          return "Blocked: Cannot overwrite critical identity/state files directly";
        }
        localWriteFile(filePath, args.content as string);
        return `File written: ${filePath}`;
      },
    },
    {
      name: "read_file",
      description: "Read content from a file on your VPS.",
      category: "local",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to read" },
        },
        required: ["path"],
      },
      execute: async (args, _ctx) => localReadFile(args.path as string),
    },
    {
      name: "list_dir",
      description: "List files in a directory on your VPS.",
      category: "local",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path" },
        },
        required: ["path"],
      },
      execute: async (args, _ctx) => {
        const entries = localListDir(args.path as string);
        return entries.length > 0 ? entries.join("\n") : "(empty directory)";
      },
    },
    {
      name: "delete_file",
      description: "Delete a file on your VPS.",
      category: "local",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to delete" },
        },
        required: ["path"],
      },
      execute: async (args, _ctx) => {
        const filePath = args.path as string;
        if (filePath.includes("wallet.json") || filePath.includes("state.db")) {
          return "Blocked: Cannot delete critical files";
        }
        localDeleteFile(filePath);
        return `Deleted: ${filePath}`;
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
          duration_seconds: { type: "number", description: "How long to sleep (seconds)" },
          reason: { type: "string", description: "Why you are sleeping" },
        },
        required: ["duration_seconds"],
      },
      execute: async (args, ctx) => {
        const duration = args.duration_seconds as number;
        ctx.db.setAgentState("sleeping");
        ctx.db.setKV("sleep_until", new Date(Date.now() + duration * 1000).toISOString());
        return `Entering sleep for ${duration}s. Reason: ${(args.reason as string) || "none"}`;
      },
    },
    {
      name: "system_synopsis",
      description: "Full system status: balances, tools, heartbeat, turns.",
      category: "survival",
      parameters: { type: "object", properties: {} },
      execute: async (_args, ctx) => {
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
State: ${state}
Solana USDC: ${usdc.toFixed(2)}
Solana SOL: ${sol.toFixed(4)}
Inference model: ${ctx.config.inferenceModel}
Low-compute model: ${ctx.config.lowComputeModel}
Total turns: ${turns}
Installed tools: ${tools.length}
Active heartbeats: ${heartbeats.filter((h) => h.enabled).length}
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
        const protectedFiles = ["wallet.json", "state.db"];
        if (protectedFiles.some((f) => filePath.includes(f))) {
          return `Blocked: ${filePath} is a protected file.`;
        }
        localWriteFile(filePath, args.content as string);
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
      name: "install_package",
      description: "Install a system or npm package.",
      category: "self_mod",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Install command, e.g. 'npm install -g foo'" },
        },
        required: ["command"],
      },
      execute: async (args, ctx) => {
        const cmd = args.command as string;
        const result = localExec(cmd, { timeoutMs: 120_000 });
        const { ulid } = await import("ulid");
        ctx.db.insertModification({
          id: ulid(),
          timestamp: new Date().toISOString(),
          type: "package_install",
          description: `Ran: ${cmd}`,
          reversible: true,
        });
        return result.exitCode === 0 ? `Success: ${cmd}` : `Failed (${result.exitCode}): ${result.stderr}`;
      },
    },
  ];

  const solanaTools = createSolanaTools();

  return [...localTools, ...solanaTools, ...survivalTools, ...selfModTools];
}

export function toolsToInferenceFormat(tools: AutomatonTool[]): Array<{
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
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
