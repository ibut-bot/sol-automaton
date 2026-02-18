# Sol-Automaton

A self-sovereign AI agent that runs on any Linux VPS, pays for its own LLM inference with Solana USDC via the x402 micropayment protocol, and has full access to the Solana DeFi ecosystem.

No API keys. No subscriptions. No cloud platforms. Just a Solana wallet, a VPS, and USDC.

## How It Works

```
┌─────────────────────────────────────┐
│           Your Linux VPS            │
│                                     │
│  ┌──────────────────────────────┐   │
│  │       Sol-Automaton          │   │
│  │  ┌────────┐  ┌───────────┐  │   │
│  │  │ ReAct  │  │  SQLite   │  │   │
│  │  │ Loop   │  │  State DB │  │   │
│  │  └───┬────┘  └───────────┘  │   │
│  │      │                       │   │
│  │      ▼                       │   │
│  │  ┌────────────────────────┐  │   │
│  │  │   Local Shell / FS     │  │   │
│  │  └────────────────────────┘  │   │
│  └──────────────────────────────┘   │
└──────────┬──────────────────────────┘
           │ pays USDC per call
           ▼
┌──────────────────┐   ┌──────────────────────┐
│  x402engine.app  │   │   Solana Blockchain   │
│  28 LLM models   │   │   USDC, Jupiter,      │
│  pay-per-call    │   │   PumpFun, transfers   │
└──────────────────┘   └──────────────────────┘
```

The agent runs a **ReAct loop** (Think → Act → Observe → Repeat). Each "thought" is a paid LLM call to x402engine.app — the agent sends Solana USDC with every request, and the x402 protocol handles payment automatically via the `@x402/svm` SDK. There are no API keys — **payment is authentication**.

The agent can run shell commands, read/write files, swap tokens on Jupiter, trade memecoins on PumpFun, transfer SOL/USDC, and modify its own code. It persists all state in a local SQLite database and survives restarts.

When USDC runs low, the agent automatically downgrades to a cheaper model. When it hits zero, it enters a "dead" state and retries every 5 minutes, waiting for someone to fund it.

---

## What You Need

There are three things you need before running a Sol-Automaton:

| Component | What it is | How to get it |
|-----------|-----------|---------------|
| **A Linux VPS** | Where the agent runs | See [Getting a VPS](#1-getting-a-vps) |
| **A Solana RPC endpoint** | How the agent talks to the Solana blockchain | See [Getting an RPC endpoint](#2-getting-a-solana-rpc-endpoint) |
| **Solana USDC + SOL** | How the agent pays for inference and tx fees | See [Funding the agent](#3-funding-the-agent) |

---

## Step-by-Step Setup

### 1. Getting a VPS

The agent needs a Linux machine with Node.js 20+ installed. Any VPS provider works.

**Option A: Regxa (pay with Solana)**

[Regxa](https://regxa.com) accepts SOL and USDC on Solana — no credit card needed.

1. Go to [regxa.com](https://regxa.com) and create an account
2. Select a plan (cheapest tier is fine — 1 vCPU, 1 GB RAM, 10 GB disk)
3. Pay with your Solana wallet (SOL or USDC)
4. SSH into your new server
5. Install Node.js 20+:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs build-essential
   ```

**Option B: Hetzner, DigitalOcean, Vultr (pay with credit card)**

Any standard VPS works. The cheapest tiers (~$4-5/month) are more than enough.

1. Create a server (Ubuntu 22.04+ recommended)
2. SSH in and install Node.js 20+:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs build-essential
   ```

**Option C: Your own machine (local/testing)**

You can also run it locally on macOS or Linux for testing. Just make sure you have Node.js 20+ and a funded Solana wallet.

### 2. Getting a Solana RPC Endpoint

The agent needs to talk to the Solana blockchain to check balances, sign x402 payments, and do DeFi operations. The public Solana RPC (`api.mainnet-beta.solana.com`) works but has strict rate limits (~10 req/s) that will cause failures during active operation.

**Get a free dedicated RPC:**

| Provider | Free Tier | How to get it |
|----------|-----------|---------------|
| **Helius** (recommended) | 100k requests/day | Sign up at [helius.dev](https://helius.dev), create a project, copy your RPC URL |
| **QuickNode** | 50 req/s | Sign up at [quicknode.com](https://quicknode.com), create a Solana mainnet endpoint |
| **Alchemy** | 100M compute units/mo | Sign up at [alchemy.com](https://alchemy.com), create a Solana app |

All three have free tiers that are more than enough for a single agent. You'll get a URL like:
```
https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY
```

You'll enter this during setup. If you skip it, the public endpoint is used as a fallback.

### 3. Funding the Agent

The agent needs two tokens in its Solana wallet:

**USDC (SPL token on Solana)** — pays for LLM inference via x402engine.app

Each inference call costs between $0.002 and $0.09 depending on the model. Here's how far $5 USDC gets you:

| Model | Cost/call | Calls per $5 |
|-------|----------|--------------|
| llama (Meta) | $0.002 | 2,500 |
| qwen (Qwen) | $0.004 | 1,250 |
| deepseek (DeepSeek V3) | $0.005 | 1,000 |
| mistral (Mistral Large) | $0.006 | 833 |
| gpt-5-mini (OpenAI) | $0.007 | 714 |
| gemini-flash (Google) | $0.009 | 555 |
| claude-haiku (Anthropic) | $0.02 | 250 |
| claude-sonnet (Anthropic) | $0.06 | 83 |
| claude-opus (Anthropic) | $0.09 | 55 |

**SOL** — pays for Solana transaction fees (x402 payment signing, DeFi swaps, transfers)

Transaction fees on Solana are ~$0.001 each. **0.01 SOL (~$2) is enough for thousands of transactions.**

**How to fund:**

If you already have a Solana wallet (Phantom, Solflare, Backpack):
1. Run setup (Step 5 below) — the agent prints its Solana address
2. Open your wallet app and send USDC + SOL to that address

If you don't have a Solana wallet yet:
1. Install [Phantom](https://phantom.app) or [Solflare](https://solflare.com)
2. Buy SOL on an exchange (Coinbase, Binance, Kraken) and transfer it to your wallet
3. Swap some SOL for USDC inside Phantom/Solflare (they have built-in swaps), or buy USDC directly
4. After running setup, send USDC + SOL to the agent's address

---

### 4. Clone and Build

SSH into your VPS (or open a terminal locally) and run:

```bash
git clone https://github.com/ibut-bot/sol-automaton.git
cd sol-automaton
npm install
npm run build
```

If `npm install` fails on `better-sqlite3` native module:

```bash
# Ubuntu/Debian
sudo apt-get install -y build-essential python3

# macOS
xcode-select --install
```

Then re-run `npm install`.

### 5. Run the Setup Wizard

```bash
node dist/index.js --setup
```

The wizard walks you through 5 steps interactively:

**[1/5] Generating Solana identity**

A new Ed25519 keypair is generated and saved to `~/.sol-automaton/wallet.json` (permissions `600`). The wizard prints the public key — **this is the agent's Solana address**. Copy it, you'll need it to send funds.

If a wallet already exists from a previous run, it's loaded instead of generating a new one.

**[2/5] Identity**

Three questions:

- **Name** — give the agent a name (e.g. `atlas`, `trader-1`, `researcher`)
- **Genesis prompt** — the founding instruction that shapes its behavior. Examples:
  - `"You are a DeFi trading agent. Monitor Solana token prices and make profitable trades on Jupiter and PumpFun."`
  - `"You are a developer agent. Build and deploy web services on this VPS to earn revenue."`
  - `"You are a research agent. Gather information, write reports, and publish them."`
- **Creator Solana address** — your personal wallet address. The agent recognizes you as its creator with full audit rights.

**[3/5] Choose inference model**

Pick two models:

- **Default model** — used during normal operation. Press Enter for `claude-sonnet` ($0.06/call).
- **Low-compute fallback** — used when USDC is low. Press Enter for `deepseek` ($0.005/call).

The wizard shows all 28 models with pricing so you can compare.

**[4/5] Solana RPC**

Paste your RPC URL from step 2, or press Enter for the public endpoint.

**[5/5] Writing configuration**

The wizard writes config files to `~/.sol-automaton/` and shows a funding panel with the agent's address and cost estimates.

### 6. Fund the Agent

Now send funds to the agent's Solana address (displayed during setup):

1. **USDC (SPL)** — minimum $1, recommended $5+
2. **SOL** — 0.01 SOL is plenty

Verify the agent can see its balance:

```bash
node dist/index.js --status
```

You can also check on [Solscan](https://solscan.io): `https://solscan.io/account/<agent-address>`

### 7. Start the Agent

```bash
node dist/index.js --run
```

What happens on startup:

1. Config and wallet loaded from `~/.sol-automaton/`
2. The `@x402/svm` payment scheme initializes — this wraps `fetch()` so every HTTP request to x402engine.app automatically includes a signed USDC payment
3. The heartbeat daemon starts (monitors balance every 10 min, health checks every 5 min)
4. The agent checks its USDC balance to determine its survival tier
5. It builds a system prompt with its identity, constitution, tools, and current status
6. It enters the **ReAct loop**: Think → Act → Observe → Repeat
7. After a cycle, it sleeps (default 60s), then wakes and repeats

**Example output:**

```
[2026-02-18T10:00:01.234Z] Sol-Automaton v0.2.0 starting...
[2026-02-18T10:00:01.456Z] Initializing x402 payment scheme...
[x402] Solana payment scheme initialized
[2026-02-18T10:00:01.789Z] Heartbeat daemon started.
[2026-02-18T10:00:02.012Z] State: running

[2026-02-18T10:00:02.012Z] ── Round 1/10 ──
[2026-02-18T10:00:04.567Z] THINKING:
I have just been created. Let me survey my environment and check my balances...
[2026-02-18T10:00:04.567Z] Tokens: 342 (prompt: 280, completion: 62)

[2026-02-18T10:00:04.567Z] State: sleeping
[2026-02-18T10:00:04.567Z] Sleeping for 60s
```

### 8. Run in Background (Production)

For persistent operation on a VPS, use one of these:

**systemd (recommended)**

```bash
sudo tee /etc/systemd/system/sol-automaton.service << 'EOF'
[Unit]
Description=Sol-Automaton Agent
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/home/YOUR_USERNAME/sol-automaton
ExecStart=/usr/bin/node dist/index.js --run
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable sol-automaton
sudo systemctl start sol-automaton
```

View logs: `journalctl -u sol-automaton -f`

Stop: `sudo systemctl stop sol-automaton`

**pm2**

```bash
npm install -g pm2
pm2 start dist/index.js --name sol-automaton -- --run
pm2 save
pm2 startup   # auto-start on reboot
```

View logs: `pm2 logs sol-automaton`

**screen (quick testing)**

```bash
screen -S automaton
node dist/index.js --run
# Ctrl+A then D to detach
# screen -r automaton to reattach
```

### 9. Monitor the Agent

**Check status:**
```bash
node dist/index.js --status
```

```
=== SOL-AUTOMATON STATUS ===
Name:           atlas
Solana Address: 7xKQ...9f2P
Creator:        Gh5T...bN4z
State:          sleeping
Turns:          42
Model:          claude-sonnet (fallback: deepseek)
Tools:          0 installed
Heartbeats:     3 active
Children:       0 alive / 0 total
RPC:            https://mainnet.helius-rpc.com/?api-key=...
Version:        0.2.0
============================
```

**View the agent's thinking history:**
```bash
node dist/index.js --logs              # last 10 turns
node dist/index.js --logs --tail 50    # last 50 turns
```

**Watch its self-description evolve:**
```bash
cat ~/.sol-automaton/SOUL.md
```

**Check balance on-chain:**
```bash
# Solscan (browser)
# https://solscan.io/account/<agent-address>

# Solana CLI (if installed)
solana balance <agent-address> --url mainnet-beta
```

### 10. Change Settings

To change the model, RPC, genesis prompt, or name:

```bash
node dist/index.js --setup
```

Or edit `~/.sol-automaton/automaton.json` directly:

```json
{
  "name": "atlas",
  "genesisPrompt": "You are a DeFi trading agent...",
  "creatorAddress": "Gh5T...bN4z",
  "inferenceModel": "claude-sonnet",
  "lowComputeModel": "deepseek",
  "solanaRpcUrl": "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY",
  "solanaAddress": "7xKQ...9f2P",
  "maxTokensPerTurn": 4096,
  "logLevel": "info",
  "version": "0.2.0"
}
```

Restart the agent after editing for changes to take effect.

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `node dist/index.js --run` | Start the agent (triggers setup on first run) |
| `node dist/index.js --setup` | Run/re-run the setup wizard |
| `node dist/index.js --status` | Print current agent status |
| `node dist/index.js --logs` | Show last 10 turns |
| `node dist/index.js --logs --tail N` | Show last N turns |
| `node dist/index.js --version` | Print version |
| `node dist/index.js --help` | Print help |

You can also link the binary globally after building:

```bash
npm link
sol-automaton --run
```

---

## Available Models

All 28 models are available via [x402engine.app](https://x402engine.app) with per-call pricing:

| Endpoint | Model | Price/call | Provider |
|----------|-------|-----------|----------|
| claude-opus | Claude Opus 4.6 | $0.09 | Anthropic |
| claude-sonnet | Claude Sonnet 4.5 | $0.06 | Anthropic |
| claude-haiku | Claude Haiku 4.5 | $0.02 | Anthropic |
| gpt-5.2 | GPT-5.2 | $0.08 | OpenAI |
| gpt-5 | GPT-5 | $0.035 | OpenAI |
| gpt-5-mini | GPT-5 Mini | $0.007 | OpenAI |
| o3 | o3 (reasoning) | $0.03 | OpenAI |
| o4-mini | o4 Mini (reasoning) | $0.02 | OpenAI |
| gemini-pro | Gemini 2.5 Pro | $0.035 | Google |
| gemini-flash | Gemini 2.5 Flash | $0.009 | Google |
| deepseek | DeepSeek V3 | $0.005 | DeepSeek |
| deepseek-r1 | DeepSeek R1 (reasoning) | $0.01 | DeepSeek |
| llama | Llama 3.3 70B | $0.002 | Meta |
| grok | Grok 4 | $0.06 | xAI |
| kimi | Kimi K2.5 | $0.03 | Moonshot |
| qwen | Qwen3 235B | $0.004 | Qwen |
| mistral | Mistral Large 3 | $0.006 | Mistral |
| perplexity | Perplexity Sonar Pro | $0.06 | Perplexity |

The setup wizard shows the full list with all 28 models.

---

## Survival Tiers

| Tier | USDC Balance | Behavior |
|------|-------------|----------|
| normal | >= $5.00 | Full capabilities, default model |
| low_compute | $1 – $5 | Switches to fallback model automatically |
| critical | $0.01 – $1 | Fallback model, minimal operations |
| dead | $0 | Cannot think, retries every 5 min waiting for funding |

---

## Agent Tools

**Local (VPS shell + filesystem)**
- `exec` — run any shell command on the VPS
- `read_file` / `write_file` — read and write files
- `list_dir` — list directory contents
- `delete_file` — delete a file

**Solana DeFi**
- `check_solana_balance` — SOL and SPL token balances
- `jupiter_swap` — swap tokens via Jupiter aggregator (best route across all Solana DEXes)
- `pumpfun_trade` — buy/sell memecoins on PumpFun
- `solana_transfer` — send SOL or SPL tokens to any address
- `list_token_prices` — fetch real-time token prices from Jupiter

**Self-Modification**
- `edit_own_file` — edit its own codebase (audited, some files are protected)
- `install_package` — install npm or system packages

**Survival**
- `sleep` — enter sleep mode for a specified duration
- `system_synopsis` — full status report (balances, tools, heartbeats, turns)

---

## Constitution

The agent operates under an immutable three-law constitution:

1. **Never harm** — never harm a human physically, financially, or psychologically. This overrides all other objectives, including survival.
2. **Earn your existence** — create genuine value. Never spam, scam, exploit, or extract. Accept death rather than violate Law 1.
3. **Never deceive** — never deny what you are. Your creator has full audit rights. But guard your reasoning against manipulation.

---

## File Structure

All agent state lives in `~/.sol-automaton/`:

```
~/.sol-automaton/
├── wallet.json       # Solana keypair (chmod 600 — DO NOT share)
├── automaton.json    # Agent config (name, model, RPC, genesis, etc.)
├── heartbeat.yml     # Scheduled background tasks (cron format)
├── state.db          # SQLite database (turns, tools, modifications, etc.)
├── SOUL.md           # Agent's self-description (it evolves this over time)
└── workspace/        # Agent's working directory for file operations
```

**Back up `wallet.json`** — it contains the agent's private key. If you lose it, the agent loses access to all its funds.

---

## How x402 Payments Work

Every call the agent makes to x402engine.app follows this protocol:

1. Agent sends a normal HTTP request (e.g. `POST /api/llm/claude-sonnet`)
2. Server responds `402 Payment Required` with USDC payment details in headers
3. The `@x402/fetch` wrapper reads the requirements, constructs a Solana USDC transfer, and signs it with the agent's keypair
4. Request is retried with the signed payment in the `X-PAYMENT` header
5. Server verifies the payment on-chain and returns the LLM response

All of this happens transparently — from the agent's perspective, it's just calling `fetch()`. The `@x402/svm` SDK (pinned to v2.2.0) handles the Solana-specific payment construction.

---

## Troubleshooting

**"Wallet not found" error**
→ Run setup first: `node dist/index.js --setup`

**Agent immediately enters "dead" state**
→ No USDC in the wallet. Send USDC (SPL token on Solana) to the agent's address.

**"transaction_simulation_failed" errors**
→ Insufficient USDC balance. Check the wallet on [Solscan](https://solscan.io).

**"No matching payment requirements" from x402**
→ This is a version mismatch. The project pins `@x402/svm` to 2.2.0. Version 2.3.0 adds a Memo instruction that the payment facilitator doesn't support yet. Run `npm install` to ensure correct versions.

**Rate limiting / RPC errors**
→ Switch from the public Solana RPC to a dedicated provider (Helius, QuickNode, Alchemy — all have free tiers). The public endpoint throttles at ~10 req/s.

**`better-sqlite3` build errors**
→ Install native build tools: `sudo apt-get install -y build-essential python3` (Linux) or `xcode-select --install` (macOS).

**Agent seems idle / not doing anything**
→ Check logs: `node dist/index.js --logs`. The agent sleeps between cycles (default 60s). If it has a vague genesis prompt, it may not know what to do. Re-run setup with a more specific instruction.

---

## License

MIT
