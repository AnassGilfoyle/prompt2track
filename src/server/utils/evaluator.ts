import { db } from "~/server/db";
import { decrypt } from "./crypto";
import { scrapeUrl } from "./scraper";
import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";

interface EvalResult {
  conditionMet: boolean;
  confidenceScore: number;
  summaryOfChanges: string;
  emailSubjectLine: string;
}

/**
 * Runs a single tracker through the entire pipeline:
 * 1. Scrape URL -> Clean Markdown
 * 2. Feed Markdown + Prompt to selected LLM (Gemini or Claude)
 * 3. Evaluate matching criteria via structured JSON output
 * 4. Send email alert via Resend if criteria are met
 * 5. Log the run in the database and update Tracker status
 */
export async function executeTrackerRun(trackerId: string): Promise<{
  success: boolean;
  status: "SUCCESS" | "FAILED" | "NO_MATCH";
  result?: EvalResult;
  error?: string;
}> {
  const tracker = await db.tracker.findUnique({
    where: { id: trackerId },
  });

  if (!tracker) {
    return { success: false, status: "FAILED", error: "Tracker not found" };
  }

  const config = await db.config.findUnique({
    where: { id: "default" },
  });

  if (!config) {
    const errorMsg = "API keys are not configured. Please save credentials in settings first.";
    await logTrackerFailure(trackerId, errorMsg);
    return { success: false, status: "FAILED", error: errorMsg };
  }

  // Decrypt API keys
  const geminiKey = decrypt(config.geminiApiKey);
  const anthropicKey = decrypt(config.anthropicApiKey);
  const resendKey = decrypt(config.resendApiKey);

  // 1. Scrape the webpage
  let markdown = "";
  try {
    markdown = await scrapeUrl(tracker.url, {
      loginUrl: tracker.loginUrl,
      loginUsername: tracker.loginUsername,
      loginPassword: tracker.loginPassword,
      usernameSelector: tracker.usernameSelector,
      passwordSelector: tracker.passwordSelector,
      submitSelector: tracker.submitSelector,
    });
  } catch (err: any) {
    const errorMsg = `Scraping failed: ${err.message || err}`;
    await logTrackerFailure(trackerId, errorMsg, err.screenshotUrl);
    return { success: false, status: "FAILED", error: errorMsg };
  }

  // 2. Run LLM Evaluation
  let evalResult: EvalResult;
  try {
    if (tracker.aiProvider === "CLAUDE") {
      if (!anthropicKey) {
        throw new Error("Anthropic API key is missing. Please set it in Settings.");
      }
      evalResult = await evaluateWithClaude(anthropicKey, tracker.prompt, markdown, tracker.aiModel);
    } else {
      if (!geminiKey) {
        throw new Error("Gemini API key is missing. Please set it in Settings.");
      }
      evalResult = await evaluateWithGemini(geminiKey, tracker.prompt, markdown, tracker.aiModel);
    }
  } catch (err: any) {
    const errorMsg = `AI Evaluation failed: ${err.message || err}`;
    await logTrackerFailure(trackerId, errorMsg);
    return { success: false, status: "FAILED", error: errorMsg };
  }

  // 3. Email Alerting if condition is met
  let emailSent = false;
  let emailError: string | null = null;
  if (evalResult.conditionMet) {
    if (!resendKey) {
      console.warn("Condition met but Resend API Key is missing. Skipping email notification.");
      emailError = "Resend API Key is missing.";
    } else {
      try {
        await sendNotificationEmail(
          resendKey,
          config.defaultSenderEmail,
          evalResult.emailSubjectLine,
          evalResult.summaryOfChanges,
          tracker.name,
          tracker.url
        );
        emailSent = true;
      } catch (err: any) {
        console.error("Email notification failed to send:", err);
        emailError = `Email alert failed: ${err.message || err}`;
      }
    }
  }

  const runStatus = evalResult.conditionMet ? "SUCCESS" : "NO_MATCH";

  // 4. Update Tracker Run History
  await db.$transaction([
    db.trackerRun.create({
      data: {
        trackerId: tracker.id,
        status: runStatus,
        summaryOfChanges: evalResult.summaryOfChanges,
        confidenceScore: evalResult.confidenceScore,
        errorMessage: emailError,
      },
    }),
    db.tracker.update({
      where: { id: tracker.id },
      data: {
        lastRunStatus: runStatus,
        lastRunTime: new Date(),
        isActive: evalResult.conditionMet && !(tracker.keepActiveAfterMatch ?? true) ? false : tracker.isActive,
      },
    }),
  ]);

  return {
    success: true,
    status: runStatus,
    result: evalResult,
  };
}

async function logTrackerFailure(trackerId: string, errorMessage: string, screenshotUrl?: string) {
  try {
    await db.$transaction([
      db.trackerRun.create({
        data: {
          trackerId,
          status: "FAILED",
          errorMessage,
          screenshotUrl,
        },
      }),
      db.tracker.update({
        where: { id: trackerId },
        data: {
          lastRunStatus: "FAILED",
          lastRunTime: new Date(),
        },
      }),
    ]);
  } catch (dbErr) {
    console.error("Failed to log tracker failure to database:", dbErr);
  }
}

async function evaluateWithGemini(apiKey: string, prompt: string, markdown: string, customModel?: string | null): Promise<EvalResult> {
  const ai = new GoogleGenAI({ apiKey });
  
  const systemInstruction = `
You are an expert data monitoring assistant. 
Your task is to analyze the provided markdown content of a webpage and check if it meets the user's custom tracking criteria.
You must return a structured JSON response matching the schema.
`;

  const userPrompt = `
User Prompt/Criteria: "${prompt}"

Webpage Content (Markdown):
---
${markdown}
---
`;

  let modelName = customModel ? customModel.trim() : "gemini-2.5-flash";
  if (!modelName.includes("/")) {
    modelName = `models/${modelName.toLowerCase().replace(/\s+/g, "-")}`;
  }

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [
      { role: "user", parts: [{ text: userPrompt }] }
    ],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          conditionMet: { 
            type: "BOOLEAN", 
            description: "true if the webpage content matches the user prompt/criteria, false otherwise." 
          },
          confidenceScore: { 
            type: "NUMBER", 
            description: "Confidence score between 0.0 (no confidence) and 1.0 (absolute certainty)." 
          },
          summaryOfChanges: { 
            type: "STRING", 
            description: "A detailed description in markdown format of what matches the prompt, including pricing, specific items, or listings found." 
          },
          emailSubjectLine: { 
            type: "STRING", 
            description: "A professional and informative email subject line starting with 'Alert: ' summarizing the match." 
          }
        },
        required: ["conditionMet", "confidenceScore", "summaryOfChanges", "emailSubjectLine"]
      }
    }
  });

  if (!response.text) {
    throw new Error("Empty response received from Gemini model.");
  }

  return cleanAndParseJson<EvalResult>(response.text);
}

async function evaluateWithClaude(apiKey: string, prompt: string, markdown: string, customModel?: string | null): Promise<EvalResult> {
  const anthropic = new Anthropic({ apiKey });

  const systemInstruction = `
You are an expert data monitoring assistant. 
Your task is to analyze the provided markdown content of a webpage and check if it meets the user's custom tracking criteria.
You must report the evaluation results strictly by calling the 'report_result' tool.
`;

  const userPrompt = `
User Prompt/Criteria: "${prompt}"

Webpage Content (Markdown):
---
${markdown}
---
`;

  let modelName = customModel ? customModel.trim() : "claude-3-5-sonnet-20241022";
  if (!modelName.includes("/")) {
    modelName = modelName.toLowerCase().replace(/\s+/g, "-");
  }

  const response = await anthropic.messages.create({
    model: modelName,
    max_tokens: 1500,
    system: systemInstruction,
    messages: [{ role: "user", content: userPrompt }],
    tools: [
      {
        name: "report_result",
        description: "Report the detailed evaluation findings.",
        input_schema: {
          type: "object",
          properties: {
            conditionMet: { 
              type: "boolean", 
              description: "true if the webpage content matches the user prompt/criteria, false otherwise." 
            },
            confidenceScore: { 
              type: "number", 
              description: "Confidence score between 0.0 and 1.0." 
            },
            summaryOfChanges: { 
              type: "string", 
              description: "A detailed description in markdown format of what matches the prompt, including pricing, specific items, or listings found." 
            },
            emailSubjectLine: { 
              type: "string", 
              description: "A professional and informative email subject line starting with 'Alert: ' summarizing the match." 
            }
          },
          required: ["conditionMet", "confidenceScore", "summaryOfChanges", "emailSubjectLine"]
        }
      }
    ],
    tool_choice: { type: "tool", name: "report_result" }
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse) {
    throw new Error("Claude did not call the expected tool to report results.");
  }

  return toolUse.input as unknown as EvalResult;
}

async function sendNotificationEmail(
  apiKey: string,
  senderEmail: string,
  subject: string,
  summaryMarkdown: string,
  trackerName: string,
  url: string
) {
  const resend = new Resend(apiKey);
  
  // Format the markdown summary into readable paragraphs/bullet points for HTML email
  // Simple replacement of markdown bold and list formatting for email clients
  const formattedSummary = summaryMarkdown
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/^\s*-\s*(.*?)$/gm, "<li>$1</li>")
    .split("\n\n")
    .map(p => {
      if (p.includes("<li>")) {
        return `<ul style="margin: 5px 0; padding-left: 20px; color: #475569;">${p}</ul>`;
      }
      return `<p style="margin: 0 0 10px 0; color: #475569; line-height: 1.5; font-size: 15px;">${p}</p>`;
    })
    .join("");

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <h2 style="color: #4f46e5; margin-top: 0; font-size: 22px; font-weight: 700;">prompt2track Alert</h2>
      <p style="font-size: 16px; color: #1e293b; margin-bottom: 20px;">
        Your tracker <strong>${trackerName}</strong> has found content matching your prompt criteria!
      </p>
      
      <div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 20px; margin: 20px 0; border-radius: 6px;">
        <h4 style="margin: 0 0 12px 0; color: #1e293b; font-size: 16px; font-weight: 600;">Summary of Findings:</h4>
        <div style="font-size: 15px; color: #475569;">
          ${formattedSummary}
        </div>
      </div>
      
      <div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center;">
        <a href="${url}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
          View Target Website
        </a>
      </div>
      <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 25px; margin-bottom: 0;">
        Sent automatically by prompt2track. Make sure to visit your dashboard to manage trackers.
      </p>
    </div>
  `;

  // Dynamically determine the "from" address:
  // If the configured email is a common public provider (Gmail, Yahoo, etc.),
  // we must send from "onboarding@resend.dev" to bypass verification restrictions.
  const publicDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "mail.com", "protonmail.com", "proton.me"];
  const emailDomain = senderEmail.split("@")[1]?.toLowerCase() || "";
  const fromEmail = publicDomains.includes(emailDomain)
    ? "onboarding@resend.dev"
    : senderEmail;

  const result = await resend.emails.send({
    from: `prompt2track <${fromEmail}>`,
    to: senderEmail,
    subject: subject,
    html: htmlContent,
  });

  if (result.error) {
    throw new Error(`Resend Error: ${result.error.message}`);
  }
}

function cleanAndParseJson<T>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch (firstError) {
    // Attempt to clean markdown code blocks
    let cleanText = trimmed;
    if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/^```[a-zA-Z0-9]*\s*/, "");
      cleanText = cleanText.replace(/\s*```$/, "");
    }
    
    cleanText = cleanText.trim();
    try {
      return JSON.parse(cleanText) as T;
    } catch (secondError) {
      // Fallback: extract the first matching JSON object pattern { ... }
      const match = cleanText.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]!) as T;
        } catch (thirdError: any) {
          throw new Error(`Failed to parse extracted JSON: ${thirdError.message}. Content was: ${text}`);
        }
      }
      throw new Error(`No JSON object found in Gemini response: ${text}`);
    }
  }
}
