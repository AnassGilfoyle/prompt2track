import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { encrypt, decrypt } from "~/server/utils/crypto";
import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export const configRouter = createTRPCRouter({
  getConfig: publicProcedure.query(async ({ ctx }) => {
    const config = await ctx.db.config.findUnique({
      where: { id: "default" },
    });

    if (!config) {
      return null;
    }

    // Return the config with masked keys for security on the UI
    const decResend = decrypt(config.resendApiKey);
    const decGemini = decrypt(config.geminiApiKey);
    const decAnthropic = decrypt(config.anthropicApiKey);

    return {
      resendApiKey: maskKey(decResend),
      geminiApiKey: maskKey(decGemini),
      anthropicApiKey: maskKey(decAnthropic),
      defaultSenderEmail: config.defaultSenderEmail,
      hasResendKey: !!decResend,
      hasGeminiKey: !!decGemini,
      hasAnthropicKey: !!decAnthropic,
    };
  }),

  saveConfig: publicProcedure
    .input(
      z.object({
        resendApiKey: z.string().trim().min(1, "Resend API key is required"),
        geminiApiKey: z.string().trim().optional().or(z.literal("")),
        anthropicApiKey: z.string().trim().optional().or(z.literal("")),
        defaultSenderEmail: z.string().trim().email("Invalid sender email format"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // If the incoming key is masked, retrieve the decrypted value from the DB
      let encResend = "";
      let encGemini = "";
      let encAnthropic = "";

      const currentConfig = await ctx.db.config.findUnique({
        where: { id: "default" },
      });

      if (input.resendApiKey.includes("...")) {
        if (!currentConfig) throw new Error("No existing config to pull Resend key from");
        encResend = currentConfig.resendApiKey;
      } else {
        encResend = encrypt(input.resendApiKey);
      }

      if (input.geminiApiKey && input.geminiApiKey.includes("...")) {
        if (!currentConfig) throw new Error("No existing config to pull Gemini key from");
        encGemini = currentConfig.geminiApiKey;
      } else if (input.geminiApiKey) {
        encGemini = encrypt(input.geminiApiKey);
      }

      if (input.anthropicApiKey && input.anthropicApiKey.includes("...")) {
        if (!currentConfig) throw new Error("No existing config to pull Anthropic key from");
        encAnthropic = currentConfig.anthropicApiKey;
      } else if (input.anthropicApiKey) {
        encAnthropic = encrypt(input.anthropicApiKey);
      }

      const saved = await ctx.db.config.upsert({
        where: { id: "default" },
        update: {
          resendApiKey: encResend,
          geminiApiKey: encGemini,
          anthropicApiKey: encAnthropic,
          defaultSenderEmail: input.defaultSenderEmail,
        },
        create: {
          id: "default",
          resendApiKey: encResend,
          geminiApiKey: encGemini,
          anthropicApiKey: encAnthropic,
          defaultSenderEmail: input.defaultSenderEmail,
        },
      });

      return { success: true };
    }),

  testCredentials: publicProcedure
    .input(
      z.object({
        resendApiKey: z.string().trim(),
        geminiApiKey: z.string().trim().optional().or(z.literal("")),
        anthropicApiKey: z.string().trim().optional().or(z.literal("")),
        defaultSenderEmail: z.string().trim().email("Invalid default sender email"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const results = {
        resend: { success: false, message: "" },
        gemini: { success: false, message: "" },
        anthropic: { success: false, message: "" },
      };

      const currentConfig = await ctx.db.config.findUnique({
        where: { id: "default" },
      });

      // 1. Resolve keys (decrypt if masked)
      let actualResendKey = input.resendApiKey;
      if (actualResendKey.includes("...") && currentConfig) {
        actualResendKey = decrypt(currentConfig.resendApiKey);
      }

      let actualGeminiKey = input.geminiApiKey ?? "";
      if (actualGeminiKey.includes("...") && currentConfig) {
        actualGeminiKey = decrypt(currentConfig.geminiApiKey);
      }

      let actualAnthropicKey = input.anthropicApiKey ?? "";
      if (actualAnthropicKey.includes("...") && currentConfig) {
        actualAnthropicKey = decrypt(currentConfig.anthropicApiKey);
      }

      // 2. Test Resend API key
      if (actualResendKey) {
        try {
          const resend = new Resend(actualResendKey);
          // Standard check: listing domains is a read-only request that validates the token
          const domains = await resend.domains.list();
          if (domains.error) {
            results.resend.message = domains.error.message;
          } else {
            results.resend.success = true;
            results.resend.message = "API key is valid (successfully listed domains).";
          }
        } catch (err: any) {
          results.resend.message = err.message || "Failed to connect to Resend API.";
        }
      } else {
        results.resend.message = "No Resend API Key provided.";
      }

      // 3. Test Gemini API key
      if (actualGeminiKey) {
        try {
          const ai = new GoogleGenAI({ apiKey: actualGeminiKey });
          // Make a small evaluation check
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: "respond with 'OK'",
          });
          if (response.text) {
            results.gemini.success = true;
            results.gemini.message = "Successfully authenticated and generated content.";
          } else {
            results.gemini.message = "Failed to receive response text from Gemini.";
          }
        } catch (err: any) {
          results.gemini.message = err.message || "Failed to authenticate with Gemini.";
        }
      } else {
        results.gemini.message = "No Gemini API Key provided.";
      }

      // 4. Test Anthropic API key
      if (actualAnthropicKey) {
        try {
          const anthropic = new Anthropic({ apiKey: actualAnthropicKey });
          const response = await anthropic.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 5,
            messages: [{ role: "user", content: "respond with OK" }],
          });
          if (response.content?.[0] && response.content[0].type === "text") {
            results.anthropic.success = true;
            results.anthropic.message = "Successfully authenticated and generated content.";
          } else {
            results.anthropic.message = "Failed to receive response from Claude.";
          }
        } catch (err: any) {
          results.anthropic.message = err.message || "Failed to authenticate with Claude.";
        }
      } else {
        results.anthropic.message = "No Anthropic API Key provided.";
      }

      return results;
    }),

  sendTestEmail: publicProcedure
    .input(
      z.object({
        resendApiKey: z.string().trim(),
        defaultSenderEmail: z.string().trim().email("Invalid default sender email"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const currentConfig = await ctx.db.config.findUnique({
        where: { id: "default" },
      });

      let actualResendKey = input.resendApiKey;
      if (actualResendKey.includes("...") && currentConfig) {
        actualResendKey = decrypt(currentConfig.resendApiKey);
      }

      if (!actualResendKey) {
        throw new Error("No Resend API Key provided.");
      }

      try {
        const resend = new Resend(actualResendKey);
        
        // Dynamically determine the "from" address:
        const publicDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "mail.com", "protonmail.com", "proton.me"];
        const emailDomain = input.defaultSenderEmail.split("@")[1]?.toLowerCase() || "";
        const fromEmail = publicDomains.includes(emailDomain)
          ? "onboarding@resend.dev"
          : input.defaultSenderEmail;

        const result = await resend.emails.send({
          from: `prompt2track <${fromEmail}>`,
          to: input.defaultSenderEmail,
          subject: "Test Email from prompt2track",
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
              <h2 style="color: #4f46e5; margin-top: 0; font-size: 22px; font-weight: 700;">prompt2track Test Connection</h2>
              <p style="font-size: 16px; color: #1e293b; margin-bottom: 20px;">
                This is a test email to confirm that your Resend API configuration is working successfully.
              </p>
              <div style="background-color: #f8fafc; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 6px;">
                <h4 style="margin: 0 0 8px 0; color: #1e293b; font-size: 16px; font-weight: 600;">Status: Success!</h4>
                <p style="font-size: 14px; color: #475569; margin: 0;">
                  If you received this email, it means your Resend API integration is functioning correctly and is ready to deliver tracking alerts.
                </p>
              </div>
              <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 25px; margin-bottom: 0;">
                Sent automatically by prompt2track.
              </p>
            </div>
          `,
        });

        if (result.error) {
          throw new Error(result.error.message);
        }

        return { success: true, message: "Test email sent successfully!" };
      } catch (err: any) {
        throw new Error(err.message || "Failed to send test email.");
      }
    }),
});
