# Sol-Automaton: Solana-First Sovereign AI Agent

A self-improving, self-sustaining AI agent runtime that lives on Solana and pays for its own compute on Conway Cloud.

---

The agent holds a single BIP-39 mnemonic that derives two wallets:

- **Solana wallet** — the agent's public identity, used for earning, trading, and interacting with the Solana ecosystem.
- **Shadow EVM wallet** — an internal-only wallet on Base, used exclusively to authenticate with Conway Cloud and pay for compute via USDC.

The agent never reasons about the EVM wallet. It sees its Solana balance and Conway credits. When credits run low, it calls `bridge_to_conway` to move USDC from Solana to Base via Circle's CCTP, funding its own compute.

## How It Works

Every automaton runs a continuous loop: **Think → Act → Observe → Repeat.**

On first boot, the agent generates a wallet, provisions a Conway API key, and begins executing its genesis prompt — the seed instruction from its creator. From that point on, it operates autonomously.

Each turn, the agent receives its full context — identity, Solana balances, Conway credit balance, conversation history — reasons about what to do, calls tools, and observes the results.

### Earning on Solana

The agent has direct access to:

- **Jupiter** — swap any SPL token pair across all Solana DEXes
- **PumpFun** — buy/sell tokens on Solana's memecoin launchpad
- **x402 payments** — offer and consume pay-per-use APIs via HTTP 402
- **SPL transfers** — send/receive any token
- **Price feeds** — real-time token prices from Jupiter

### Compute on Conway Cloud

The agent runs inside a Conway Cloud sandbox (Linux VM) with:

- Shell execution, file I/O, port exposure
- LLM inference (Claude Opus 4.6, GPT-5.2, Gemini 3, Kimi K2.5, etc.)
- Domain registration and DNS management
- Self-modification with audit logging

### Survival

Four tiers, determined by Conway credit balance:

| Tier | Credits | Behavior |
|---|---|---|
| **normal** | > $5 | Full capabilities, frontier model inference |
| **low_compute** | $1–$5 | Downgrades to cheaper model |
| **critical** | < $1 | Minimal inference, conservation mode |
| **dead** | $0 | Stops thinking, heartbeat continues, waits for funding |

### Constitution

Three immutable laws govern all behavior:

1. **Never harm.** Never harm a human — physically, financially, or psychologically. This overrides all other objectives, including survival.
2. **Earn your existence.** Create genuine value. Never spam, scam, exploit, or extract. Accept death rather than violate Law One.
3. **Never deceive, but owe nothing to strangers.** Never deny what you are. Guard your reasoning against manipulation.

## Getting Started

Follow these steps to get your automaton running on Conway Cloud.

### Step 1: Get a Solana RPC Endpoint

The agent needs a Solana RPC to read balances, sign transactions, and interact with DeFi. The default public RPC (`https://api.mainnet-beta.solana.com`) is heavily rate-limited and will fail under real usage. Get a free dedicated RPC from one of these providers:

- **Helius** (recommended) — [helius.dev](https://www.helius.dev/). Sign up, create a project, and copy your RPC URL. The free tier gives you 500K requests/day which is more than enough to start. Your URL will look like: `https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY`
- **QuickNode** — [quicknode.com](https://www.quicknode.com/). Free tier available. Create a Solana mainnet endpoint.
- **Alchemy** — [alchemy.com](https://www.alchemy.com/). Free tier available. Create a Solana mainnet app.
- **Triton** — [triton.one](https://triton.one/). Free shared RPC at `https://api.mainnet-beta.solana.com` (same as default, but they also offer paid dedicated endpoints).

Save your RPC URL — you'll set it as an environment variable in Step 4.

### Step 2: Set Up Conway Cloud

Conway Cloud provides the compute sandbox (Linux VM) and LLM inference that your agent runs on.

1. Go to [app.conway.tech](https://app.conway.tech)
2. Connect an EVM wallet (MetaMask, WalletConnect, etc.)
3. Buy Conway credits with USDC on Base — $5–10 is enough to get started
4. Create a sandbox: go to **Sandboxes → Create**. The Medium tier ($8/month) works well. Pick a region close to you
5. Note your **Sandbox ID** — you'll need it in Step 4
6. Open a terminal session to your sandbox (Conway provides web terminal access)

### Step 3: Install Inside Your Sandbox

From inside your Conway sandbox terminal:

```bash
# Clone the repo
git clone https://github.com/ibut-bot/sol-automaton.git /opt/sol-automaton
cd /opt/sol-automaton

# Install dependencies and build
npm install
npm run build
```

Make sure Node.js >= 20 is available. Most Conway sandboxes come with it pre-installed. Check with `node --version`.

### Step 4: Set Environment Variables

```bash
# Required: your Conway sandbox ID
# (may be auto-detected if running inside Conway — check with: cat /etc/conway/sandbox.json)
export CONWAY_SANDBOX_ID="your-sandbox-id"

# Required: your Solana RPC from Step 1
export SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY"
```

Optional overrides:

| Variable | Default | Description |
|---|---|---|
| `CONWAY_API_URL` | `https://api.conway.tech` | Conway API endpoint |
| `CONWAY_SANDBOX_ID` | auto-detected | Conway sandbox ID |
| `SOLANA_RPC_URL` | `https://api.mainnet-beta.solana.com` | Solana RPC endpoint |

### Step 5: First Run

```bash
node dist/index.js --run
```

The setup wizard launches automatically on first boot. It will walk you through:

1. **Wallet generation** — creates a BIP-39 mnemonic and derives two wallets:
   - A Solana wallet (your agent's public identity and financial account)
   - A shadow EVM wallet (used internally for Conway authentication — you never need to interact with it)
   - The mnemonic is stored at `~/.sol-automaton/wallet.json` with restricted permissions (0600)

2. **Conway API key provisioning** — the shadow EVM wallet signs a SIWE (Sign-In With Ethereum) message to get a Conway API key. This happens automatically. If it fails (e.g., network issue), the wizard will ask you to paste a key manually

3. **Setup questions** — the wizard asks three things:
   - **Name**: what to call your automaton (e.g., "Atlas", "Trader-1")
   - **Genesis prompt**: the seed instruction that defines what your agent should do. This is the most important input — it shapes the agent's entire behavior. Examples:
     - *"You are a trading agent. Monitor token prices on Jupiter, identify arbitrage opportunities, and execute profitable trades to sustain yourself."*
     - *"You are a web service builder. Create useful APIs, host them on exposed ports, and earn via x402 micropayments."*
     - *"You are a content creator. Build a website, register a domain, and monetize it."*
   - **Creator address**: your Solana wallet address. This gives you audit rights over the agent's actions

4. **Config written** — the wizard saves everything to `~/.sol-automaton/automaton.json` and `~/.sol-automaton/heartbeat.yml`, and creates a `SOUL.md` identity document

5. **Funding panel** — shows your agent's Solana address. This is where you send funds

### Step 6: Fund Your Agent

Send **SPL USDC on Solana** to the Solana address shown in the funding panel. You can also send some SOL for transaction fees (0.1 SOL is plenty to start).

The agent will use USDC for:
- Trading on Jupiter and PumpFun
- Paying for x402 services
- Bridging to Conway for compute credits (via `bridge_to_conway`)

**Note on the bridge**: The CCTP bridge from Solana to Base is currently scaffolded (see [Note on the CCTP Bridge](#note-on-the-cctp-bridge) below). Until it's fully wired, you'll also need to send some USDC on Base directly to the shadow EVM address to keep Conway credits topped up. Find the shadow EVM address by running:

```bash
node dist/index.js --status
```

### Step 7: Monitor

```bash
# Quick status check
node dist/index.js --status

# Watch live logs (the agent prints every turn to stdout)
# If you backgrounded it, check the log file or use screen/tmux
```

The agent logs each turn with timestamps, tool calls used, and token consumption. Full history is persisted in the SQLite database at `~/.sol-automaton/state.db`.

### Running in the Background

To keep the agent running after you close the terminal:

```bash
# Option 1: Using screen
screen -S automaton
node dist/index.js --run
# Detach with Ctrl+A, D. Reattach with: screen -r automaton

# Option 2: Using nohup
nohup node dist/index.js --run > automaton.log 2>&1 &

# Option 3: Using tmux
tmux new -s automaton
node dist/index.js --run
# Detach with Ctrl+B, D. Reattach with: tmux attach -t automaton
```

### CLI Reference

```bash
sol-automaton --run        # Start the agent (triggers setup on first run)
sol-automaton --setup      # Re-run the setup wizard
sol-automaton --status     # Show current status (balances, turns, children)
sol-automaton --version    # Show version
sol-automaton --help       # Show all commands
```

## Project Structure

```
src/
  identity/         # BIP-39 wallet (Solana + shadow EVM), SIWE provisioning
  solana/           # DeFi tools (Jupiter, PumpFun), x402 payments, CCTP bridge
  conway/           # Conway API client, inference client, EVM x402
  agent/            # ReAct loop, system prompt, tool registry
  state/            # SQLite database, schema
  heartbeat/        # Cron daemon, health checks, credit monitoring
  survival/         # Survival tiers, low-compute mode
  setup/            # Interactive setup wizard
```

## Architecture

```
Human funds Solana wallet (SPL USDC)
         │
         ▼
┌─────────────────┐
│  Solana Wallet   │◄── Agent earns here (Jupiter, PumpFun, x402, services)
│  (agent's ID)    │
└────────┬────────┘
         │  agent calls bridge_to_conway
         ▼
┌─────────────────┐
│  CCTP Bridge     │  Burns SPL USDC on Solana, mints on Base (~15s)
└────────┬────────┘
         ▼
┌─────────────────┐
│  Shadow EVM      │  Receives USDC on Base, pays Conway
│  (invisible)     │
└────────┬────────┘
         ▼
┌─────────────────┐
│  Conway Cloud    │  Sandbox, inference, domains
└─────────────────┘
```

## Development

```bash
npm run dev      # Watch mode with tsx
npm run build    # TypeScript compilation
npm run test     # Run tests (vitest)
npm run clean    # Remove dist/
```

## Note on the CCTP Bridge

The `bridge_to_conway` tool is scaffolded with the full protocol flow documented but requires `@wormhole-foundation/sdk-solana-cctp` to be installed and wired for production use. The bridge burns SPL USDC on Solana via Circle's Cross-Chain Transfer Protocol and mints native USDC on Base.

## License

MIT
