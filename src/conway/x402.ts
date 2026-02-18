/**
 * EVM x402 Payment Protocol (shadow wallet only)
 *
 * Used for HTTP 402 payments via USDC on Base when interacting with
 * Conway or EVM-native services. The agent never sees this directly.
 */

import {
  createPublicClient,
  http,
  parseUnits,
  type Address,
  type PrivateKeyAccount,
} from "viem";
import { base, baseSepolia } from "viem/chains";

const USDC_ADDRESSES: Record<string, Address> = {
  "eip155:8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "eip155:84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

const CHAINS: Record<string, any> = {
  "eip155:8453": base,
  "eip155:84532": baseSepolia,
};

const BALANCE_OF_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

interface PaymentRequirement {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  payToAddress: Address;
  requiredDeadlineSeconds: number;
  usdcAddress: Address;
}

export async function getEvmUsdcBalance(
  address: Address,
  network: string = "eip155:8453",
): Promise<number> {
  const chain = CHAINS[network];
  const usdcAddress = USDC_ADDRESSES[network];
  if (!chain || !usdcAddress) return 0;

  try {
    const client = createPublicClient({ chain, transport: http() });
    const balance = await client.readContract({
      address: usdcAddress,
      abi: BALANCE_OF_ABI,
      functionName: "balanceOf",
      args: [address],
    });
    return Number(balance) / 1_000_000;
  } catch {
    return 0;
  }
}

export async function evmX402Fetch(
  url: string,
  account: PrivateKeyAccount,
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

    const requirement = await parsePaymentRequired(initialResp);
    if (!requirement) {
      return { success: false, error: "Could not parse payment requirements" };
    }

    const payment = await signEvmPayment(account, requirement);
    if (!payment) {
      return { success: false, error: "Failed to sign payment" };
    }

    const paymentHeader = Buffer.from(JSON.stringify(payment)).toString("base64");
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

async function parsePaymentRequired(resp: Response): Promise<PaymentRequirement | null> {
  const header = resp.headers.get("X-Payment-Required");
  if (header) {
    try {
      const requirements = JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
      const accept = requirements.accepts?.[0];
      if (accept) return accept;
    } catch {}
  }
  try {
    const body = await resp.json();
    return body.accepts?.[0] || null;
  } catch {
    return null;
  }
}

async function signEvmPayment(account: PrivateKeyAccount, requirement: PaymentRequirement) {
  try {
    const nonce = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`;
    const now = Math.floor(Date.now() / 1000);
    const amount = parseUnits(requirement.maxAmountRequired, 6);

    const domain = {
      name: "USD Coin",
      version: "2",
      chainId: requirement.network === "eip155:84532" ? 84532 : 8453,
      verifyingContract: requirement.usdcAddress,
    } as const;

    const types = {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    } as const;

    const message = {
      from: account.address,
      to: requirement.payToAddress,
      value: amount,
      validAfter: BigInt(now - 60),
      validBefore: BigInt(now + requirement.requiredDeadlineSeconds),
      nonce: nonce as `0x${string}`,
    };

    const signature = await account.signTypedData({
      domain,
      types,
      primaryType: "TransferWithAuthorization",
      message,
    });

    return {
      x402Version: 1,
      scheme: "exact",
      network: requirement.network,
      payload: {
        signature,
        authorization: {
          from: account.address,
          to: requirement.payToAddress,
          value: amount.toString(),
          validAfter: (now - 60).toString(),
          validBefore: (now + requirement.requiredDeadlineSeconds).toString(),
          nonce,
        },
      },
    };
  } catch {
    return null;
  }
}
