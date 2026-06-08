"use client";

import React, { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { KeyRound, Mail, RefreshCw, Save, CheckCircle2, AlertTriangle, ShieldCheck, HelpCircle } from "lucide-react";

export function SettingsComponent() {
  const [resendApiKey, setResendApiKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [defaultSenderEmail, setDefaultSenderEmail] = useState("");

  const [testing, setTesting] = useState(false);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [testResults, setTestResults] = useState<{
    resend?: { success: boolean; message: string };
    gemini?: { success: boolean; message: string };
    anthropic?: { success: boolean; message: string };
  } | null>(null);

  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // tRPC queries & mutations
  const { data: config, refetch, isLoading } = api.config.getConfig.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const saveMutation = api.config.saveConfig.useMutation({
    onSuccess: () => {
      setFeedback({ type: "success", message: "Configuration saved." });
      refetch();
    },
    onError: (err) => {
      setFeedback({ type: "error", message: err.message || "Failed to save configuration." });
    },
  });

  const testMutation = api.config.testCredentials.useMutation();
  const sendTestEmailMutation = api.config.sendTestEmail.useMutation();

  // Load config when fetched
  useEffect(() => {
    if (config) {
      setResendApiKey(config.resendApiKey);
      setGeminiApiKey(config.geminiApiKey);
      setAnthropicApiKey(config.anthropicApiKey);
      setDefaultSenderEmail(config.defaultSenderEmail);
    }
  }, [config]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!resendApiKey || !defaultSenderEmail) {
      setFeedback({ type: "error", message: "Resend API Key and Sender Email are required." });
      return;
    }

    if (!geminiApiKey && !anthropicApiKey) {
      setFeedback({ type: "error", message: "At least one AI API Key (Gemini or Claude) is required." });
      return;
    }

    saveMutation.mutate({
      resendApiKey,
      geminiApiKey,
      anthropicApiKey,
      defaultSenderEmail,
    });
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResults(null);
    setFeedback(null);

    try {
      const results = await testMutation.mutateAsync({
        resendApiKey,
        geminiApiKey,
        anthropicApiKey,
        defaultSenderEmail,
      });
      setTestResults(results);
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Verification failed." });
    } finally {
      setTesting(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!resendApiKey || !defaultSenderEmail) {
      setFeedback({ type: "error", message: "Resend API Key and Sender Email are required to send a test email." });
      return;
    }

    setSendingTestEmail(true);
    setFeedback(null);

    try {
      const result = await sendTestEmailMutation.mutateAsync({
        resendApiKey,
        defaultSenderEmail,
      });
      setFeedback({ type: "success", message: result.message || "Test email sent successfully!" });
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to send test email." });
    } finally {
      setSendingTestEmail(false);
    }
  };

  return (
    <div className="border border-zinc-800 bg-zinc-950 rounded-xl p-6 relative overflow-hidden">
      <div className="flex items-center gap-3 border-b border-zinc-900 pb-4 mb-6">
        <div className="bg-zinc-900 p-2 rounded-lg text-zinc-300">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-white">Credentials & API Keys</h2>
          <p className="text-xxs text-zinc-500 font-semibold tracking-tight">API credentials are encrypted at rest.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-10">
          <RefreshCw className="w-6 h-6 text-zinc-500 animate-spin" />
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {feedback && (
            <div
              className={`flex items-start gap-2.5 p-3 rounded-lg text-xs border ${
                feedback.type === "success"
                  ? "bg-zinc-900 border-zinc-800 text-zinc-300"
                  : "bg-red-950/20 border-red-900/30 text-red-400"
              }`}
            >
              {feedback.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Resend API Key */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1">
                <KeyRound className="w-3.5 h-3.5 text-zinc-500" />
                Resend API Key
              </label>
              <input
                type="password"
                value={resendApiKey}
                onChange={(e) => setResendApiKey(e.target.value)}
                placeholder="re_xxxxxxxxxxxxxx"
                className="w-full px-3 py-2 rounded-lg text-xs glass-input font-mono"
              />
              <p className="text-[10px] text-zinc-500 flex items-center gap-1">
                <HelpCircle className="w-3 h-3 text-zinc-700" /> Used to dispatch email alerts.
              </p>
            </div>

            {/* Default Sender Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-zinc-500" />
                Default Sender / Recipient Email
              </label>
              <input
                type="email"
                value={defaultSenderEmail}
                onChange={(e) => setDefaultSenderEmail(e.target.value)}
                placeholder="you@domain.com"
                className="w-full px-3 py-2 rounded-lg text-xs glass-input"
              />
              <p className="text-[10px] text-zinc-500 flex items-center gap-1">
                <HelpCircle className="w-3 h-3 text-zinc-700" /> Alerts will be sent from/to this address.
              </p>
            </div>

            {/* Gemini API Key */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1">
                <KeyRound className="w-3.5 h-3.5 text-zinc-500" />
                Google Gemini API Key
              </label>
              <input
                type="password"
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                placeholder="AIzaSyxxxxxxxxxxxx"
                className="w-full px-3 py-2 rounded-lg text-xs glass-input font-mono"
              />
            </div>

            {/* Anthropic API Key */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1">
                <KeyRound className="w-3.5 h-3.5 text-zinc-500" />
                Anthropic Claude API Key
              </label>
              <input
                type="password"
                value={anthropicApiKey}
                onChange={(e) => setAnthropicApiKey(e.target.value)}
                placeholder="sk-ant-xxxxxxxxxxxx"
                className="w-full px-3 py-2 rounded-lg text-xs glass-input font-mono"
              />
            </div>
          </div>

          {/* Test Status */}
          {testResults && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-zinc-900/30 p-4 rounded-lg border border-zinc-800">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${testResults.resend?.success ? "bg-white" : "bg-zinc-700"}`} />
                  <span className="text-xxs font-bold text-zinc-300">Resend</span>
                </div>
                <p className="text-[10px] text-zinc-550 line-clamp-1">{testResults.resend?.message}</p>
              </div>

              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${testResults.gemini?.success ? "bg-white" : "bg-zinc-700"}`} />
                  <span className="text-xxs font-bold text-zinc-300">Gemini</span>
                </div>
                <p className="text-[10px] text-zinc-550 line-clamp-1">{testResults.gemini?.message}</p>
              </div>

              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${testResults.anthropic?.success ? "bg-white" : "bg-zinc-700"}`} />
                  <span className="text-xxs font-bold text-zinc-300">Claude</span>
                </div>
                <p className="text-[10px] text-zinc-550 line-clamp-1">{testResults.anthropic?.message}</p>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 border-t border-zinc-900 pt-5">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || sendingTestEmail || saveMutation.isPending}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-zinc-800 bg-black text-zinc-300 hover:bg-zinc-900 disabled:opacity-50 transition-all cursor-pointer font-bold text-xs"
            >
              {testing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Test Keys
            </button>

            <button
              type="button"
              onClick={handleSendTestEmail}
              disabled={testing || sendingTestEmail || saveMutation.isPending}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-zinc-800 bg-black text-zinc-300 hover:bg-zinc-900 disabled:opacity-50 transition-all cursor-pointer font-bold text-xs"
            >
              {sendingTestEmail ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Mail className="w-3.5 h-3.5" />
              )}
              Send Test Email
            </button>

            <button
              type="submit"
              disabled={testing || sendingTestEmail || saveMutation.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-zinc-200 disabled:opacity-50 transition-all cursor-pointer font-bold text-xs"
            >
              {saveMutation.isPending ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Save Settings
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
