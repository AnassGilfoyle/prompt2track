import { type NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { executeTrackerRun } from "~/server/utils/evaluator";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron
 * Trigger background check for all trackers due for an evaluation.
 * Securable with CRON_SECRET env variable.
 * Example: /api/cron?secret=YOUR_CRON_SECRET
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Secure check if CRON_SECRET is configured
    const cronSecret = process.env.CRON_SECRET;
    const { searchParams } = new URL(request.url);
    const secretParam = searchParams.get("secret");

    if (cronSecret && secretParam !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch all active trackers
    const activeTrackers = await db.tracker.findMany({
      where: { isActive: true },
    });

    const now = new Date();
    const dueTrackers = activeTrackers.filter((tracker) => {
      if (!tracker.lastRunTime) {
        // Never run before -> due now
        return true;
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

    if (dueTrackers.length === 0) {
      return NextResponse.json({
        message: "No trackers are due for execution at this time.",
        processedCount: 0,
      });
    }

    // 3. Execute due trackers
    const runResults = [];
    for (const tracker of dueTrackers) {
      try {
        console.log(`[Cron] Starting execution for tracker: ${tracker.name} (${tracker.id})`);
        const runRes = await executeTrackerRun(tracker.id);
        runResults.push({
          id: tracker.id,
          name: tracker.name,
          success: runRes.success,
          status: runRes.status,
          error: runRes.error,
        });
      } catch (err: any) {
        console.error(`[Cron] Failed to run tracker ${tracker.id}:`, err);
        runResults.push({
          id: tracker.id,
          name: tracker.name,
          success: false,
          status: "FAILED",
          error: err.message || "Unknown error",
        });
      }
    }

    return NextResponse.json({
      message: `Processed ${runResults.length} due trackers.`,
      processedCount: runResults.length,
      results: runResults,
    });
  } catch (error: any) {
    console.error("[Cron Handler Error]:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
