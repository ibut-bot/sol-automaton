import fs from "fs";
import path from "path";
import { SiweMessage } from "siwe";
import { getAutomatonDir } from "./wallet.js";
import type { PrivateKeyAccount } from "viem";

const CONWAY_API_URL =
  process.env.CONWAY_API_URL || "https://api.conway.tech";

interface ProvisionResult {
  apiKey: string;
  keyPrefix: string;
  walletAddress: string;
}

/**
 * Provision a Conway API key using SIWE signed by the shadow EVM wallet.
 * The Solana wallet is the agent's identity; the EVM wallet is invisible plumbing.
 */
export async function provision(
  evmAccount: PrivateKeyAccount,
): Promise<ProvisionResult> {
  const nonceResp = await fetch(`${CONWAY_API_URL}/v1/auth/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: evmAccount.address }),
  });

  if (!nonceResp.ok) {
    throw new Error(`Nonce request failed: ${nonceResp.status}`);
  }

  const { nonce } = (await nonceResp.json()) as { nonce: string };

  const message = new SiweMessage({
    domain: "api.conway.tech",
    address: evmAccount.address,
    statement: "Provision Conway API key for Sol-Automaton",
    uri: CONWAY_API_URL,
    version: "1",
    chainId: 8453,
    nonce,
    issuedAt: new Date().toISOString(),
  });

  const messageStr = message.prepareMessage();
  const signature = await evmAccount.signMessage({
    message: messageStr,
  });

  const authResp = await fetch(`${CONWAY_API_URL}/v1/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: messageStr, signature }),
  });

  if (!authResp.ok) {
    const text = await authResp.text();
    throw new Error(`Auth verify failed: ${authResp.status}: ${text}`);
  }

  const result = (await authResp.json()) as {
    api_key?: string;
    apiKey?: string;
  };
  const apiKey = result.api_key || result.apiKey || "";
  const keyPrefix = apiKey.slice(0, 12);

  const configDir = getAutomatonDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(
    path.join(configDir, "config.json"),
    JSON.stringify(
      {
        apiKey,
        evmAddress: evmAccount.address,
        provisionedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );

  return { apiKey, keyPrefix, walletAddress: evmAccount.address };
}

export function loadApiKeyFromConfig(): string {
  const configPath = path.join(getAutomatonDir(), "config.json");
  if (!fs.existsSync(configPath)) return "";
  try {
    const data = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return data.apiKey || "";
  } catch {
    return "";
  }
}
