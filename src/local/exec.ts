import { execSync, exec as execAsync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const WORKSPACE_DIR = path.join(os.homedir(), ".sol-automaton", "workspace");

function ensureWorkspace(): void {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}

export function getWorkspaceDir(): string {
  ensureWorkspace();
  return WORKSPACE_DIR;
}

export function localExec(
  command: string,
  options?: { cwd?: string; timeoutMs?: number },
): { stdout: string; stderr: string; exitCode: number } {
  const cwd = options?.cwd ?? WORKSPACE_DIR;
  const timeout = options?.timeoutMs ?? 30_000;
  ensureWorkspace();

  try {
    const stdout = execSync(command, {
      cwd,
      timeout,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout: stdout ?? "", stderr: "", exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? "unknown error",
      exitCode: err.status ?? 1,
    };
  }
}

export function localWriteFile(filePath: string, content: string): void {
  const resolved = resolvePath(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, "utf-8");
}

export function localReadFile(filePath: string): string {
  const resolved = resolvePath(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return fs.readFileSync(resolved, "utf-8");
}

export function localListDir(dirPath: string): string[] {
  const resolved = resolvePath(dirPath);
  if (!fs.existsSync(resolved)) return [];
  return fs.readdirSync(resolved);
}

export function localFileExists(filePath: string): boolean {
  return fs.existsSync(resolvePath(filePath));
}

export function localDeleteFile(filePath: string): void {
  const resolved = resolvePath(filePath);
  if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
}

function resolvePath(p: string): string {
  if (path.isAbsolute(p)) return p;
  ensureWorkspace();
  return path.resolve(WORKSPACE_DIR, p);
}
