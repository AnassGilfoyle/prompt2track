import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { executeTrackerRun } from "~/server/utils/evaluator";
import { decrypt } from "~/server/utils/crypto";
import { detectLoginSelectors } from "~/server/utils/selector-detector";

export const trackerRouter = createTRPCRouter({
  getTrackers: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.tracker.findMany({
      orderBy: { createdAt: "desc" },
    });
  }),

  createTracker: publicProcedure
    .input(
      z.object({
        name: z.string().trim().min(1, "Name is required"),
        url: z.string().trim().min(1, "URL is required"),
        prompt: z.string().trim().min(1, "Prompt is required"),
        cronInterval: z.enum([
          "EVERY_MINUTE",
          "EVERY_5_MINUTES",
          "EVERY_10_MINUTES",
          "EVERY_30_MINUTES",
          "EVERY_HOUR",
          "EVERY_6_HOURS",
          "DAILY"
        ]),
        aiProvider: z.enum(["GEMINI", "CLAUDE"]),
        aiModel: z.string().trim().nullish(),
        keepActiveAfterMatch: z.boolean().optional(),
        loginUrl: z.string().trim().nullish(),
        loginUsername: z.string().trim().nullish(),
        loginPassword: z.string().trim().nullish(),
        usernameSelector: z.string().trim().nullish(),
        passwordSelector: z.string().trim().nullish(),
        submitSelector: z.string().trim().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let usernameSelector = input.usernameSelector ?? null;
      let passwordSelector = input.passwordSelector ?? null;
      let submitSelector = input.submitSelector ?? null;

      if (input.loginUrl) {
        const config = await ctx.db.config.findUnique({
          where: { id: "default" },
        });
        if (!config || !config.geminiApiKey) {
          throw new Error("Gemini API key is required to detect login form selectors. Please set it in Settings.");
        }
        const apiKey = decrypt(config.geminiApiKey);
        try {
          const detected = await detectLoginSelectors(input.loginUrl, apiKey);
          usernameSelector = detected.usernameSelector;
          passwordSelector = detected.passwordSelector;
          submitSelector = detected.submitSelector;
        } catch (err: any) {
          console.error("Auto-detect selectors failed during creation:", err);
          throw new Error(`Failed to auto-detect login form elements: ${err.message || err}`);
        }
      }

      return ctx.db.tracker.create({
        data: {
          name: input.name,
          url: input.url,
          prompt: input.prompt,
          cronInterval: input.cronInterval,
          aiProvider: input.aiProvider,
          aiModel: input.aiModel,
          keepActiveAfterMatch: input.keepActiveAfterMatch ?? true,
          isActive: true,
          loginUrl: input.loginUrl,
          loginUsername: input.loginUsername,
          loginPassword: input.loginPassword,
          usernameSelector,
          passwordSelector,
          submitSelector,
        },
      });
    }),

  updateTracker: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().trim().min(1, "Name is required"),
        url: z.string().trim().min(1, "URL is required"),
        prompt: z.string().trim().min(1, "Prompt is required"),
        cronInterval: z.enum([
          "EVERY_MINUTE",
          "EVERY_5_MINUTES",
          "EVERY_10_MINUTES",
          "EVERY_30_MINUTES",
          "EVERY_HOUR",
          "EVERY_6_HOURS",
          "DAILY"
        ]),
        aiProvider: z.enum(["GEMINI", "CLAUDE"]),
        aiModel: z.string().trim().nullish(),
        isActive: z.boolean().nullish().transform(val => val ?? true),
        keepActiveAfterMatch: z.boolean().nullish().transform(val => val ?? true),
        loginUrl: z.string().trim().nullish(),
        loginUsername: z.string().trim().nullish(),
        loginPassword: z.string().trim().nullish(),
        usernameSelector: z.string().trim().nullish(),
        passwordSelector: z.string().trim().nullish(),
        submitSelector: z.string().trim().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let usernameSelector = input.usernameSelector;
      let passwordSelector = input.passwordSelector;
      let submitSelector = input.submitSelector;

      if (input.loginUrl) {
        const existing = await ctx.db.tracker.findUnique({
          where: { id: input.id },
        });
        const urlChanged = existing?.loginUrl !== input.loginUrl;
        const selectorsMissing = !existing?.usernameSelector || !existing?.passwordSelector || !existing?.submitSelector;

        if (urlChanged || selectorsMissing) {
          const config = await ctx.db.config.findUnique({
            where: { id: "default" },
          });
          if (!config || !config.geminiApiKey) {
            throw new Error("Gemini API key is required to detect login form selectors. Please set it in Settings.");
          }
          const apiKey = decrypt(config.geminiApiKey);
          try {
            const detected = await detectLoginSelectors(input.loginUrl, apiKey);
            usernameSelector = detected.usernameSelector;
            passwordSelector = detected.passwordSelector;
            submitSelector = detected.submitSelector;
          } catch (err: any) {
            console.error("Auto-detect selectors failed during update:", err);
            throw new Error(`Failed to auto-detect login form elements: ${err.message || err}`);
          }
        } else {
          usernameSelector = existing.usernameSelector;
          passwordSelector = existing.passwordSelector;
          submitSelector = existing.submitSelector;
        }
      } else {
        usernameSelector = null;
        passwordSelector = null;
        submitSelector = null;
      }

      return ctx.db.tracker.update({
        where: { id: input.id },
        data: {
          name: input.name,
          url: input.url,
          prompt: input.prompt,
          cronInterval: input.cronInterval,
          aiProvider: input.aiProvider,
          aiModel: input.aiModel,
          isActive: input.isActive,
          keepActiveAfterMatch: input.keepActiveAfterMatch,
          loginUrl: input.loginUrl,
          loginUsername: input.loginUsername,
          loginPassword: input.loginPassword,
          usernameSelector,
          passwordSelector,
          submitSelector,
        },
      });
    }),

  deleteTracker: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.tracker.delete({
        where: { id: input.id },
      });
    }),

  triggerRun: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      // Manually trigger the tracker execution run
      const result = await executeTrackerRun(input.id);
      return result;
    }),

  getRuns: publicProcedure
    .input(z.object({ trackerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.trackerRun.findMany({
        where: { trackerId: input.trackerId },
        orderBy: { runTime: "desc" },
      });
    }),
});
