"use client";

import React, { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { SettingsComponent } from "./_components/settings";
import { TrackerFormComponent } from "./_components/tracker-form";
import { RunHistoryComponent } from "./_components/run-history";
import {
  Activity,
  Cpu,
  Mail,
  Plus,
  Settings,
  Trash2,
  Edit,
  ExternalLink,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Compass,
  MonitorPlay,
  RotateCcw,
  Sparkles
} from "lucide-react";

interface Tracker {
  id: string;
  name: string;
  url: string;
  prompt: string;
  cronInterval: string;
  aiProvider: string;
  aiModel: string | null;
  isActive: boolean;
  keepActiveAfterMatch: boolean | null;
  lastRunStatus: string | null;
  lastRunTime: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function TrackerCountdown({
  cronInterval,
  lastRunTime,
  isActive,
}: {
  cronInterval: string;
  lastRunTime: Date | string | null;
  isActive: boolean;
}) {
  const [timeLeft, setTimeLeft] = useState<string>("");

  useEffect(() => {
    if (!isActive) {
      setTimeLeft("Paused");
      return;
    }

    const intervalMsMap: Record<string, number> = {
      EVERY_MINUTE: 1000 * 60,
      EVERY_5_MINUTES: 1000 * 60 * 5,
      EVERY_10_MINUTES: 1000 * 60 * 10,
      EVERY_30_MINUTES: 1000 * 60 * 30,
      EVERY_HOUR: 1000 * 60 * 60,
      EVERY_6_HOURS: 1000 * 60 * 60 * 6,
      DAILY: 1000 * 60 * 60 * 24,
    };

    const intervalMs = intervalMsMap[cronInterval] ?? 0;

    if (!lastRunTime) {
      setTimeLeft("Due now");
      return;
    }

    const calculateTimeLeft = () => {
      const lastRun = new Date(lastRunTime).getTime();
      const targetTime = lastRun + intervalMs;
      const now = Date.now();
      const diff = targetTime - now;

      if (diff <= 0) {
        setTimeLeft("Due now");
      } else {
        const secs = Math.floor(diff / 1000) % 60;
        const mins = Math.floor(diff / (1000 * 60)) % 60;
        const hours = Math.floor(diff / (1000 * 60 * 60)) % 24;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (mins > 0 || hours > 0) {
          parts.push(`${mins}m`);
        }
        parts.push(`${secs}s`);

        setTimeLeft(parts.join(" "));
      }
    };

    calculateTimeLeft();
    const intervalId = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(intervalId);
  }, [cronInterval, lastRunTime, isActive]);

  if (!isActive) {
    return <span className="text-zinc-650 font-bold font-mono">Paused</span>;
  }

  if (timeLeft === "Due now") {
    return (
      <span className="text-emerald-500 font-bold font-mono animate-pulse">
        Due now
      </span>
    );
  }

  return <span className="text-zinc-350 font-bold font-mono">{timeLeft}</span>;
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<"trackers" | "settings">("trackers");
  const [editingTracker, setEditingTracker] = useState<Tracker | null>(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [viewHistoryTracker, setViewHistoryTracker] = useState<{ id: string; name: string } | null>(null);
  const [runningTrackerId, setRunningTrackerId] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Queries & Mutations
  const { data: trackers, refetch: refetchTrackers, isLoading: trackersLoading } = api.tracker.getTrackers.useQuery(undefined, {
    refetchInterval: 10000, // Auto-refresh the dashboard view every 10 seconds!
  });
  const { data: config } = api.config.getConfig.useQuery(undefined, { refetchOnWindowFocus: false });

  const deleteMutation = api.tracker.deleteTracker.useMutation({
    onSuccess: () => {
      refetchTrackers();
      showToast("Tracker deleted.");
    },
  });

  const toggleActiveMutation = api.tracker.updateTracker.useMutation({
    onSuccess: () => {
      refetchTrackers();
    },
  });

  const triggerRunMutation = api.tracker.triggerRun.useMutation({
    onSuccess: (res) => {
      refetchTrackers();
      if (res.status === "SUCCESS") {
        showToast("Run complete: Criteria met. Notification sent.");
      } else if (res.status === "NO_MATCH") {
        showToast("Run complete: Checked (no match).");
      } else {
        showToast(`Run failed: ${res.error || "Error"}`);
      }
    },
    onError: (err) => {
      showToast(`Run failed: ${err.message}`);
    },
  });

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  const handleToggleActive = (tracker: Tracker) => {
    toggleActiveMutation.mutate({
      id: tracker.id,
      name: tracker.name,
      url: tracker.url,
      prompt: tracker.prompt,
      cronInterval: tracker.cronInterval as any,
      aiProvider: tracker.aiProvider as any,
      isActive: !tracker.isActive,
      aiModel: tracker.aiModel,
      keepActiveAfterMatch: tracker.keepActiveAfterMatch ?? true,
    });
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Delete tracker "${name}"?`)) {
      deleteMutation.mutate({ id });
    }
  };

  const handleRunNow = async (id: string) => {
    setRunningTrackerId(id);
    try {
      await triggerRunMutation.mutateAsync({ id });
    } finally {
      setRunningTrackerId(null);
    }
  };

  // Compute stats
  const totalTrackers = trackers?.length || 0;
  const activeCount = trackers?.filter((t) => t.isActive).length || 0;
  const lastSuccessCount = trackers?.filter((t) => t.lastRunStatus === "SUCCESS").length || 0;

  return (
    <main className="min-h-screen text-zinc-100 p-4 md:p-8 bg-black relative selection:bg-zinc-100 selection:text-black">
      {/* Toast notification */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-zinc-900 border border-zinc-800 text-white px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2 max-w-sm animate-in slide-in-from-bottom-3 duration-150">
          <Sparkles className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
          <span className="text-xs font-medium">{successToast}</span>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="border border-zinc-800 bg-zinc-950 rounded-xl p-5 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-zinc-900 p-2 rounded-lg border border-zinc-800 text-zinc-300">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-white">
                PROMPT2TRACK
              </h1>
              <p className="text-xxs text-zinc-500 font-semibold tracking-wider uppercase">Self-Hosted Monitor</p>
            </div>
          </div>

          {/* Connection Status badges */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Gemini */}
            <div
              className={`flex items-center gap-1 px-2 py-0.5 rounded border text-xxs font-mono ${
                config?.hasGeminiKey
                  ? "border-zinc-700 bg-zinc-900 text-zinc-300"
                  : "border-zinc-800 text-zinc-600"
              }`}
            >
              Gemini: {config?.hasGeminiKey ? "ON" : "OFF"}
            </div>

            {/* Claude */}
            <div
              className={`flex items-center gap-1 px-2 py-0.5 rounded border text-xxs font-mono ${
                config?.hasAnthropicKey
                  ? "border-zinc-700 bg-zinc-900 text-zinc-300"
                  : "border-zinc-800 text-zinc-600"
              }`}
            >
              Claude: {config?.hasAnthropicKey ? "ON" : "OFF"}
            </div>

            {/* Resend */}
            <div
              className={`flex items-center gap-1 px-2 py-0.5 rounded border text-xxs font-mono ${
                config?.hasResendKey
                  ? "border-zinc-700 bg-zinc-900 text-zinc-300"
                  : "border-zinc-800 text-zinc-600"
              }`}
            >
              Resend: {config?.hasResendKey ? "ON" : "OFF"}
            </div>
          </div>
        </div>

        {/* Tab switch navigation */}
        <div className="flex justify-between items-center">
          <div className="bg-zinc-900/60 p-1 rounded-lg border border-zinc-800 flex gap-1">
            <button
              onClick={() => setActiveTab("trackers")}
              className={`px-4 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "trackers"
                  ? "bg-zinc-800 text-white border border-zinc-700 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Trackers
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`px-4 py-1.5 rounded text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                activeTab === "settings"
                  ? "bg-zinc-800 text-white border border-zinc-700 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Settings className="w-3 h-3" />
              Settings
            </button>
          </div>

          {activeTab === "trackers" && (
            <button
              onClick={() => {
                setEditingTracker(null);
                setShowFormModal(true);
              }}
              className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-zinc-200 transition-all font-bold text-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Create
            </button>
          )}
        </div>

        {/* Dynamic tabs render */}
        {activeTab === "settings" ? (
          <SettingsComponent />
        ) : (
          <div className="space-y-6">
            {/* Quick Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="border border-zinc-800 bg-zinc-950 rounded-xl p-4 flex flex-col justify-between">
                <span className="text-xxs font-bold uppercase tracking-wider text-zinc-500">Total Trackers</span>
                <span className="text-xl font-bold text-white mt-1">{totalTrackers}</span>
              </div>
              <div className="border border-zinc-800 bg-zinc-950 rounded-xl p-4 flex flex-col justify-between">
                <span className="text-xxs font-bold uppercase tracking-wider text-zinc-500">Active</span>
                <span className="text-xl font-bold text-white mt-1">{activeCount}</span>
              </div>
              <div className="border border-zinc-800 bg-zinc-950 rounded-xl p-4 flex flex-col justify-between">
                <span className="text-xxs font-bold uppercase tracking-wider text-zinc-500">Matches</span>
                <span className="text-xl font-bold text-white mt-1">{lastSuccessCount}</span>
              </div>
              <div className="border border-zinc-800 bg-zinc-950 rounded-xl p-4 flex flex-col justify-between">
                <span className="text-xxs font-bold uppercase tracking-wider text-zinc-500">Status</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <div className="w-2 h-2 rounded-full bg-white" />
                  <span className="text-xs font-semibold text-zinc-300">Online</span>
                </div>
              </div>
            </div>

            {/* Trackers Grid */}
            {trackersLoading ? (
              <div className="flex justify-center items-center py-20">
                <Activity className="w-6 h-6 text-zinc-500 animate-spin" />
              </div>
            ) : trackers && trackers.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {trackers.map((tracker) => {
                  const isRunning = runningTrackerId === tracker.id;
                  const isSuccess = tracker.lastRunStatus === "SUCCESS";
                  const isNoMatch = tracker.lastRunStatus === "NO_MATCH";
                  const isFailed = tracker.lastRunStatus === "FAILED";

                  return (
                    <div
                      key={tracker.id}
                      className={`border border-zinc-800 bg-zinc-950 rounded-xl p-5 flex flex-col justify-between transition-all ${
                        !tracker.isActive ? "opacity-45" : "hover:border-zinc-700"
                      }`}
                    >
                      <div>
                        {/* Title block */}
                        <div className="flex justify-between items-start gap-2 mb-3">
                          <div className="max-w-[70%]">
                            <h3 className="font-bold text-white truncate text-sm">
                              {tracker.name}
                            </h3>
                            <a
                              href={tracker.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xxs text-zinc-500 hover:text-zinc-300 flex items-center gap-0.5 truncate cursor-pointer font-mono mt-0.5"
                            >
                              {tracker.url.replace(/https?:\/\//, "")}
                              <ExternalLink className="w-2.5 h-2.5 inline shrink-0" />
                            </a>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`text-[9px] font-bold uppercase tracking-wider ${tracker.isActive ? "text-zinc-300" : "text-zinc-600"}`}>
                              {tracker.isActive ? "Active" : "Paused"}
                            </span>
                            {/* Toggle checkbox switch */}
                            <label className="relative inline-flex items-center cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={tracker.isActive}
                                onChange={() => handleToggleActive(tracker)}
                                className="sr-only peer"
                              />
                              <div className="w-6 h-3.5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-600 after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-zinc-200" />
                            </label>
                          </div>
                        </div>

                        {/* Prompt bubble */}
                        <div className="border border-zinc-900 bg-zinc-900/50 rounded-lg p-3 mb-4">
                          <span className="text-[10px] font-bold text-zinc-500 block mb-0.5 uppercase tracking-wide">
                            Criteria
                          </span>
                          <p className="text-xs text-zinc-300 line-clamp-3 leading-normal italic">
                            &ldquo;{tracker.prompt}&rdquo;
                          </p>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="space-y-3.5 border-t border-zinc-900 pt-3.5">
                        <div className="flex items-center justify-between text-xxs text-zinc-500 font-mono">
                          <div className="flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            <span>
                              {tracker.cronInterval === "EVERY_MINUTE"
                                ? "1 Min"
                                : tracker.cronInterval === "EVERY_5_MINUTES"
                                ? "5 Mins"
                                : tracker.cronInterval === "EVERY_10_MINUTES"
                                ? "10 Mins"
                                : tracker.cronInterval === "EVERY_30_MINUTES"
                                ? "30 Mins"
                                : tracker.cronInterval === "EVERY_HOUR"
                                ? "Hourly"
                                : tracker.cronInterval === "EVERY_6_HOURS"
                                ? "6 Hours"
                                : "Daily"}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{tracker.aiProvider === "GEMINI" ? "Gemini" : "Claude"}</span>
                            {tracker.aiModel && (
                              <>
                                <span className="text-zinc-700">•</span>
                                <span className="text-zinc-400 font-mono text-[10px]">{tracker.aiModel}</span>
                              </>
                            )}
                            <span className="text-zinc-700">•</span>
                            <span className="text-zinc-550">
                              {(tracker.keepActiveAfterMatch ?? true) ? "Continuous" : "Single check"}
                            </span>
                          </div>
                        </div>

                        {/* Status bar */}
                        <div className="flex items-center justify-between bg-zinc-900/30 px-3 py-1.5 rounded-lg border border-zinc-900 text-xxs">
                          <span className="text-zinc-500">Status</span>
                          <div className="flex items-center gap-1 font-bold">
                            {isSuccess && (
                              <span className="text-white">MATCH FOUND</span>
                            )}
                            {isNoMatch && (
                              <span className="text-zinc-500">NO MATCH</span>
                            )}
                            {isFailed && (
                              <span className="text-zinc-400">FAILED</span>
                            )}
                            {!tracker.lastRunStatus && (
                              <span className="text-zinc-600">PENDING</span>
                            )}
                          </div>
                        </div>

                        {/* Next Run bar */}
                        <div className="flex items-center justify-between bg-zinc-900/30 px-3 py-1.5 rounded-lg border border-zinc-900 text-xxs">
                          <span className="text-zinc-500">Next Run</span>
                          <TrackerCountdown
                            cronInterval={tracker.cronInterval}
                            lastRunTime={tracker.lastRunTime}
                            isActive={tracker.isActive}
                          />
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleRunNow(tracker.id)}
                            disabled={isRunning}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded border border-zinc-800 bg-black hover:bg-zinc-900 disabled:opacity-50 transition-all font-semibold text-xxs text-zinc-200 cursor-pointer"
                          >
                            {isRunning ? (
                              <RotateCcw className="w-3 h-3 animate-spin text-zinc-500" />
                            ) : (
                              <Play className="w-3 h-3 text-zinc-300 fill-current" />
                            )}
                            Run
                          </button>

                          <button
                            onClick={() => setViewHistoryTracker({ id: tracker.id, name: tracker.name })}
                            className="px-2.5 py-1.5 rounded border border-zinc-800 bg-black hover:bg-zinc-900 transition-all font-semibold text-xxs text-zinc-300 cursor-pointer"
                          >
                            Logs
                          </button>

                          <button
                            onClick={() => {
                              setEditingTracker(tracker);
                              setShowFormModal(true);
                            }}
                            className="p-1.5 rounded border border-zinc-800 bg-black hover:bg-zinc-900 transition-all cursor-pointer"
                          >
                            <Edit className="w-3 h-3 text-zinc-350" />
                          </button>

                          <button
                            onClick={() => handleDelete(tracker.id, tracker.name)}
                            className="p-1.5 rounded border border-zinc-800 bg-black hover:bg-red-950/20 hover:border-red-900 text-zinc-500 hover:text-red-400 transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col justify-center items-center py-20 border border-dashed border-zinc-800 rounded-xl bg-zinc-950 gap-3 text-zinc-500">
                <MonitorPlay className="w-8 h-8 text-zinc-700" />
                <p className="font-semibold text-zinc-350 text-sm">No trackers set up.</p>
                <button
                  onClick={() => {
                    setEditingTracker(null);
                    setShowFormModal(true);
                  }}
                  className="px-3.5 py-1.5 rounded bg-zinc-100 text-zinc-950 hover:bg-zinc-200 transition-all font-bold text-xs cursor-pointer"
                >
                  Create Your First Tracker
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Forms */}
      {showFormModal && (
        <TrackerFormComponent
          tracker={editingTracker}
          onClose={() => {
            setShowFormModal(false);
            setEditingTracker(null);
          }}
          onSuccess={refetchTrackers}
        />
      )}

      {/* History */}
      {viewHistoryTracker && (
        <RunHistoryComponent
          trackerId={viewHistoryTracker.id}
          trackerName={viewHistoryTracker.name}
          onClose={() => setViewHistoryTracker(null)}
        />
      )}
    </main>
  );
}
