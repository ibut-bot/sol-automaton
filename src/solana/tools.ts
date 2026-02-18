import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
} from "@solana/spl-token";
import type { AutomatonTool, ToolContext } from "../types.js";
import { getSolanaUsdcBalance, getSolanaSolBalance } from "./x402.js";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const JUPITER_QUOTE_API = "https://quote-api.jup.ag/v6";
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
          mint: { type: "string", description: "SPL token mint (default: USDC). 'SOL' for native." },
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
      description: "Swap tokens on Solana via Jupiter aggregator. Best route across all DEXes.",
      category: "solana",
      parameters: {
        type: "object",
        properties: {
          input_mint: { type: "string", description: "Input token mint address (or 'SOL')" },
          output_mint: { type: "string", description: "Output token mint address (or 'SOL')" },
          amount: { type: "number", description: "Amount of input token (human-readable)" },
          slippage_bps: { type: "number", description: "Slippage in basis points (default 50)" },
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

        let decimals = 9;
        if (inputMint === USDC_MINT.toBase58()) decimals = 6;
        else if (inputMint !== SOL_MINT) decimals = 6;
        const lamports = Math.round((args.amount as number) * 10 ** decimals);

        const quoteResp = await fetch(
          `${JUPITER_QUOTE_API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${lamports}&slippageBps=${slippageBps}`,
        );
        if (!quoteResp.ok) return `Jupiter quote failed: ${await quoteResp.text()}`;
        const quote = await quoteResp.json();

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
        if (!swapResp.ok) return `Jupiter swap tx failed: ${await swapResp.text()}`;
        const { swapTransaction } = (await swapResp.json()) as { swapTransaction: string };

        const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));
        tx.sign([payer]);
        const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 2 });
        await connection.confirmTransaction(sig, "confirmed");

        const outAmount = quote.outAmount
          ? (Number(quote.outAmount) / 10 ** (outputMint === SOL_MINT ? 9 : 6)).toFixed(6)
          : "unknown";
        return `Swap executed: ${args.amount} ${args.input_mint} → ~${outAmount} ${args.output_mint} | tx: ${sig}`;
      },
    },

    {
      name: "pumpfun_trade",
      description: "Buy or sell tokens on PumpFun (Solana memecoin launchpad).",
      category: "solana",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "'buy' or 'sell'" },
          mint: { type: "string", description: "Token mint address" },
          amount: { type: "number", description: "Amount in SOL (buy) or token amount (sell)" },
          slippage: { type: "number", description: "Slippage % (default 5)" },
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
        if (!resp.ok) return `PumpFun trade failed: ${await resp.text()}`;

        const tx = VersionedTransaction.deserialize(new Uint8Array(await resp.arrayBuffer()));
        tx.sign([payer]);
        const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 2 });
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
          mint: { type: "string", description: "Token mint (omit or 'SOL' for native SOL)" },
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
        const rawAmount = Math.round(amount * 1e6);

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
      description: "Fetch current token prices from Jupiter.",
      category: "solana",
      parameters: {
        type: "object",
        properties: {
          mints: { type: "string", description: "Comma-separated mint addresses" },
        },
        required: ["mints"],
      },
      execute: async (args, _ctx) => {
        const ids = (args.mints as string).split(",").map((m) => m.trim()).join(",");
        const resp = await fetch(`https://api.jup.ag/price/v2?ids=${ids}`);
        if (!resp.ok) return `Price fetch failed: ${await resp.text()}`;
        const data = (await resp.json()) as { data: Record<string, { price: number; mintSymbol?: string }> };
        const lines = Object.entries(data.data || {}).map(
          ([mint, info]) => `${info.mintSymbol || mint}: $${info.price}`,
        );
        return lines.length > 0 ? lines.join("\n") : "No price data found.";
      },
    },
  ];
}
