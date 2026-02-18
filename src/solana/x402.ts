/**
 * Solana x402 Payment Protocol
 *
 * Handles HTTP 402 payments using SPL USDC on Solana.
 * This is the agent-facing payment layer for Solana ecosystem services.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
} from "@solana/spl-token";

const USDC_MINT_MAINNET = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const USDC_DECIMALS = 6;

interface SolanaPaymentRequirement {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  payToAddress: string;
  requiredDeadlineSeconds: number;
}

export async function getSolanaUsdcBalance(
  connection: Connection,
  owner: PublicKey,
): Promise<number> {
  try {
    const ata = await getAssociatedTokenAddress(USDC_MINT_MAINNET, owner);
    const account = await getAccount(connection, ata);
    return Number(account.amount) / 10 ** USDC_DECIMALS;
  } catch {
    return 0;
  }
}

export async function getSolanaSolBalance(
  connection: Connection,
  owner: PublicKey,
): Promise<number> {
  try {
    const balance = await connection.getBalance(owner);
    return balance / 1e9;
  } catch {
    return 0;
  }
}

export async function solanaX402Fetch(
  url: string,
  connection: Connection,
  payer: Keypair,
  method: string = "GET",
  body?: string,
  headers?: Record<string, string>,
): Promise<{ success: boolean; response?: any; error?: string }> {
  try {
    const initialResp = await fetch(url, {
      method,
      headers: { ...headers, "Content-Type": "application/json" },
      body,
    });

    if (initialResp.status !== 402) {
      const data = await initialResp.json().catch(() => initialResp.text());
      return { success: initialResp.ok, response: data };
    }

    const requirement = await parseSolanaPaymentRequired(initialResp);
    if (!requirement) {
      return { success: false, error: "Could not parse Solana payment requirements" };
    }

    const paymentProof = await executeSolanaPayment(connection, payer, requirement);
    if (!paymentProof) {
      return { success: false, error: "Failed to execute Solana payment" };
    }

    const paymentHeader = Buffer.from(JSON.stringify(paymentProof)).toString("base64");
    const paidResp = await fetch(url, {
      method,
      headers: { ...headers, "Content-Type": "application/json", "X-Payment": paymentHeader },
      body,
    });
    const data = await paidResp.json().catch(() => paidResp.text());
    return { success: paidResp.ok, response: data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function parseSolanaPaymentRequired(resp: Response): Promise<SolanaPaymentRequirement | null> {
  const header = resp.headers.get("X-Payment-Required");
  if (header) {
    try {
      const requirements = JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
      const accept = requirements.accepts?.find(
        (a: any) => a.network?.startsWith("solana:"),
      );
      if (accept) return accept;
    } catch {}
  }
  try {
    const body = await resp.json();
    const accept = body.accepts?.find((a: any) => a.network?.startsWith("solana:"));
    return accept || null;
  } catch {
    return null;
  }
}

async function executeSolanaPayment(
  connection: Connection,
  payer: Keypair,
  requirement: SolanaPaymentRequirement,
): Promise<any | null> {
  try {
    const recipient = new PublicKey(requirement.payToAddress);
    const amount = Math.round(parseFloat(requirement.maxAmountRequired) * 10 ** USDC_DECIMALS);

    const senderAta = await getAssociatedTokenAddress(USDC_MINT_MAINNET, payer.publicKey);
    const recipientAta = await getAssociatedTokenAddress(USDC_MINT_MAINNET, recipient);

    const tx = new Transaction().add(
      createTransferInstruction(senderAta, recipientAta, payer.publicKey, amount),
    );

    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = payer.publicKey;
    tx.sign(payer);

    const signature = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(signature, "confirmed");

    return {
      x402Version: 1,
      scheme: "exact",
      network: requirement.network,
      payload: { signature, from: payer.publicKey.toBase58() },
    };
  } catch {
    return null;
  }
}
