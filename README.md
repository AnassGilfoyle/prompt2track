# 📡 prompt2track

**prompt2track** is a powerful, self-hosted web monitoring and tracking dashboard. Instead of writing custom scraping code or manually inspecting CSS selectors, you simply type a target website and a **natural language prompt** (e.g., *"Notify me if the price goes below $100"* or *"Alert me when a player receives a yellow card"*). The tool will periodically scrape the page and use an LLM to evaluate your criteria.

Built with **Next.js**, **Playwright**, **Prisma (SQLite)**, **tRPC**, and **Tailwind CSS**.

---

## ✨ Key Features

- 🤖 **Natural Language Tracking**: Describe what you want to monitor in plain English.
- 🌐 **Playwright Headless Browser**: Renders client-side Javascript, dynamically loads heavy pages (like Fotmob, YouTube, or Amazon), and handles background requests gracefully.
- 🛡️ **Anti-Bot Evasion**: Configured with user-agent emulation, custom headers, and webdriver property overrides to bypass standard crawler checks.
- 🔑 **Secure Local Credentials**: Safely enter site logins (stored encrypted in your local SQLite database). Playwright logs in locally before scraping, and your login details are **never** shared with the LLM.
- 🔍 **AI-Driven Selector Detection**: You do not need to inspect form selectors manually. The backend uses Google Gemini to analyze the page HTML and auto-resolve username, password, and submit button selectors.
- 📸 **Failure Screenshot Logging**: If a tracker execution fails, Playwright takes a full-page screenshot of the browser state and displays it in your logs panel for quick troubleshooting.
- ✉️ **Email Notifications**: Instant email dispatch via Resend when your criteria are met.

---

## 🚀 Getting Started

### 1. Prerequisites (Get your API Keys)

To run the application, you need to configure two services:

#### 📧 Resend (For Email Alerts)
To receive email notifications when a match is found:
1. Sign up for a free account at **[Resend](https://resend.com)**.
2. Generate an API Key from the dashboard.
3. You can use their free tier to send emails to your verified account email address.

#### 🧠 Google AI Studio (For AI evaluations & Selector Detection)
To evaluate the web content and automatically resolve login form inputs:
1. Go to **[Google AI Studio](https://aistudio.google.com)**.
2. Create a free API Key.
3. You can utilize the generous free tier to query models like `gemini-2.5-flash` or custom models.

---

### 2. Local Setup & Installation

Clone the repository and install the dependencies:

```bash
# Install package dependencies
npm install

# Install Playwright browser engines
npx playwright install chromium
```

### 3. Environment Configuration

Copy the example environment file:
```bash
cp .env.example .env
```

Open `.env` and configure your database and security settings:
- **`DATABASE_URL`**: Set to `"file:./db.sqlite"` (uses local SQLite database).
- **`ENCRYPTION_KEY`**: A 32-character hexadecimal key used to encrypt your credentials at rest. (You can generate one using `openssl rand -hex 16` or any 32-character hex string).

### 4. Database Setup

Synchronize the database schema and initialize SQLite:
```bash
npx prisma db push
```

### 5. Running the App

Start the Next.js development server:
```bash
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## ⚙️ Configuration & Usage

1. Open the dashboard and navigate to the **Settings** panel.
2. Enter your **Google Gemini API Key** and **Resend API Key**, and specify a sender email (defaults to `onboarding@resend.dev` for Resend's free tier). Save your settings.
3. Click **+ Create** to make a new tracker:
   - Provide a Name and URL.
   - Enter your natural language prompt criteria.
   - Choose a frequency (e.g. Every Minute, Every Hour, Daily).
   - Select your preferred model. You can choose the default `gemini-2.5-flash` or enter a custom identifier.
   - **Recommended Model**: For a highly reliable and generous free tier experience, you can select *Custom Model...* and enter the Google Gemma model ID: **`gemma-4-31b-it`** (or `gemini-2.0-flash`).
   
4. **Add Credentials** (Optional):
   - If the target website requires a login, expand the **Add Credentials** section.
   - Enter the **Login URL**, **Username/Email**, and **Password**.
   - Upon saving, the backend will automatically parse the login page structure and auto-detect form inputs.

---

## 📄 License

This project is open-source and licensed under the **[MIT License](file:///Users/anasszakarya/Desktop/Projects/somethingChangedMaster/LICENSE)**.
