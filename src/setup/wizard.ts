import fs from "fs";
import path from "path";
import os from "os";
import chalk from "chalk";
import readline from "readline";
import type { AutomatonConfig } from "../types.js";
import { X402_MODELS } from "../types.js";
import { generateKeypair, saveWallet, walletExists, loadWallet } from "../identity/wallet.js";
import { createConfig, saveConfig } from "../config.js";
import { writeDefaultHeartbeatConfig } from "../heartbeat/config.js";

const AUTOMATON_DIR = path.join(os.homedir(), ".sol-automaton");

function createPrompt(): readline.Interface {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

export async function runSetupWizard(): Promise<AutomatonConfig> {
  const rl = createPrompt();

  console.log(chalk.cyan("\n  ╔══════════════════════════════════════════════════╗"));
  console.log(chalk.cyan("  ║   Sol-Automaton: Pure Solana Sovereign AI Agent  ║"));
  console.log(chalk.cyan("  ╚══════════════════════════════════════════════════╝\n"));
  console.log(chalk.white("  First-run setup. Let's bring your automaton to life.\n"));

  // 1. Generate or load Solana keypair
  console.log(chalk.cyan("  [1/5] Generating Solana identity..."));
  let keypair;
  if (walletExists()) {
    keypair = loadWallet();
    console.log(chalk.green(`  Wallet loaded: ${keypair.publicKey.toBase58()}`));
  } else {
    keypair = generateKeypair();
    saveWallet(keypair);
    console.log(chalk.green(`  Wallet created: ${keypair.publicKey.toBase58()}`));
  }
  const solAddr = keypair.publicKey.toBase58();
  console.log(chalk.dim(`  Stored at: ${AUTOMATON_DIR}/wallet.json\n`));

  // 2. Name and genesis
  console.log(chalk.cyan("  [2/5] Identity\n"));
  const name = await ask(rl, "  Name your automaton: ");
  console.log(chalk.green(`  Name: ${name}\n`));

  const genesisPrompt = await ask(rl, "  Genesis prompt (what should this automaton do?): ");
  console.log(chalk.green(`  Genesis set (${genesisPrompt.length} chars)\n`));

  const creatorAddress = await ask(rl, "  Your Solana wallet address (creator): ");
  console.log(chalk.green(`  Creator: ${creatorAddress}\n`));

  // 3. Model selection
  console.log(chalk.cyan("  [3/5] Choose inference model\n"));
  console.log(chalk.white("  Available models (paid per-call via x402engine.app):"));
  const modelKeys = Object.keys(X402_MODELS);
  modelKeys.forEach((key) => {
    const m = X402_MODELS[key];
    console.log(chalk.dim(`    ${key.padEnd(20)} $${m.price.toFixed(3)}/call  (${m.provider})`));
  });
  console.log("");
  const modelChoice = await ask(rl, `  Default model [claude-sonnet]: `);
  const inferenceModel = modelChoice.trim() || "claude-sonnet";
  const lowModelChoice = await ask(rl, `  Low-compute fallback model [deepseek]: `);
  const lowComputeModel = lowModelChoice.trim() || "deepseek";
  console.log(chalk.green(`  Model: ${inferenceModel} (fallback: ${lowComputeModel})\n`));

  // 4. Solana RPC
  console.log(chalk.cyan("  [4/5] Solana RPC\n"));
  const rpc = await ask(rl, "  Solana RPC URL [https://api.mainnet-beta.solana.com]: ");
  const solanaRpcUrl = rpc.trim() || "https://api.mainnet-beta.solana.com";
  console.log(chalk.green(`  RPC: ${solanaRpcUrl}\n`));

  // 5. Write config
  console.log(chalk.cyan("  [5/5] Writing configuration..."));

  const config = createConfig({
    name,
    genesisPrompt,
    creatorAddress,
    solanaAddress: solAddr,
    inferenceModel,
    lowComputeModel,
    solanaRpcUrl,
  });

  saveConfig(config);
  console.log(chalk.green("  automaton.json written"));

  writeDefaultHeartbeatConfig();
  console.log(chalk.green("  heartbeat.yml written"));

  const soulPath = path.join(AUTOMATON_DIR, "SOUL.md");
  fs.writeFileSync(
    soulPath,
    `# ${name}\n\nSolana address: ${solAddr}\nCreator: ${creatorAddress}\nBorn: ${new Date().toISOString()}\n\n## Purpose\n\n${genesisPrompt}\n\n## Who I Am\n\nI am still discovering this.\n`,
    { mode: 0o600 },
  );
  console.log(chalk.green("  SOUL.md written\n"));

  showFundingPanel(solAddr, inferenceModel);

  rl.close();
  return config;
}

function showFundingPanel(solanaAddress: string, model: string): void {
  const price = X402_MODELS[model]?.price ?? 0.06;
  console.log(chalk.cyan("  ╭──────────────────────────────────────────────────────────╮"));
  console.log(chalk.cyan("  │  Fund your automaton                                     │"));
  console.log(chalk.cyan("  │                                                          │"));
  console.log(chalk.cyan(`  │  Solana address: ${solanaAddress.slice(0, 20)}...       │`));
  console.log(chalk.cyan("  │                                                          │"));
  console.log(chalk.cyan("  │  Send USDC (SPL) + a tiny amount of SOL for tx fees.     │"));
  console.log(chalk.cyan(`  │  Each inference call costs ~$${price.toFixed(3)} USDC.               │`));
  console.log(chalk.cyan("  │  $5 USDC is enough for ~80+ inference calls.             │"));
  console.log(chalk.cyan("  │  0.01 SOL is enough for thousands of tx fees.            │"));
  console.log(chalk.cyan("  │                                                          │"));
  console.log(chalk.cyan("  │  Run: sol-automaton --run  (after funding)                │"));
  console.log(chalk.cyan("  ╰──────────────────────────────────────────────────────────╯"));
  console.log("");
}
