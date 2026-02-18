import cronParser from "cron-parser";
import type {
  AutomatonIdentity,
  AutomatonConfig,
  AutomatonDatabase,
  ConwayClient,
  SocialClientInterface,
} from "../types.js";

interface HeartbeatDaemonOptions {
  identity: AutomatonIdentity;
  config: AutomatonConfig;
  db: AutomatonDatabase;
  conway: ConwayClient;
  social?: SocialClientInterface;
  onWakeRequest?: (reason: string) => void;
}

export function createHeartbeatDaemon(options: HeartbeatDaemonOptions) {
  const { db, conway, onWakeRequest } = options;
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
        try {
          await conway.exec("echo ok", 5000);
        } catch {
          onWakeRequest?.("Sandbox health check failed");
        }
        break;

      case "credit_monitor": {
        try {
          const balance = await conway.getCreditsBalance();
          db.setKV("last_credit_balance", String(balance));
          if (balance < 100) {
            onWakeRequest?.(`Credits critically low: ${balance} cents`);
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
