"use client";

import React, { useState } from "react";
import { api } from "~/trpc/react";
import { X, Calendar, CheckCircle2, AlertCircle, Eye, EyeOff, Loader2, HelpCircle } from "lucide-react";

interface RunHistoryProps {
  trackerId: string;
  trackerName: string;
  onClose: () => void;
}

export function RunHistoryComponent({ trackerId, trackerName, onClose }: RunHistoryProps) {
  const { data: runs, isLoading, refetch } = api.tracker.getRuns.useQuery({ trackerId });
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const toggleExpand = (runId: string) => {
    setExpandedRunId(expandedRunId === runId ? null : runId);
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xxs p-4">
      <div className="border border-zinc-850 bg-zinc-950 w-full max-w-xl rounded-xl p-6 shadow-2xl relative flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-100">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-zinc-900 pb-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-white">
              Execution Logs
            </h3>
            <p className="text-[10px] text-zinc-500 mt-0.5">
              Logs for <strong className="text-zinc-300 font-semibold">{trackerName}</strong>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="text-xxs border border-zinc-800 bg-black hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded transition-colors cursor-pointer font-semibold"
            >
              Refresh
            </button>
            <button
              onClick={onClose}
              className="text-zinc-550 hover:text-zinc-200 hover:bg-zinc-900 p-1 rounded transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-2 min-h-[200px]">
          {isLoading ? (
            <div className="flex flex-col justify-center items-center py-16 text-zinc-500 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-xxs">Loading history...</span>
            </div>
          ) : !runs || runs.length === 0 ? (
            <div className="flex flex-col justify-center items-center py-16 text-zinc-600 border border-dashed border-zinc-800 rounded-lg">
              <HelpCircle className="w-6 h-6 text-zinc-700 mb-1" />
              <p className="text-xs">No runs recorded.</p>
            </div>
          ) : (
            runs.map((run) => {
              const isExpanded = expandedRunId === run.id;
              const isSuccess = run.status === "SUCCESS";
              const isFailed = run.status === "FAILED";
              const isNoMatch = run.status === "NO_MATCH";

              return (
                <div
                  key={run.id}
                  className={`border rounded-lg transition-all ${
                    isExpanded
                      ? "border-zinc-650 bg-zinc-900/40"
                      : "border-zinc-850 bg-black hover:border-zinc-800"
                  }`}
                >
                  {/* Summary Row */}
                  <div
                    onClick={() => toggleExpand(run.id)}
                    className="flex items-center justify-between p-3 cursor-pointer select-none gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${isSuccess ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : isNoMatch ? "bg-zinc-600" : "bg-rose-500 shadow-[0_0_8px_#f43f5e]"}`} />

                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-zinc-300">
                            {run.status}
                          </span>
                          {run.confidenceScore !== null && (
                            <span className="text-[9px] text-zinc-500 font-mono">
                              ({Math.round(run.confidenceScore * 100)}% conf)
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] text-zinc-550">{formatDate(run.runTime)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-zinc-600 font-mono">{run.id.slice(0, 6)}</span>
                      {isExpanded ? (
                        <EyeOff className="w-3.5 h-3.5 text-zinc-400" />
                      ) : (
                        <Eye className="w-3.5 h-3.5 text-zinc-600" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Detail Panel */}
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-zinc-900 pt-2 animate-in slide-in-from-top-1 duration-75">
                      {isFailed ? (
                        <div className="space-y-3">
                          <div className="bg-red-950/20 border border-red-900/30 text-red-400 p-2.5 rounded text-xxs font-mono leading-normal">
                            {run.errorMessage}
                          </div>
                          {run.screenshotUrl && (
                            <div className="space-y-1.5">
                              <strong className="block text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                                Failure Screenshot
                              </strong>
                              <div className="relative group overflow-hidden rounded-lg border border-zinc-850 bg-black">
                                <img
                                  src={run.screenshotUrl}
                                  alt="Failure Screenshot"
                                  className="w-full max-h-[260px] object-contain object-top opacity-85 transition-opacity group-hover:opacity-100"
                                />
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-150">
                                  <a
                                    href={run.screenshotUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-3 py-1.5 bg-zinc-100 text-zinc-950 text-[10px] font-bold rounded-md hover:bg-zinc-200 transition-all shadow-md"
                                  >
                                    View Full Image
                                  </a>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <strong className="block text-[9px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                            Result Summary
                          </strong>
                          <div className="bg-black border border-zinc-850 p-2.5 rounded text-xxs text-zinc-300 font-normal leading-normal whitespace-pre-wrap">
                            {run.summaryOfChanges || "Checked successfully."}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-900 pt-3 mt-3 text-right">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-zinc-200 transition-all text-xs font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
