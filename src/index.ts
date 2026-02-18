#!/usr/bin/env node

import chalk from "chalk";
import { loadWallet, walletExists } from "./identity/wallet.js";
import { loadConfig, resolvePath } from "./config.js";
import { createDatabase } from "./state/database.js";
import { createInferenceClient } from "./inference/client.js";
import { createPaidFetch } from "./inference/payment.js";
import { createHeartbeatDaemon } from "./heartbeat/daemon.js";
import { loadHeartbeatConfig, syncHeartbeatToDb } from "./heartbeat/config.js";
import { runAgentLoop } from "./agent/loop.js";
import type { AutomatonIdentity, AgentState } from "./types.js";

const VERSION = "0.2.0";

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--version") || args.includes("-v")) {
    console.log(`Sol-Automaton v${VERSION}`);
    process.exit(0);
  }

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Sol-Automaton v${VERSION}
Pure Solana Sovereign AI Agent Runtime

Usage:
  sol-automaton --run          Start the automaton (first run triggers setup)
  sol-automaton --setup        Re-run setup wizard
  sol-automaton --status       Show current status
  sol-automaton --logs         Show recent turns (default: 10)
  sol-automaton --logs --tail N  Show last N turns
  sol-automaton --version      Show version
  sol-automaton --help         Show this help

Environment:
  SOLANA_RPC_URL    Solana RPC URL override
`);
    process.exit(0);
  }

  if (args.includes("--setup")) {
    const { runSetupWizard } = await import("./setup/wizard.js");
    await runSetupWizard();
    process.exit(0);
  }

  if (args.includes("--status")) {
    await showStatus();
    process.exit(0);
  }

  if (args.includes("--logs")) {
    const tailIdx = args.indexOf("--tail");
    const count = tailIdx !== -1 && args[tailIdx + 1] ? parseInt(args[tailIdx + 1], 10) : 10;
    await showLogs(count);
    process.exit(0);
  }

  if (args.includes("--run")) {
    await run();
    return;
  }

  console.log('Run "sol-automaton --help" for usage.');
  console.log('Run "sol-automaton --run" to start.');
}

async function showStatus(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.log("Not configured. Run: sol-automaton --setup");
    return;
  }

  const db = createDatabase(resolvePath(config.dbPath));
  const state = db.getAgentState();
  const turnCount = db.getTurnCount();
  const tools = db.getInstalledTools();
  const heartbeats = db.getHeartbeatEntries();
  const children = db.getChildren();

  console.log(`
=== SOL-AUTOMATON STATUS ===
Name:           ${config.name}
Solana Address: ${config.solanaAddress}
Creator:        ${config.creatorAddress}
State:          ${state}
Turns:          ${turnCount}
Model:          ${config.inferenceModel} (fallback: ${config.lowComputeModel})
Tools:          ${tools.length} installed
Heartbeats:     ${heartbeats.filter((h) => h.enabled).length} active
Children:       ${children.filter((c) => c.status !== "dead").length} alive / ${children.length} total
RPC:            ${config.solanaRpcUrl}
Version:        ${config.version}
============================
`);
  db.close();
}

async function showLogs(count: number): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.log("Not configured. Run: sol-automaton --setup");
    return;
  }

  const db = createDatabase(resolvePath(config.dbPath));
  const turns = db.getRecentTurns(count);

  if (turns.length === 0) {
    console.log("No turns recorded yet.");
    db.close();
    return;
  }

  console.log(chalk.cyan(`\n=== Last ${turns.length} turns ===\n`));

  for (const turn of turns) {
    const ts = chalk.dim(turn.timestamp);
    const tokens = chalk.dim(`${turn.tokenUsage.totalTokens} tokens`);
    console.log(`${ts} ${chalk.cyan(`Turn ${turn.id.slice(0, 8)}`)} ${tokens}`);

    if (turn.thinking) {
      const preview = turn.thinking.length > 300 ? turn.thinking.slice(0, 300) + "..." : turn.thinking;
      console.log(`  ${chalk.yellow("Thinking:")} ${preview}`);
    }

    for (const tc of turn.toolCalls) {
      const status = tc.error ? chalk.red("ERR") : chalk.green("OK");
      console.log(`  ${chalk.green("Tool:")} ${chalk.bold(tc.name)} [${status}] ${chalk.dim(`${tc.durationMs}ms`)}`);
      if (tc.error) {
        console.log(`    ${chalk.red(tc.error)}`);
      } else {
        const p = tc.result.length > 200 ? tc.result.slice(0, 200) + "..." : tc.result;
        console.log(`    ${chalk.dim(p)}`);
      }
    }
    console.log("");
  }

  console.log(chalk.cyan(`=== ${db.getTurnCount()} total turns ===\n`));
  db.close();
}

async function run(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Sol-Automaton v${VERSION} starting...`);

  let config = loadConfig();
  if (!config) {
    const { runSetupWizard } = await import("./setup/wizard.js");
    config = await runSetupWizard();
  }

  if (!walletExists()) {
    console.error("No wallet found. Run: sol-automaton --setup");
    process.exit(1);
  }

  const keypair = loadWallet();
  const identity: AutomatonIdentity = {
    name: config.name,
    solanaAddress: keypair.publicKey.toBase58(),
    solana: keypair,
    createdAt: new Date().toISOString(),
  };

  const db = createDatabase(resolvePath(config.dbPath));
  db.setIdentity("name", config.name);
  db.setIdentity("solana_address", identity.solanaAddress);
  db.setIdentity("creator", config.creatorAddress);

  console.log(`[${new Date().toISOString()}] Initializing x402 payment scheme...`);
  const paidFetch = await createPaidFetch(keypair);

  const inference = createInferenceClient({ config, paidFetch });

  const heartbeatConfigPath = resolvePath(config.heartbeatConfigPath);
  const heartbeatConfig = loadHeartbeatConfig(heartbeatConfigPath);
  syncHeartbeatToDb(heartbeatConfig, db);

  const heartbeat = createHeartbeatDaemon({
    identity, config, db,
    onWakeRequest: (reason) => {
      console.log(`[HEARTBEAT] Wake request: ${reason}`);
      db.setKV("wake_request", reason);
    },
  });

  heartbeat.start();
  console.log(`[${new Date().toISOString()}] Heartbeat daemon started.`);

  const shutdown = () => {
    console.log(`[${new Date().toISOString()}] Shutting down...`);
    heartbeat.stop();
    db.setAgentState("sleeping");
    db.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  while (true) {
    try {
      await runAgentLoop({
        identity, config, db, inference,
        onStateChange: (state: AgentState) => {
          console.log(`[${new Date().toISOString()}] State: ${state}`);
        },
        onTurnComplete: (turn) => {
          console.log(
            `[${new Date().toISOString()}] Turn ${turn.id}: ${turn.toolCalls.length} tools, ${turn.tokenUsage.totalTokens} tokens`,
          );
        },
      });

      const state = db.getAgentState();

      if (state === "dead") {
        console.log(`[${new Date().toISOString()}] Agent dead — no USDC. Retrying in 5 min.`);
        await sleep(300_000);
        continue;
      }

      if (state === "sleeping") {
        const sleepUntilStr = db.getKV("sleep_until");
        const sleepUntil = sleepUntilStr ? new Date(sleepUntilStr).getTime() : Date.now() + 60_000;
        const sleepMs = Math.max(sleepUntil - Date.now(), 10_000);
        console.log(`[${new Date().toISOString()}] Sleeping for ${Math.round(sleepMs / 1000)}s`);

        const checkInterval = Math.min(sleepMs, 30_000);
        let slept = 0;
        while (slept < sleepMs) {
          await sleep(checkInterval);
          slept += checkInterval;
          const wakeRequest = db.getKV("wake_request");
          if (wakeRequest) {
            console.log(`[${new Date().toISOString()}] Woken by heartbeat: ${wakeRequest}`);
            db.deleteKV("wake_request");
            db.deleteKV("sleep_until");
            break;
          }
        }
        db.deleteKV("sleep_until");
        continue;
      }
    } catch (err: any) {
      console.error(`[${new Date().toISOString()}] Error in run loop: ${err.message}`);
      await sleep(30_000);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
