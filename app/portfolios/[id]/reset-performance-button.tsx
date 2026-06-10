"use client";

import { useState, useTransition } from "react";
import { resetPerformanceHistory, reconstructPortfolioChart, autoImportLots } from "./actions";

type Holding = { ticker: string; opened_at: string | null };

export default function ResetPerformanceButton({
  portfolioId,
  holdings = [],
}: {
  portfolioId: string;
  holdings?: Holding[];
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<"rebuild" | "reset" | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRebuild() {
    setStatus(null);
    startTransition(async () => {
      try {
        // Auto-import lots first for any holdings that are missing them
        await autoImportLots(portfolioId);
        const result = await reconstructPortfolioChart(portfolioId);
        if (result.success) {
          const parts: string[] = [`${result.inserted} data points rebuilt`];
          if (result.missingFromChart.length > 0) {
            parts.push(`no price data for: ${result.missingFromChart.join(", ")}`);
          }
          setStatus({ ok: true, msg: parts.join(" · ") });
        } else {
          setStatus({ ok: false, msg: result.error });
        }
      } catch (e) {
        setStatus({ ok: false, msg: e instanceof Error ? e.message : "Rebuild failed." });
      }
      setOpen(false);
      setConfirm(null);
    });
  }

  function handleReset() {
    setStatus(null);
    startTransition(async () => {
      try {
        await resetPerformanceHistory(portfolioId);
        setStatus({ ok: true, msg: "Chart reset. BuyTune will start tracking your portfolio value going forward." });
      } catch (e) {
        setStatus({ ok: false, msg: e instanceof Error ? e.message : "Reset failed." });
      }
      setOpen(false);
      setConfirm(null);
    });
  }

  if (status) {
    return (
      <div className="flex flex-col gap-1">
        <span className={`text-[11px] ${status.ok ? "text-emerald-400" : "text-red-400"}`}>{status.msg}</span>
        <button type="button" onClick={() => setStatus(null)} className="text-[10px] text-slate-600 hover:text-slate-400 transition text-left">
          Dismiss
        </button>
      </div>
    );
  }

  if (confirm === "rebuild") {
    return (
      <div className="flex flex-col gap-2 text-[11px]" style={{ maxWidth: 360 }}>
        <p className="text-slate-300 font-medium">Rebuild chart history</p>
        <p className="text-slate-500">
          Recalculates your chart using your purchase lots and live price history.
          Replaces all existing chart data.
        </p>
        <div className="flex gap-3">
          <button type="button" onClick={handleRebuild} disabled={isPending}
            className="font-semibold text-emerald-400 hover:text-emerald-300 disabled:opacity-50 transition">
            {isPending ? "Rebuilding…" : "Confirm rebuild"}
          </button>
          <button type="button" onClick={() => setConfirm(null)} disabled={isPending}
            className="text-slate-500 hover:text-slate-400 transition">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (confirm === "reset") {
    return (
      <div className="flex flex-col gap-2 text-[11px]" style={{ maxWidth: 360 }}>
        <p className="text-slate-300 font-medium">Start tracking from today</p>
        <p className="text-slate-500">
          Clears all historical chart data and starts fresh with today's portfolio value.
          Use this only if your chart history is completely wrong and you want a clean slate.
        </p>
        <div className="flex gap-3">
          <button type="button" onClick={handleReset} disabled={isPending}
            className="font-semibold text-red-400 hover:text-red-300 disabled:opacity-50 transition">
            {isPending ? "Clearing…" : "Yes, clear history"}
          </button>
          <button type="button" onClick={() => setConfirm(null)} disabled={isPending}
            className="text-slate-500 hover:text-slate-400 transition">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (open) {
    return (
      <div className="flex flex-col gap-1 text-[11px]" style={{ maxWidth: 300 }}>
        <p className="text-slate-400 font-medium mb-0.5">Chart data options</p>

        <button type="button" onClick={() => setConfirm("rebuild")}
          className="text-left text-slate-400 hover:text-white transition">
          Rebuild history from purchase lots
        </button>
        <p className="text-[10px] text-slate-600 mb-1">
          Re-generates the chart from your purchase dates and prices. Run this after adding or editing lots.
        </p>

        <button type="button" onClick={() => setConfirm("reset")}
          className="text-left text-slate-500 hover:text-slate-300 transition">
          Start fresh from today
        </button>
        <p className="text-[10px] text-slate-600 mb-1">
          Wipes chart history and begins tracking from now. Only use this as a last resort.
        </p>

        <button type="button" onClick={() => setOpen(false)}
          className="text-left text-slate-600 hover:text-slate-500 transition mt-0.5">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setOpen(true)}
      className="text-[11px] text-slate-500 hover:text-slate-400 underline underline-offset-2 transition">
      Fix chart data
    </button>
  );
}
