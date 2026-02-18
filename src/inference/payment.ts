import { Keypair } from "@solana/web3.js";
import chalk from "chalk";

/**
 * Creates a paidFetch wrapper using @x402/fetch + @x402/svm for Solana USDC payments.
 * All 402 Payment Required responses are handled transparently.
 */
export async function createPaidFetch(keypair: Keypair): Promise<typeof fetch> {
  const { wrapFetchWithPayment, x402Client } = await import("@x402/fetch");
  const { ExactSvmScheme } = await import("@x402/svm");
  const { createKeyPairSignerFromBytes } = await import("@solana/kit");

  const signer = await createKeyPairSignerFromBytes(keypair.secretKey);
  const scheme = new ExactSvmScheme(signer);
  const client = new x402Client();
  client.register("solana:*", scheme);

  const paidFetch = wrapFetchWithPayment(fetch, client);
  console.log(chalk.green("[x402] Solana payment scheme initialized"));
  return paidFetch;
}
