import { GoogleGenAI } from "@google/genai";
import { chromium } from "playwright";
import * as cheerio from "cheerio";

export interface DetectedSelectors {
  usernameSelector: string | null;
  passwordSelector: string | null;
  submitSelector: string | null;
}

/**
 * Launches Playwright, loads the login page, extracts and cleans the HTML structure,
 * and uses Google Gemini to detect the CSS selectors for the login form.
 */
export async function detectLoginSelectors(
  loginUrl: string,
  geminiApiKey: string
): Promise<DetectedSelectors> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
      locale: "en-US",
      timezoneId: "America/New_York",
    });
    
    await context.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
      "Connection": "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    });

    const page = await context.newPage();
    
    // Evade webdriver bot-detection
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });
    
    const targetUrl = loginUrl.startsWith("http://") || loginUrl.startsWith("https://") 
      ? loginUrl 
      : `https://${loginUrl}`;

    console.log(`[SelectorDetector] Fetching login page: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: "load", timeout: 20000 });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    const html = await page.content();
    
    // Parse and clean up HTML to keep ONLY inputs, buttons, labels, and forms with relevant attributes
    const $ = cheerio.load(html);
    
    // Remove scripts, styles, media, and other elements that carry no semantic value for form input identification
    $("script, style, svg, noscript, iframe, img, video, audio, path, symbol, meta, link, head, footer, nav, header").remove();
    
    const allowedAttributes = ["id", "class", "name", "type", "placeholder", "value", "for", "role", "action", "method", "aria-label"];
    $("*").each((_, element) => {
      if (element.type === "tag") {
        const attribs = element.attribs;
        for (const attr of Object.keys(attribs)) {
          if (!allowedAttributes.includes(attr)) {
            $(element).removeAttr(attr);
          }
        }
      }
    });

    const cleanedHtml = $("body").html() || "";
    // Truncate to a reasonable character count if somehow it's extremely huge
    const htmlSnippet = cleanedHtml.slice(0, 40000); 

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

    const systemInstruction = `
You are an expert web scraping and automation assistant.
Your task is to analyze the provided HTML of a login page and find the precise, unique CSS selectors for:
1. The username or email input field.
2. The password input field.
3. The form submit button or submit input.

Guidelines:
- Return a JSON object matching the requested schema.
- Try to make the selectors as specific and robust as possible (e.g. input[type="email"], input[name="username"], button[type="submit"], #login-btn).
- Avoid selectors that rely on highly dynamic or volatile classes.
- If a selector cannot be determined, return null for that field.
`;

    const userPrompt = `
Here is the HTML content of the login page:
---
${htmlSnippet}
---

Please identify the CSS selectors to target the login form inputs and return them in JSON format.
`;

    console.log(`[SelectorDetector] Sending HTML to Gemini for selector identification...`);
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { role: "user", parts: [{ text: userPrompt }] }
      ],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            usernameSelector: { 
              type: "STRING", 
              description: "CSS selector for the username/email input field. Null if not found." 
            },
            passwordSelector: { 
              type: "STRING", 
              description: "CSS selector for the password input field. Null if not found." 
            },
            submitSelector: { 
              type: "STRING", 
              description: "CSS selector for the submit button or input. Null if not found." 
            }
          },
          required: ["usernameSelector", "passwordSelector", "submitSelector"]
        }
      }
    });

    if (!response.text) {
      throw new Error("Empty response received from Gemini model during selector detection.");
    }

    const result = cleanAndParseJson<DetectedSelectors>(response.text);
    console.log(`[SelectorDetector] Successfully detected selectors:`, result);
    return result;
  } catch (error: any) {
    console.error("Error in detectLoginSelectors:", error);
    throw new Error(`Failed to auto-detect login selectors: ${error.message || error}`);
  } finally {
    await browser.close();
  }
}

function cleanAndParseJson<T>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch (firstError) {
    let cleanText = trimmed;
    if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/^```[a-zA-Z0-9]*\s*/, "");
      cleanText = cleanText.replace(/\s*```$/, "");
    }
    cleanText = cleanText.trim();
    try {
      return JSON.parse(cleanText) as T;
    } catch (secondError) {
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
