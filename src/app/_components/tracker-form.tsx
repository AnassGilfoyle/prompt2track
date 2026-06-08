"use client";

import React, { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { Plus, Save, X, Globe, MessageSquare, Clock, Cpu } from "lucide-react";

interface Tracker {
  id: string;
  name: string;
  url: string;
  prompt: string;
  cronInterval: string;
  aiProvider: string;
  aiModel?: string | null;
  isActive: boolean;
  keepActiveAfterMatch: boolean | null;
  loginUrl?: string | null;
  loginUsername?: string | null;
  loginPassword?: string | null;
  usernameSelector?: string | null;
  passwordSelector?: string | null;
  submitSelector?: string | null;
}

interface TrackerFormProps {
  tracker?: Tracker | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function TrackerFormComponent({ tracker, onClose, onSuccess }: TrackerFormProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [cronInterval, setCronInterval] = useState<
    "EVERY_MINUTE" | "EVERY_5_MINUTES" | "EVERY_10_MINUTES" | "EVERY_30_MINUTES" | "EVERY_HOUR" | "EVERY_6_HOURS" | "DAILY"
  >("EVERY_HOUR");
  const [aiProvider, setAiProvider] = useState<"GEMINI" | "CLAUDE">("GEMINI");
  const [selectedModelType, setSelectedModelType] = useState("gemini-2.5-flash");
  const [customModel, setCustomModel] = useState("");
  const [keepActiveAfterMatch, setKeepActiveAfterMatch] = useState(true);
  const [error, setError] = useState("");

  const [loginUrl, setLoginUrl] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [usernameSelector, setUsernameSelector] = useState("");
  const [passwordSelector, setPasswordSelector] = useState("");
  const [submitSelector, setSubmitSelector] = useState("");
  const [showAuthSection, setShowAuthSection] = useState(false);

  const isEdit = !!tracker;

  // Initialize form if editing
  useEffect(() => {
    if (tracker) {
      setName(tracker.name);
      setUrl(tracker.url);
      setPrompt(tracker.prompt);
      setCronInterval(tracker.cronInterval as any);
      setAiProvider(tracker.aiProvider as any);
      setKeepActiveAfterMatch(tracker.keepActiveAfterMatch ?? true);

      setLoginUrl(tracker.loginUrl ?? "");
      setLoginUsername(tracker.loginUsername ?? "");
      setLoginPassword(tracker.loginPassword ?? "");
      setUsernameSelector(tracker.usernameSelector ?? "");
      setPasswordSelector(tracker.passwordSelector ?? "");
      setSubmitSelector(tracker.submitSelector ?? "");
      setShowAuthSection(!!tracker.loginUrl);

      // Handle aiModel initialization
      const model = tracker.aiModel;
      const isGemini = tracker.aiProvider === "GEMINI";
      const defaultGemini = "gemini-2.5-flash";
      const defaultClaude = "claude-3-5-sonnet-20241022";
      
      const geminiModels = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-2.0-flash-lite-preview-02-05"];
      const claudeModels = ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"];

      if (!model) {
        setSelectedModelType(isGemini ? defaultGemini : defaultClaude);
        setCustomModel("");
      } else if (isGemini ? geminiModels.includes(model) : claudeModels.includes(model)) {
        setSelectedModelType(model);
        setCustomModel("");
      } else {
        setSelectedModelType("custom");
        setCustomModel(model);
      }
    } else {
      setName("");
      setUrl("");
      setPrompt("");
      setCronInterval("EVERY_HOUR");
      setAiProvider("GEMINI");
      setSelectedModelType("gemini-2.5-flash");
      setCustomModel("");
      setKeepActiveAfterMatch(true);

      setLoginUrl("");
      setLoginUsername("");
      setLoginPassword("");
      setUsernameSelector("");
      setPasswordSelector("");
      setSubmitSelector("");
      setShowAuthSection(false);
    }
  }, [tracker]);

  const handleProviderChange = (provider: "GEMINI" | "CLAUDE") => {
    setAiProvider(provider);
    if (provider === "GEMINI") {
      setSelectedModelType("gemini-2.5-flash");
    } else {
      setSelectedModelType("claude-3-5-sonnet-20241022");
    }
    setCustomModel("");
  };

  const handleModelTypeChange = (type: string) => {
    setSelectedModelType(type);
    if (type !== "custom") {
      setCustomModel("");
    }
  };

  // tRPC mutations
  const createMutation = api.tracker.createTracker.useMutation({
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (err) => {
      setError(err.message || "Failed to create tracker.");
    },
  });

  const updateMutation = api.tracker.updateTracker.useMutation({
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (err) => {
      setError(err.message || "Failed to update tracker.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim() || !url.trim() || !prompt.trim()) {
      setError("Please fill out all fields.");
      return;
    }

    const modelToSave = selectedModelType === "custom" ? customModel.trim() : selectedModelType;

    const authData = showAuthSection ? {
      loginUrl: loginUrl.trim() || null,
      loginUsername: loginUsername.trim() || null,
      loginPassword: loginPassword || null,
      usernameSelector: usernameSelector.trim() || null,
      passwordSelector: passwordSelector.trim() || null,
      submitSelector: submitSelector.trim() || null,
    } : {
      loginUrl: null,
      loginUsername: null,
      loginPassword: null,
      usernameSelector: null,
      passwordSelector: null,
      submitSelector: null,
    };

    if (isEdit && tracker) {
      updateMutation.mutate({
        id: tracker.id,
        name,
        url,
        prompt,
        cronInterval,
        aiProvider,
        aiModel: modelToSave || null,
        isActive: tracker.isActive,
        keepActiveAfterMatch,
        ...authData,
      });
    } else {
      createMutation.mutate({
        name,
        url,
        prompt,
        cronInterval,
        aiProvider,
        aiModel: modelToSave || null,
        keepActiveAfterMatch,
        ...authData,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xxs p-4">
      <div className="border border-zinc-800 bg-zinc-950 w-full max-w-lg rounded-xl p-6 relative overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-100">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-zinc-900 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white">
              {isEdit ? "Edit Tracker" : "New Tracker"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 p-1 rounded transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="bg-red-950/20 border border-red-900/30 text-red-400 p-3 rounded-lg text-xxs mb-4 font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tracker Name */}
          <div className="space-y-1">
            <label className="text-xxs font-bold uppercase tracking-wider text-zinc-550">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Apartment Monitor"
              className="w-full px-3 py-2 rounded-lg text-xs glass-input"
              disabled={isPending}
              required
            />
          </div>

          {/* Target Website URL */}
          <div className="space-y-1">
            <label className="text-xxs font-bold uppercase tracking-wider text-zinc-550">URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-3 py-2 rounded-lg text-xs glass-input"
              disabled={isPending}
              required
            />
          </div>

          {/* Natural Language Prompt */}
          <div className="space-y-1">
            <label className="text-xxs font-bold uppercase tracking-wider text-zinc-550">Criteria / Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Look for any items under $100..."
              className="w-full px-3 py-2 rounded-lg text-xs glass-input min-h-[80px] resize-none"
              disabled={isPending}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Cron Interval */}
            <div className="space-y-1">
              <label className="text-xxs font-bold uppercase tracking-wider text-zinc-550">Frequency</label>
              <select
                value={cronInterval}
                onChange={(e) => setCronInterval(e.target.value as any)}
                className="w-full px-2 py-2 rounded-lg text-xs glass-input cursor-pointer"
                disabled={isPending}
              >
                <option value="EVERY_MINUTE" className="bg-zinc-950">Every Minute</option>
                <option value="EVERY_5_MINUTES" className="bg-zinc-950">Every 5 Minutes</option>
                <option value="EVERY_10_MINUTES" className="bg-zinc-950">Every 10 Minutes</option>
                <option value="EVERY_30_MINUTES" className="bg-zinc-950">Every 30 Minutes</option>
                <option value="EVERY_HOUR" className="bg-zinc-950">Every Hour</option>
                <option value="EVERY_6_HOURS" className="bg-zinc-950">Every 6 Hours</option>
                <option value="DAILY" className="bg-zinc-950">Daily</option>
              </select>
            </div>

            {/* AI Provider */}
            <div className="space-y-1">
              <label className="text-xxs font-bold uppercase tracking-wider text-zinc-550">AI Provider</label>
              <select
                value={aiProvider}
                onChange={(e) => handleProviderChange(e.target.value as any)}
                className="w-full px-2 py-2 rounded-lg text-xs glass-input cursor-pointer"
                disabled={isPending}
              >
                <option value="GEMINI" className="bg-zinc-955">Google Gemini</option>
                <option value="CLAUDE" className="bg-zinc-955">Anthropic Claude</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-3">
            {/* AI Model */}
            <div className="space-y-1">
              <label className="text-xxs font-bold uppercase tracking-wider text-zinc-550">AI Model</label>
              <select
                value={selectedModelType}
                onChange={(e) => handleModelTypeChange(e.target.value)}
                className="w-full px-2 py-2 rounded-lg text-xs glass-input cursor-pointer"
                disabled={isPending}
              >
                {aiProvider === "GEMINI" ? (
                  <>
                    <option value="gemini-2.5-flash" className="bg-zinc-955">gemini-2.5-flash (Default)</option>
                    <option value="gemini-2.5-pro" className="bg-zinc-955">gemini-2.5-pro</option>
                    <option value="gemini-2.0-flash" className="bg-zinc-955">gemini-2.0-flash</option>
                    <option value="gemini-2.0-flash-lite-preview-02-05" className="bg-zinc-955">gemini-2.0-flash-lite</option>
                    <option value="custom" className="bg-zinc-955">Custom Model...</option>
                  </>
                ) : (
                  <>
                    <option value="claude-3-5-sonnet-20241022" className="bg-zinc-955">claude-3-5-sonnet (Default)</option>
                    <option value="claude-3-5-haiku-20241022" className="bg-zinc-955">claude-3-5-haiku</option>
                    <option value="claude-3-opus-20240229" className="bg-zinc-955">claude-3-opus</option>
                    <option value="custom" className="bg-zinc-955">Custom Model...</option>
                  </>
                )}
              </select>
            </div>

            {/* Custom Model Input / Helper text */}
            {selectedModelType === "custom" ? (
              <div className="space-y-1">
                <label className="text-xxs font-bold uppercase tracking-wider text-zinc-550">Custom Identifier</label>
                <input
                  type="text"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder="e.g. gemini-2.0-pro-exp-02-05"
                  className="w-full px-2.5 py-2 rounded-lg text-xs glass-input"
                  disabled={isPending}
                  required
                />
                <span className="text-[9px] text-zinc-600 block mt-1 leading-normal">
                  Must match a valid model name (e.g., gemini-1.5-flash).
                </span>
              </div>
            ) : (
              <div className="space-y-1 flex flex-col justify-end">
                <span className="text-xxs text-zinc-600 italic pb-2">Uses standard provider API path.</span>
              </div>
            )}
          </div>

          {/* Collapsible Authentication Settings */}
          <div className="border border-zinc-900 bg-zinc-900/10 rounded-lg p-3 space-y-3">
            <button
              type="button"
              onClick={() => setShowAuthSection(!showAuthSection)}
              className="w-full flex items-center justify-between text-xxs font-bold uppercase tracking-wider text-zinc-550 hover:text-zinc-300 transition-colors select-none cursor-pointer"
            >
              <span>Add Credentials</span>
              <span className="text-zinc-650 font-bold">{showAuthSection ? "[-]" : "[+]"}</span>
            </button>
            
            {showAuthSection && (
              <div className="space-y-3 pt-2 border-t border-zinc-900/60 animate-in fade-in slide-in-from-top-1 duration-150">
                <p className="text-[10px] text-zinc-500 leading-relaxed font-semibold">
                  These credentials remain strictly local to your machine. They are stored encrypted in your local database and are only used by the local Playwright browser to authenticate before scraping. They are never sent to the LLM during page evaluations.
                </p>
                
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-550">Login URL</label>
                  <input
                    type="text"
                    value={loginUrl}
                    onChange={(e) => setLoginUrl(e.target.value)}
                    placeholder="https://example.com/login"
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs glass-input"
                    disabled={isPending}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-550">Username / Email</label>
                    <input
                      type="text"
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      placeholder="user@domain.com"
                      className="w-full px-2.5 py-1.5 rounded-lg text-xs glass-input"
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-550">Password</label>
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-2.5 py-1.5 rounded-lg text-xs glass-input"
                      disabled={isPending}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Auto-deactivate Checkbox */}
          <div className="flex items-center gap-2 pt-1 select-none">
            <input
              type="checkbox"
              id="keepActiveAfterMatch"
              checked={keepActiveAfterMatch}
              onChange={(e) => setKeepActiveAfterMatch(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-zinc-800 bg-black text-white focus:ring-0 focus:ring-offset-0 cursor-pointer"
            />
            <label htmlFor="keepActiveAfterMatch" className="text-xxs font-bold uppercase tracking-wider text-zinc-550 cursor-pointer">
              Keep checking even after criteria is met
            </label>
          </div>

          {/* Form Actions */}
          <div className="flex gap-2.5 border-t border-zinc-900 pt-4 mt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="flex-1 px-4 py-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-all cursor-pointer text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-zinc-200 disabled:opacity-50 transition-all cursor-pointer text-xs font-bold"
            >
              {isPending ? (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isEdit ? (
                <Save className="w-3.5 h-3.5" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              {isEdit ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
