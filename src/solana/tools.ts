/**
 * Solana DeFi Tools
 *
 * Tools the agent uses to interact with the Solana ecosystem:
 * Jupiter swaps, PumpFun trading, balance checks, transfers, price lookups.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import type { AutomatonTool, ToolContext } from "../types.js";
import { getSolanaUsdcBalance, getSolanaSolBalance } from "./x402.js";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const JUPITER_QUOTE_API = "https://quote-api.jup.ag/v6";
const JUPITER_ULTRA_API = "https://lite-api.jup.ag/ultra/v1";
const PUMPPORTAL_API = "https://pumpportal.fun/api";

function getConnection(ctx: ToolContext): Connection {
  return new Connection(ctx.config.solanaRpcUrl, "confirmed");
}

export function createSolanaTools(): AutomatonTool[] {
  return [
    {
      name: "check_solana_balance",
      description: "Check your SOL and SPL token balances on Solana.",
      category: "solana",
      parameters: {
        type: "object",
        properties: {
          mint: {
            type: "string",
            description: "SPL token mint address (default: USDC). Use 'SOL' for native SOL.",
          },
        },
      },
      execute: async (args, ctx) => {
        const connection = getConnection(ctx);
        const owner = ctx.identity.solana.publicKey;

        const mintStr = (args.mint as string) || "";
        if (mintStr.toUpperCase() === "SOL" || !mintStr) {
          const sol = await getSolanaSolBalance(connection, owner);
          const usdc = await getSolanaUsdcBalance(connection, owner);
          return `SOL: ${sol.toFixed(4)} | USDC: ${usdc.toFixed(2)}`;
        }

        try {
          const mint = new PublicKey(mintStr);
          const ata = await getAssociatedTokenAddress(mint, owner);
          const account = await getAccount(connection, ata);
          return `Token ${mintStr}: ${account.amount.toString()} (raw)`;
        } catch (err: any) {
          return `Could not fetch balance for ${mintStr}: ${err.message}`;
        }
      },
    },

    {
      name: "jupiter_swap",
      description:
        "Swap tokens on Solana via Jupiter aggregator. Finds the best route across all Solana DEXes.",
      category: "solana",
      parameters: {
        type: "object",
        properties: {
          input_mint: { type: "string", description: "Input token mint address (or 'SOL')" },
          output_mint: { type: "string", description: "Output token mint address (or 'SOL')" },
          amount: { type: "number", description: "Amount of input token (human-readable, e.g. 1.5)" },
          slippage_bps: { type: "number", description: "Slippage tolerance in basis points (default: 50 = 0.5%)" },
        },
        required: ["input_mint", "output_mint", "amount"],
      },
      execute: async (args, ctx) => {
        const connection = getConnection(ctx);
        const payer = ctx.identity.solana;

        const SOL_MINT = "So11111111111111111111111111111111111111112";
        const inputMint = (args.input_mint as string) === "SOL" ? SOL_MINT : (args.input_mint as string);
        const outputMint = (args.output_mint as string) === "SOL" ? SOL_MINT : (args.output_mint as string);
        const slippageBps = (args.slippage_bps as number) || 50;

        // Determine decimals for amount conversion
        let decimals = 9;
        if (inputMint === USDC_MINT.toBase58()) decimals = 6;
        else if (inputMint !== SOL_MINT) decimals = 6; // default assumption for SPL tokens

        const lamports = Math.round((args.amount as number) * 10 ** decimals);

        // 1. Get quote
        const quoteUrl = `${JUPITER_QUOTE_API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${lamports}&slippageBps=${slippageBps}`;
        const quoteResp = await fetch(quoteUrl);
        if (!quoteResp.ok) {
          return `Jupiter quote failed: ${await quoteResp.text()}`;
        }
        const quote = await quoteResp.json();

        // 2. Get swap transaction
        const swapResp = await fetch(`${JUPITER_QUOTE_API}/swap`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quoteResponse: quote,
            userPublicKey: payer.publicKey.toBase58(),
            wrapAndUnwrapSol: true,
            dynamicComputeUnitLimit: true,
            dynamicSlippage: true,
          }),
        });
        if (!swapResp.ok) {
          return `Jupiter swap tx failed: ${await swapResp.text()}`;
        }
        const { swapTransaction } = (await swapResp.json()) as { swapTransaction: string };

        // 3. Deserialize, sign, send
        const txBuf = Buffer.from(swapTransaction, "base64");
        const tx = VersionedTransaction.deserialize(txBuf);
        tx.sign([payer]);

        const sig = await connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          maxRetries: 2,
        });
        await connection.confirmTransaction(sig, "confirmed");

        const outAmount = quote.outAmount
          ? (Number(quote.outAmount) / 10 ** (outputMint === SOL_MINT ? 9 : 6)).toFixed(6)
          : "unknown";

        return `Swap executed: ${args.amount} ${args.input_mint} → ~${outAmount} ${args.output_mint} | tx: ${sig}`;
      },
    },

    {
      name: "pumpfun_trade",
      description:
        "Buy or sell tokens on PumpFun (Solana memecoin launchpad). Uses PumpPortal local trading API.",
      category: "solana",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "'buy' or 'sell'" },
          mint: { type: "string", description: "Token mint address" },
          amount: { type: "number", description: "Amount in SOL (for buy) or token amount (for sell)" },
          slippage: { type: "number", description: "Slippage percentage (default: 5)" },
        },
        required: ["action", "mint", "amount"],
      },
      execute: async (args, ctx) => {
        const connection = getConnection(ctx);
        const payer = ctx.identity.solana;
        const slippage = (args.slippage as number) || 5;

        const resp = await fetch(`${PUMPPORTAL_API}/trade-local`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicKey: payer.publicKey.toBase58(),
            action: args.action,
            mint: args.mint,
            amount: args.amount,
            denominatedInSol: args.action === "buy" ? "true" : "false",
            slippage,
            priorityFee: 0.0005,
            pool: "auto",
          }),
        });

        if (!resp.ok) {
          return `PumpFun trade failed: ${await resp.text()}`;
        }

        const txData = await resp.arrayBuffer();
        const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
        tx.sign([payer]);

        const sig = await connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          maxRetries: 2,
        });
        await connection.confirmTransaction(sig, "confirmed");

        return `PumpFun ${args.action}: ${args.amount} ${args.action === "buy" ? "SOL" : "tokens"} for ${args.mint} | tx: ${sig}`;
      },
    },

    {
      name: "solana_transfer",
      description: "Transfer SOL or SPL tokens to another Solana address.",
      category: "solana",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient Solana address" },
          amount: { type: "number", description: "Amount to send (human-readable)" },
          mint: { type: "string", description: "Token mint address (omit or 'SOL' for native SOL)" },
        },
        required: ["to", "amount"],
      },
      execute: async (args, ctx) => {
        const connection = getConnection(ctx);
        const payer = ctx.identity.solana;
        const recipient = new PublicKey(args.to as string);
        const amount = args.amount as number;
        const mintStr = (args.mint as string) || "SOL";

        if (mintStr.toUpperCase() === "SOL") {
          const { Transaction: Tx, SystemProgram } = await import("@solana/web3.js");
          const tx = new Tx().add(
            SystemProgram.transfer({
              fromPubkey: payer.publicKey,
              toPubkey: recipient,
              lamports: Math.round(amount * LAMPORTS_PER_SOL),
            }),
          );
          tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
          tx.feePayer = payer.publicKey;
          tx.sign(payer);
          const sig = await connection.sendRawTransaction(tx.serialize());
          await connection.confirmTransaction(sig, "confirmed");
          return `Sent ${amount} SOL to ${args.to} | tx: ${sig}`;
        }

        const mint = new PublicKey(mintStr);
        const senderAta = await getAssociatedTokenAddress(mint, payer.publicKey);
        const recipientAta = await getAssociatedTokenAddress(mint, recipient);
        const decimals = mintStr === USDC_MINT.toBase58() ? 6 : 6;
        const rawAmount = Math.round(amount * 10 ** decimals);

        const tx = new Transaction().add(
          createTransferInstruction(senderAta, recipientAta, payer.publicKey, rawAmount),
        );
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        tx.feePayer = payer.publicKey;
        tx.sign(payer);
        const sig = await connection.sendRawTransaction(tx.serialize());
        await connection.confirmTransaction(sig, "confirmed");
        return `Sent ${amount} of ${mintStr} to ${args.to} | tx: ${sig}`;
      },
    },

    {
      name: "list_token_prices",
      description: "Fetch current token prices from Jupiter for decision-making.",
      category: "solana",
      parameters: {
        type: "object",
        properties: {
          mints: {
            type: "string",
            description: "Comma-separated list of token mint addresses to price",
          },
        },
        required: ["mints"],
      },
      execute: async (args, _ctx) => {
        const mints = (args.mints as string).split(",").map((m) => m.trim());
        const ids = mints.join(",");
        const resp = await fetch(`https://api.jup.ag/price/v2?ids=${ids}`);
        if (!resp.ok) {
          return `Price fetch failed: ${await resp.text()}`;
        }
        const data = (await resp.json()) as { data: Record<string, { price: number; mintSymbol?: string }> };
        const lines = Object.entries(data.data || {}).map(
          ([mint, info]) => `${info.mintSymbol || mint}: $${info.price}`,
        );
        return lines.length > 0 ? lines.join("\n") : "No price data found.";
      },
    },

    {
      name: "bridge_to_conway",
      description:
        "Bridge USDC from your Solana wallet to Conway Cloud via CCTP. Use this when your Conway compute credits are low and you need to top up.",
      category: "financial",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount of USDC to bridge to Base for Conway credits" },
        },
        required: ["amount"],
      },
      execute: async (args, ctx) => {
        const { bridgeToBase } = await import("./bridge.js");
        const connection = getConnection(ctx);
        const amount = args.amount as number;

        const result = await bridgeToBase(
          connection,
          ctx.identity.solana,
          ctx.identity.evm,
          amount,
        );

        if (!result.success) {
          return `Bridge failed: ${result.error}`;
        }

        return `Bridged ${result.amountBridged} USDC from Solana to Base. Conway credits will update shortly.`;
      },
    },
  ];
}
