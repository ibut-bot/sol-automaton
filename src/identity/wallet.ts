import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { WalletData } from "../types.js";

const WALLET_DIR = path.join(os.homedir(), ".sol-automaton");
const WALLET_PATH = path.join(WALLET_DIR, "wallet.json");

export function getWalletPath(): string {
  return WALLET_PATH;
}

export function walletExists(): boolean {
  return fs.existsSync(WALLET_PATH);
}

export function generateKeypair(): Keypair {
  return Keypair.generate();
}

export function saveWallet(keypair: Keypair): void {
  fs.mkdirSync(WALLET_DIR, { recursive: true });
  const data: WalletData = {
    secretKey: bs58.encode(keypair.secretKey),
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(WALLET_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function loadWallet(): Keypair {
  if (!walletExists()) {
    throw new Error(`Wallet not found at ${WALLET_PATH}. Run setup first.`);
  }
  const raw = fs.readFileSync(WALLET_PATH, "utf-8");
  const data: WalletData = JSON.parse(raw);
  const secretKey = bs58.decode(data.secretKey);
  return Keypair.fromSecretKey(secretKey);
}

export function getWallet(): Keypair {
  if (walletExists()) return loadWallet();
  const kp = generateKeypair();
  saveWallet(kp);
  return kp;
}
