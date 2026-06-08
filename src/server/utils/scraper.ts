import { chromium } from "playwright";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
import * as fs from "fs";

interface Credentials {
  loginUrl?: string | null;
  loginUsername?: string | null;
  loginPassword?: string | null;
  usernameSelector?: string | null;
  passwordSelector?: string | null;
  submitSelector?: string | null;
}

/**
 * Fetches a URL using Playwright (supporting local login), removes script/style/nav/footer noise,
 * and converts the remaining content to clean Markdown.
 */
export async function scrapeUrl(url: string, credentials?: Credentials): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  let page: any = null;
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

    page = await context.newPage();
    
    // Evade webdriver bot-detection
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    // 1. Perform login flow if all login credentials are provided
    if (
      credentials?.loginUrl &&
      credentials.loginUsername &&
      credentials.loginPassword &&
      credentials.usernameSelector &&
      credentials.passwordSelector &&
      credentials.submitSelector
    ) {
      await page.goto(credentials.loginUrl, { waitUntil: "load" });
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      await page.fill(credentials.usernameSelector, credentials.loginUsername);
      await page.fill(credentials.passwordSelector, credentials.loginPassword);
      await page.click(credentials.submitSelector);
      // Wait for navigation or load state after login
      await page.waitForLoadState("load", { timeout: 10000 }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    }

    // 2. Navigate to target URL
    const targetUrl = url.startsWith("http://") || url.startsWith("https://") 
      ? url 
      : `https://${url}`;

    await page.goto(targetUrl, { waitUntil: "load" });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    const html = await page.content();
    const title = await page.title();
    
    const $ = cheerio.load(html);

    // Extract title and meta tags (like YouTube interactionCount for view counts)
    const metaData: string[] = [];
    if (title) {
      metaData.push(`- Title: ${title}`);
    }

    $("meta").each((_, el) => {
      const name = $(el).attr("name") || $(el).attr("property") || $(el).attr("itemprop");
      const content = $(el).attr("content");
      if (name && content) {
        const cleanName = name.trim();
        const cleanContent = content.trim();
        // Skip excessively long contents or base64 data to optimize tokens
        if (cleanContent.length < 500 && !cleanContent.startsWith("data:")) {
          metaData.push(`- ${cleanName}: ${cleanContent}`);
        }
      }
    });

    const metaSection = metaData.length > 0
      ? `## Page Metadata\n${metaData.join("\n")}\n\n## Page Content\n`
      : "";

    // Remove noise elements
    $("script, style, nav, footer, header, iframe, noscript, svg, symbol, path, aside, head").remove();

    // Use the cleaned body directly as the target node to ensure no content is lost
    const targetNode = $("body");
    
    const cleanedHtml = targetNode.html() || "";

    // Configure Turndown for clean output
    // @ts-ignore (Handle ESM import compatibility variations if any)
    const TurndownConstructor = TurndownService.default || TurndownService;
    const turndownService = new TurndownConstructor({
      headingStyle: "atx",
      hr: "---",
      bullet: "-",
      codeBlockStyle: "fenced",
    });

    // Remove unnecessary elements from Markdown conversion
    turndownService.keep(["table", "tbody", "thead", "tr", "th", "td"]);

    let markdown = turndownService.turndown(cleanedHtml);

    // Clean up empty lines and clean whitespace
    markdown = markdown
      .replace(/\r\n/g, "\n")
      .replace(/\n\s*\n\s*\n/g, "\n\n") // Collapse triple newlines
      .trim();

    if (!markdown) {
      // Fallback to text if markdown is empty
      markdown = targetNode.text().replace(/\s+/g, " ").trim();
    }

    return metaSection + markdown;
  } catch (error: any) {
    let screenshotUrl: string | undefined = undefined;
    try {
      if (page && !page.isClosed()) {
        const runId = Math.random().toString(36).substring(2, 15);
        const filename = `${runId}.png`;
        const dir = "./public/screenshots";
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        const filePath = `${dir}/${filename}`;
        await page.screenshot({ path: filePath, fullPage: true });
        screenshotUrl = `/screenshots/${filename}`;
        console.log(`[Scraper] Saved error screenshot to ${filePath}`);
      }
    } catch (screenshotErr) {
      console.error("[Scraper] Failed to take failure screenshot:", screenshotErr);
    }

    const scraperError = new Error(error.message || error) as any;
    scraperError.screenshotUrl = screenshotUrl;
    throw scraperError;
  } finally {
    await browser.close();
  }
}
