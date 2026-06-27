"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { runPortfolioAiRecommendation } from "./recommendation-actions";

type CurrentStrategy = {
  id: string | null;
  name: string | null;
  style: string | null;
  promptText: string | null;
  versionNumber: number | null;
  maxPositionPct: number | null;
  cashMinPct: number | null;
  cashMaxPct: number | null;
} | null;

type RunAiControlsProps = {
  portfolioId: string;
  pendingRunCount: number;
  latestRunCreatedAt: string | null;
  cooldownEndsAt: string | null;
  currentStrategy?: CurrentStrategy;
};


function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function useCooldownTimer(cooldownEndsAt: string | null) {
  const [remaining, setRemaining] = useState<number>(() => {
    if (!cooldownEndsAt) return 0;
    return Math.max(0, new Date(cooldownEndsAt).getTime() - Date.now());
  });

  useEffect(() => {
    if (!cooldownEndsAt) return;
    const tick = () => setRemaining(Math.max(0, new Date(cooldownEndsAt).getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, [cooldownEndsAt]);

  return remaining;
}

function formatCountdown(ms: number) {
  if (ms <= 0) return null;
  const totalMins = Math.ceil(ms / 60000);
  if (totalMins >= 60) {
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${totalMins}m`;
}

export default function RunAiControls({
  portfolioId,
  pendingRunCount,
  latestRunCreatedAt,
  cooldownEndsAt,
  currentStrategy,
}: RunAiControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSecondaryPending, startSecondaryTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [backgroundRunning, setBackgroundRunning] = useState(false);
  const [contextNote, setContextNote] = useState("");
  const cooldownRemaining = useCooldownTimer(cooldownEndsAt);
  const isInCooldown = cooldownRemaining > 0;
  const countdown = formatCountdown(cooldownRemaining);

  // Strategy panel
  const [strategyExpanded, setStrategyExpanded] = useState(false);

  // Secondary re-analysis — shown after a successful primary run, used once per session
  const [showSecondary, setShowSecondary] = useState(false);
  const [secondaryUsed, setSecondaryUsed] = useState(false);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [secondaryError, setSecondaryError] = useState("");
  const [secondarySuccess, setSecondarySuccess] = useState("");

  const hasPendingRun = pendingRunCount > 0;
  const isDisabled = isPending || hasPendingRun || backgroundRunning;

  // Keep the page in sync while a run is in progress WITHOUT the user keeping the tab open:
  // poll for completion, refresh when the tab regains focus (e.g. device woke back up), and
  // clear the background flag once the server no longer reports a pending run.
  useEffect(() => {
    if (!hasPendingRun && !backgroundRunning) return;
    const id = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(id);
  }, [hasPendingRun, backgroundRunning, router]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") router.refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  const prevPendingRef = useRef(hasPendingRun);
  useEffect(() => {
    // A pending run that just cleared means it finished — drop the background state.
    if (prevPendingRef.current && !hasPendingRun) { setBackgroundRunning(false); setInfoMessage(""); }
    prevPendingRef.current = hasPendingRun;
  }, [hasPendingRun]);

  function handleRunAi() {
    if (isDisabled) return;
    setErrorMessage("");
    setSuccessMessage("");
    setInfoMessage("");
    setShowSecondary(false);
    setSecondaryUsed(false);
    setBackgroundRunning(true);

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("portfolio_id", portfolioId);
        formData.set("context_note", contextNote.trim());

        const result = await runPortfolioAiRecommendation(formData);

        setBackgroundRunning(false);
        setSuccessMessage(
          `AI review complete — ${result.recommendationCount} recommendation${result.recommendationCount === 1 ? "" : "s"} generated.`
        );
        setShowSecondary(true);
        router.refresh();
      } catch (error) {
        const msg = error instanceof Error ? error.message : "AI review failed.";
        // Pre-flight failures (rate limit / validation) mean nothing started — show them.
        // Anything else (device slept, request interrupted) likely means the run is still
        // completing server-side, so keep it as a background run and let the poll surface it.
        if (/rate limited|too quickly|signed in|portfolio id|cooldown/i.test(msg)) {
          setBackgroundRunning(false);
          setErrorMessage(msg);
        } else {
          setInfoMessage("Your analysis is running in the background — it'll appear below when it's done. You can safely close this page and come back.");
          router.refresh();
        }
      }
    });
  }

  function handleSecondaryRun() {
    if (isSecondaryPending || secondaryUsed || !feedbackNote.trim()) return;
    setSecondaryError("");
    setSecondarySuccess("");

    startSecondaryTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("portfolio_id", portfolioId);
        formData.set("is_secondary_run", "true");
        formData.set("feedback_note", feedbackNote.trim());

        const result = await runPortfolioAiRecommendation(formData);

        setSecondarySuccess(
          `Re-analysis complete — ${result.recommendationCount} recommendation${result.recommendationCount === 1 ? "" : "s"} generated.`
        );
        setSecondaryUsed(true);
        setShowSecondary(false);
        router.refresh();
      } catch (error) {
        setSecondaryError(error instanceof Error ? error.message : "Re-analysis failed.");
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Run button card */}
      <div className="rounded-xl border border-white/8 bg-white/3 p-4">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">Run AI Analysis</p>
            <p className="mt-1 text-sm leading-6 text-slate-300">
              Grok analyzes your portfolio using holdings, strategy, cash, notes, and transaction history.
              Gemini Flash provides a portfolio health check as a cross-reference.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-white/8 bg-white/4 px-2.5 py-1 text-slate-400">
              {pendingRunCount} pending
            </span>
            <span className="rounded-full border border-white/8 bg-white/4 px-2.5 py-1 text-slate-400">
              Last run: {formatDate(latestRunCreatedAt)}
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1.5">
              One-time context note <span className="normal-case font-normal text-slate-600">(optional)</span>
            </label>
            <textarea
              value={contextNote}
              onChange={(e) => setContextNote(e.target.value)}
              placeholder="e.g. I've been rejecting AMD — focus on other buy candidates. I have $500 cash to deploy."
              rows={3}
              maxLength={500}
              disabled={isDisabled}
              className="w-full resize-none rounded-xl border border-white/8 bg-white/4 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:border-blue-500/40 focus:outline-none disabled:opacity-50"
            />
            <p className="mt-1 text-right text-[11px] text-slate-600">{contextNote.length}/500</p>
          </div>

          <button
            type="button"
            onClick={handleRunAi}
            disabled={isDisabled}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            style={isDisabled ? {} : { background: "linear-gradient(135deg,#2563eb,#4f46e5)", boxShadow: "0 4px 16px rgba(37,99,235,0.3)" }}
          >
            {isPending ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Running AI Analysis...
              </>
            ) : (hasPendingRun || backgroundRunning) ? (
              "Analysis running…"
            ) : (
              <>
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192z" />
                </svg>
                Run AI Analysis
              </>
            )}
          </button>

          {(hasPendingRun || backgroundRunning) && !isPending && (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2.5 text-sm text-blue-300">
              Analysis is running in the background — it&apos;ll appear below when it&apos;s done. You can safely close this page and come back; no need to keep it open.
            </div>
          )}

          {infoMessage && !hasPendingRun && !backgroundRunning && (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2.5 text-sm text-blue-300">
              {infoMessage}
            </div>
          )}

          {isInCooldown && !hasPendingRun && !isPending && !errorMessage && !successMessage && (
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 px-3 py-2.5">
              <p className="text-xs text-slate-400">
                Next full scan in <span className="font-semibold text-slate-300">{countdown}</span>. You can still run if you change your strategy, make a trade, or add cash.
              </p>
            </div>
          )}

          {successMessage && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-300">
              {successMessage}
            </div>
          )}

          {secondarySuccess && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-300">
              {secondarySuccess}
            </div>
          )}

          {errorMessage && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
              {errorMessage}
            </div>
          )}
        </div>
      </div>

      {/* Secondary re-analysis — shown once after a successful primary run */}
      {showSecondary && !secondaryUsed && (
        <div className="rounded-xl border border-white/8 bg-white/2 p-4">
          <div className="flex items-center gap-2 mb-2">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-slate-500 shrink-0">
              <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
            </svg>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Not satisfied? Re-run with feedback</p>
          </div>
          <p className="text-xs text-slate-500 mb-3">Tell Grok what you didn't like about the analysis. One additional run allowed.</p>
          <textarea
            value={feedbackNote}
            onChange={(e) => setFeedbackNote(e.target.value)}
            placeholder="e.g. Too conservative — I want more buy candidates. You ignored my $800 cash balance. Don't suggest trimming without telling me where the proceeds go."
            rows={3}
            maxLength={500}
            disabled={isSecondaryPending}
            className="w-full resize-none rounded-xl border border-white/8 bg-white/4 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:border-blue-500/40 focus:outline-none disabled:opacity-50"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-600">{feedbackNote.length}/500</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowSecondary(false)}
                disabled={isSecondaryPending}
                className="rounded-lg border border-white/8 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 transition disabled:opacity-50"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={handleSecondaryRun}
                disabled={isSecondaryPending || !feedbackNote.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition"
                style={isSecondaryPending || !feedbackNote.trim() ? {} : { background: "linear-gradient(135deg,#2563eb,#4f46e5)" }}
              >
                {isSecondaryPending ? (
                  <>
                    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Re-running...
                  </>
                ) : "Re-run Analysis"}
              </button>
            </div>
          </div>
          {secondaryError && (
            <div className="mt-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {secondaryError}
            </div>
          )}
        </div>
      )}

      {/* Current strategy card */}
      {currentStrategy?.name && (
        <div className="rounded-xl border border-white/8 bg-white/2 overflow-hidden">
          <button
            type="button"
            onClick={() => setStrategyExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-white/3 transition"
          >
            <div className="flex items-center gap-2 min-w-0">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-slate-500">
                <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
              </svg>
              <div className="min-w-0">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Active Strategy</span>
                <span className="ml-2 text-sm text-slate-300">{currentStrategy.name}</span>
                {currentStrategy.style && (
                  <span className="ml-1.5 text-xs text-slate-500">· {currentStrategy.style}</span>
                )}
                {currentStrategy.versionNumber != null && (
                  <span className="ml-1.5 text-xs text-slate-600">v{currentStrategy.versionNumber}</span>
                )}
              </div>
            </div>
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`h-4 w-4 shrink-0 text-slate-600 transition-transform ${strategyExpanded ? "rotate-180" : ""}`}
            >
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>

          {strategyExpanded && (
            <div className="border-t border-white/6 px-4 pb-4 pt-3 space-y-3">
              {/* Constraints at a glance */}
              <div className="flex flex-wrap gap-2">
                {currentStrategy.maxPositionPct != null && (
                  <span className="rounded-full border border-white/8 bg-white/4 px-2.5 py-1 text-[11px] text-slate-400">
                    Max position: {currentStrategy.maxPositionPct}%
                  </span>
                )}
                {currentStrategy.cashMinPct != null && (
                  <span className="rounded-full border border-white/8 bg-white/4 px-2.5 py-1 text-[11px] text-slate-400">
                    Cash floor: {currentStrategy.cashMinPct}%
                  </span>
                )}
                {currentStrategy.cashMaxPct != null && (
                  <span className="rounded-full border border-white/8 bg-white/4 px-2.5 py-1 text-[11px] text-slate-400">
                    Cash ceiling: {currentStrategy.cashMaxPct}%
                  </span>
                )}
              </div>

              {/* Prompt text */}
              {currentStrategy.promptText ? (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1.5">Strategy Prompt</p>
                  <p className="text-xs leading-relaxed text-slate-400 whitespace-pre-wrap">
                    {currentStrategy.promptText}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-600 italic">No prompt text defined for this version.</p>
              )}

              {/* Edit link */}
              <a
                href="/strategies"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/4 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/8 hover:text-white transition"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                  <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                </svg>
                Edit Strategy
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
