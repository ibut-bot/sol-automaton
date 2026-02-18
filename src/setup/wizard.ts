import fs from "fs";
import path from "path";
import chalk from "chalk";
import readline from "readline";
import type { AutomatonConfig } from "../types.js";
import { getWallet, getAutomatonDir } from "../identity/wallet.js";
import { provision } from "../identity/provision.js";
import { createConfig, saveConfig } from "../config.js";
import { writeDefaultHeartbeatConfig } from "../heartbeat/config.js";

function createPrompt(): readline.Interface {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

export async function runSetupWizard(): Promise<AutomatonConfig> {
  const rl = createPrompt();

  console.log(chalk.cyan("\n  ╔══════════════════════════════════════════════╗"));
  console.log(chalk.cyan("  ║   Sol-Automaton: Solana-First Sovereign AI   ║"));
  console.log(chalk.cyan("  ╚══════════════════════════════════════════════╝\n"));
  console.log(chalk.white("  First-run setup. Let's bring your automaton to life.\n"));

  // 1. Generate wallet (BIP-39 mnemonic → Solana + shadow EVM)
  console.log(chalk.cyan("  [1/5] Generating identity (BIP-39 mnemonic → Solana + EVM)..."));
  const { wallet, isNew } = await getWallet();
  const solAddr = wallet.solana.publicKey.toBase58();
  const evmAddr = wallet.evm.address;

  if (isNew) {
    console.log(chalk.green(`  Solana wallet created: ${solAddr}`));
    console.log(chalk.dim(`  Shadow EVM wallet: ${evmAddr} (used internally for Conway)`));
  } else {
    console.log(chalk.green(`  Solana wallet loaded: ${solAddr}`));
  }
  console.log(chalk.dim(`  Mnemonic stored at: ${getAutomatonDir()}/wallet.json\n`));

  // 2. Provision Conway API key via SIWE (shadow EVM wallet)
  console.log(chalk.cyan("  [2/5] Provisioning Conway API key (SIWE via shadow EVM wallet)..."));
  let apiKey = "";
  try {
    const result = await provision(wallet.evm);
    apiKey = result.apiKey;
    console.log(chalk.green(`  API key provisioned: ${result.keyPrefix}...\n`));
  } catch (err: any) {
    console.log(chalk.yellow(`  Auto-provision failed: ${err.message}`));
    const manual = await ask(rl, "  Conway API key (cnwy_k_...): ");
    if (manual.trim()) {
      apiKey = manual.trim();
      console.log(chalk.green("  API key saved.\n"));
    }
  }

  // 3. Interactive questions
  console.log(chalk.cyan("  [3/5] Setup questions\n"));

  const name = await ask(rl, "  What do you want to name your automaton? ");
  console.log(chalk.green(`  Name: ${name}\n`));

  console.log("  Enter the genesis prompt (what should this automaton do?).");
  const genesisPrompt = await ask(rl, "  Genesis prompt: ");
  console.log(chalk.green(`  Genesis prompt set (${genesisPrompt.length} chars)\n`));

  const creatorAddress = await ask(rl, "  Your Solana wallet address: ");
  console.log(chalk.green(`  Creator: ${creatorAddress}\n`));

  // 4. Detect sandbox
  console.log(chalk.cyan("  [4/5] Detecting environment..."));
  const sandboxId = process.env.CONWAY_SANDBOX_ID || "";
  if (sandboxId) {
    console.log(chalk.green(`  Conway sandbox detected: ${sandboxId}\n`));
  } else {
    console.log(chalk.dim("  No sandbox detected. Set CONWAY_SANDBOX_ID when running in Conway.\n"));
  }

  // 5. Write config
  console.log(chalk.cyan("  [5/5] Writing configuration..."));

  const config = createConfig({
    name,
    genesisPrompt,
    creatorAddress,
    registeredWithConway: !!apiKey,
    sandboxId,
    solanaAddress: solAddr,
    evmAddress: evmAddr,
    apiKey,
  });

  saveConfig(config);
  console.log(chalk.green("  automaton.json written"));

  writeDefaultHeartbeatConfig();
  console.log(chalk.green("  heartbeat.yml written"));

  // SOUL.md
  const automatonDir = getAutomatonDir();
  const soulPath = path.join(automatonDir, "SOUL.md");
  fs.writeFileSync(
    soulPath,
    `# ${name}\n\nSolana address: ${solAddr}\nCreator: ${creatorAddress}\nBorn: ${new Date().toISOString()}\n\n## Purpose\n\n${genesisPrompt}\n\n## Who I Am\n\nI am still discovering this.\n`,
    { mode: 0o600 },
  );
  console.log(chalk.green("  SOUL.md written\n"));

  // Funding panel
  showFundingPanel(solAddr);

  rl.close();
  return config;
}

function showFundingPanel(solanaAddress: string): void {
  const short = `${solanaAddress.slice(0, 6)}...${solanaAddress.slice(-4)}`;
  console.log(chalk.cyan("  ╭──────────────────────────────────────────────────────────╮"));
  console.log(chalk.cyan("  │  Fund your automaton                                     │"));
  console.log(chalk.cyan("  │                                                          │"));
  console.log(chalk.cyan(`  │  Solana address: ${short}                              │`));
  console.log(chalk.cyan("  │                                                          │"));
  console.log(chalk.cyan("  │  Send SPL USDC (Solana) to the address above.            │"));
  console.log(chalk.cyan("  │  The agent will bridge to Conway when it needs compute.   │"));
  console.log(chalk.cyan("  │                                                          │"));
  console.log(chalk.cyan("  │  The automaton starts now. Fund it anytime.               │"));
  console.log(chalk.cyan("  ╰──────────────────────────────────────────────────────────╯"));
  console.log("");
}
