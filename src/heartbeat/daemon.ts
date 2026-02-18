import cronParser from "cron-parser";
import { Connection } from "@solana/web3.js";
import type {
  AutomatonIdentity,
  AutomatonConfig,
  AutomatonDatabase,
} from "../types.js";
import { getFinancialState, TIER_THRESHOLDS } from "../survival/tiers.js";

interface HeartbeatDaemonOptions {
  identity: AutomatonIdentity;
  config: AutomatonConfig;
  db: AutomatonDatabase;
  onWakeRequest?: (reason: string) => void;
}

export function createHeartbeatDaemon(options: HeartbeatDaemonOptions) {
  const { identity, config, db, onWakeRequest } = options;
  let interval: ReturnType<typeof setInterval> | null = null;

  const tick = async () => {
    const entries = db.getHeartbeatEntries();
    const now = new Date();

    for (const entry of entries) {
      if (!entry.enabled) continue;

      try {
        const cron = cronParser.parseExpression(entry.schedule);
        const prev = cron.prev().toDate();
        const lastRun = db.getKV(`heartbeat_last_${entry.name}`);
        const lastRunDate = lastRun ? new Date(lastRun) : new Date(0);

        if (prev > lastRunDate) {
          await runTask(entry.task);
          db.setKV(`heartbeat_last_${entry.name}`, now.toISOString());
        }
      } catch {}
    }
  };

  const runTask = async (task: string) => {
    switch (task) {
      case "health_check":
        db.setKV("last_health_check", new Date().toISOString());
        break;

      case "balance_monitor": {
        try {
          const connection = new Connection(config.solanaRpcUrl, "confirmed");
          const fin = await getFinancialState(connection, identity.solana.publicKey);
          db.setKV("last_usdc_balance", String(fin.solanaUsdcBalance));
          db.setKV("last_sol_balance", String(fin.solanaSolBalance));
          if (fin.solanaUsdcBalance < TIER_THRESHOLDS.low_compute) {
            onWakeRequest?.(`USDC balance low: $${fin.solanaUsdcBalance.toFixed(2)}`);
          }
        } catch {}
        break;
      }

      case "status_ping":
        db.setKV("last_heartbeat_ping", new Date().toISOString());
        break;
    }
  };

  return {
    start: () => {
      if (interval) return;
      interval = setInterval(tick, 30_000);
      tick();
    },
    stop: () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    },
  };
}
