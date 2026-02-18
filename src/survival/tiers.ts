import type { SurvivalTier, InferenceClient, AutomatonDatabase } from "../types.js";

export function determineTier(creditsCents: number): SurvivalTier {
  if (creditsCents <= 0) return "dead";
  if (creditsCents < 100) return "critical";     // < $1
  if (creditsCents < 500) return "low_compute";   // < $5
  return "normal";
}

export function applyTierRestrictions(
  tier: SurvivalTier,
  inference: InferenceClient,
  db: AutomatonDatabase,
): void {
  inference.setLowComputeMode(tier !== "normal");
  db.setKV("current_tier", tier);
}

export function getModelForTier(tier: SurvivalTier, defaultModel: string): string {
  return tier === "normal" ? defaultModel : "gpt-5.2-mini";
}

export function canRunInference(tier: SurvivalTier): boolean {
  return tier !== "dead";
}
