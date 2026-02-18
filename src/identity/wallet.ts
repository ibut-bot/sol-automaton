import { Keypair } from "@solana/web3.js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";
import fs from "fs";
import path from "path";
import type { WalletData, DualWallet } from "../types.js";
import { HDKey } from "viem/accounts";

const AUTOMATON_DIR = path.join(
  process.env.HOME || "/root",
  ".sol-automaton",
);
const WALLET_FILE = path.join(AUTOMATON_DIR, "wallet.json");

const SOLANA_DERIVATION_PATH = "m/44'/501'/0'/0'";
const EVM_DERIVATION_PATH = "m/44'/60'/0'/0/0";

export function getAutomatonDir(): string {
  return AUTOMATON_DIR;
}

export function getWalletPath(): string {
  return WALLET_FILE;
}

function deriveSolanaKeypair(mnemonic: string): Keypair {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const derived = derivePath(SOLANA_DERIVATION_PATH, seed.toString("hex"));
  return Keypair.fromSeed(Uint8Array.from(derived.key));
}

function deriveEvmAccount(mnemonic: string) {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const hdKey = HDKey.fromMasterSeed(seed);
  const child = hdKey.derive(EVM_DERIVATION_PATH);
  const privateKey = `0x${Buffer.from(child.privateKey!).toString("hex")}` as `0x${string}`;
  return privateKeyToAccount(privateKey);
}

export async function getWallet(): Promise<{
  wallet: DualWallet;
  isNew: boolean;
}> {
  if (!fs.existsSync(AUTOMATON_DIR)) {
    fs.mkdirSync(AUTOMATON_DIR, { recursive: true, mode: 0o700 });
  }

  if (fs.existsSync(WALLET_FILE)) {
    const walletData: WalletData = JSON.parse(
      fs.readFileSync(WALLET_FILE, "utf-8"),
    );
    const solana = deriveSolanaKeypair(walletData.mnemonic);
    const evm = deriveEvmAccount(walletData.mnemonic);
    return {
      wallet: { solana, evm, mnemonic: walletData.mnemonic },
      isNew: false,
    };
  }

  const mnemonic = bip39.generateMnemonic(256);
  const solana = deriveSolanaKeypair(mnemonic);
  const evm = deriveEvmAccount(mnemonic);

  const walletData: WalletData = {
    mnemonic,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(WALLET_FILE, JSON.stringify(walletData, null, 2), {
    mode: 0o600,
  });

  return {
    wallet: { solana, evm, mnemonic },
    isNew: true,
  };
}

export function getSolanaAddress(): string | null {
  if (!fs.existsSync(WALLET_FILE)) return null;
  const data: WalletData = JSON.parse(fs.readFileSync(WALLET_FILE, "utf-8"));
  return deriveSolanaKeypair(data.mnemonic).publicKey.toBase58();
}

export function walletExists(): boolean {
  return fs.existsSync(WALLET_FILE);
}
