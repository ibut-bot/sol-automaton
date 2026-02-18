import { Connection, PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import type { SurvivalTier, FinancialState } from "../types.js";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

export const TIER_THRESHOLDS = {
  normal: 5.0,
  low_compute: 1.0,
  critical: 0.01,
};

export function getTier(usdcBalance: number): SurvivalTier {
  if (usdcBalance >= TIER_THRESHOLDS.normal) return "normal";
  if (usdcBalance >= TIER_THRESHOLDS.low_compute) return "low_compute";
  if (usdcBalance >= TIER_THRESHOLDS.critical) return "critical";
  return "dead";
}

export function getModelForTier(
  tier: SurvivalTier,
  defaultModel: string,
  lowComputeModel: string,
): string {
  switch (tier) {
    case "normal":
      return defaultModel;
    case "low_compute":
    case "critical":
      return lowComputeModel;
    case "dead":
      return lowComputeModel;
  }
}

export async function getFinancialState(
  connection: Connection,
  walletPubkey: PublicKey,
): Promise<FinancialState> {
  let solBalance = 0;
  let usdcBalance = 0;

  try {
    const lamports = await connection.getBalance(walletPubkey);
    solBalance = lamports / 1e9;
  } catch {
    solBalance = 0;
  }

  try {
    const ata = await getAssociatedTokenAddress(USDC_MINT, walletPubkey);
    const tokenAccount = await getAccount(connection, ata);
    usdcBalance = Number(tokenAccount.amount) / 1e6;
  } catch {
    usdcBalance = 0;
  }

  return {
    solanaUsdcBalance: usdcBalance,
    solanaSolBalance: solBalance,
  };
}
