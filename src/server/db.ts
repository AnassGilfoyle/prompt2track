import { env } from "~/env";
import { PrismaClient } from "../../generated/prisma";

const createPrismaClient = () =>
  new PrismaClient({
    log:
      env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
  schedulerStarted: boolean | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// Built-in Background Scheduler for Self-Hosting (Zero-config cURL/Cron)
if (typeof window === "undefined" && !globalForPrisma.schedulerStarted) {
  globalForPrisma.schedulerStarted = true;
  const CHECK_INTERVAL_MS = 15000; // Check every 15 seconds

  console.log("[Scheduler] Starting automatic background worker loop...");

  setInterval(async () => {
    try {
      // 1. Fetch active trackers
      const activeTrackers = await db.tracker.findMany({
        where: { isActive: true },
      });

      if (activeTrackers.length === 0) return;

      const now = new Date();
      const dueTrackers = activeTrackers.filter((tracker) => {
        if (!tracker.lastRunTime) {
          return true; // Never run -> due
        }

        const lastRun = new Date(tracker.lastRunTime);
        const diffMs = now.getTime() - lastRun.getTime();
        const diffMins = diffMs / (1000 * 60);

        switch (tracker.cronInterval) {
          case "EVERY_MINUTE":
            return diffMins >= 1;
          case "EVERY_5_MINUTES":
            return diffMins >= 5;
          case "EVERY_10_MINUTES":
            return diffMins >= 10;
          case "EVERY_30_MINUTES":
            return diffMins >= 30;
          case "EVERY_HOUR":
            return diffMins >= 60;
          case "EVERY_6_HOURS":
            return diffMins >= 360;
          case "DAILY":
            return diffMins >= 1440;
          default:
            return false;
        }
      });

      if (dueTrackers.length > 0) {
        console.log(`[Scheduler] Found ${dueTrackers.length} due trackers. Running evaluations...`);
        // Dynamically import evaluator to avoid circular import issues in db.ts
        const { executeTrackerRun } = await import("./utils/evaluator");

        for (const tracker of dueTrackers) {
          try {
            console.log(`[Scheduler] Auto-executing: ${tracker.name}`);
            const result = await executeTrackerRun(tracker.id);
            console.log(`[Scheduler] Finished auto-execution for: ${tracker.name}. Status: ${result.status}`);
          } catch (err) {
            console.error(`[Scheduler] Error running tracker ${tracker.id}:`, err);
          }
        }
      }
    } catch (err) {
      console.error("[Scheduler] Background loop error:", err);
    }
  }, CHECK_INTERVAL_MS);
}
