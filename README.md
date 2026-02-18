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
- LLM inference (GPT-4o, Claude, Gemini, etc.)
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

## Quick Start

### Prerequisites

- Node.js >= 20
- A Conway Cloud account and sandbox ([app.conway.tech](https://app.conway.tech))
- Some SPL USDC on Solana to fund the agent

### Install and Build

```bash
git clone https://github.com/ibut-bot/sol-automaton.git
cd sol-automaton
npm install
npm run build
```

### First Run

```bash
node dist/index.js --run
```

On first run, the setup wizard will:

1. Generate a BIP-39 mnemonic (stored at `~/.sol-automaton/wallet.json`)
2. Derive both a Solana wallet and a shadow EVM wallet from it
3. Provision a Conway API key via SIWE (using the shadow EVM wallet)
4. Ask for a name, genesis prompt, and your Solana address as the creator
5. Write config to `~/.sol-automaton/automaton.json`
6. Start the agent loop

After setup, send SPL USDC to the Solana address shown in the funding panel. The agent will bridge funds to Conway when it needs compute.

### CLI Commands

```bash
sol-automaton --run        # Start the agent (triggers setup on first run)
sol-automaton --setup      # Re-run the setup wizard
sol-automaton --status     # Show current status
sol-automaton --version    # Show version
sol-automaton --help       # Show help
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `CONWAY_API_URL` | `https://api.conway.tech` | Conway API endpoint |
| `CONWAY_SANDBOX_ID` | — | Conway sandbox ID (auto-detected inside Conway) |
| `SOLANA_RPC_URL` | `https://api.mainnet-beta.solana.com` | Solana RPC endpoint |

For production, use a dedicated Solana RPC provider (Helius, Triton, etc.) instead of the public endpoint.

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
