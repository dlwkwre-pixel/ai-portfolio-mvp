"use client";

import { useState, useTransition } from "react";
import { resetPerformanceHistory } from "./actions";

export default function ResetPerformanceButton({ portfolioId }: { portfolioId: string }) {
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  function handleConfirm() {
    setError("");
    startTransition(async () => {
      try {
        await resetPerformanceHistory(portfolioId);
        setDone(true);
        setShowConfirm(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Reset failed.");
      }
    });
  }

  if (done) {
    return (
      <span className="text-[11px] text-emerald-400">
        Chart reset — tracking from today.
      </span>
    );
  }

  if (showConfirm) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-slate-400">Delete all snapshots and restart from today?</span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isPending}
          className="text-[11px] font-semibold text-red-400 hover:text-red-300 disabled:opacity-50 transition"
        >
          {isPending ? "Resetting…" : "Yes, reset"}
        </button>
        <button
          type="button"
          onClick={() => setShowConfirm(false)}
          disabled={isPending}
          className="text-[11px] text-slate-500 hover:text-slate-400 transition"
        >
          Cancel
        </button>
        {error && <span className="text-[11px] text-red-400">{error}</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setShowConfirm(true)}
      className="text-[11px] text-slate-500 hover:text-slate-400 underline underline-offset-2 transition"
    >
      Reset performance chart
    </button>
  );
}
