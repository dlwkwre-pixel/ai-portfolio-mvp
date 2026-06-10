"use client";

import { useState, useTransition } from "react";
import { resetPerformanceHistory } from "./actions";
import ChartSetupModal from "./chart-setup-modal";

export default function ResetPerformanceButton({
  portfolioId,
  holdings = [],
}: {
  portfolioId: string;
  holdings?: { ticker: string; opened_at: string | null }[];
}) {
  const [open, setOpen] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleReset() {
    startTransition(async () => {
      try {
        await resetPerformanceHistory(portfolioId);
        setStatus({ ok: true, msg: "Chart cleared. BuyTune will track your portfolio value going forward." });
      } catch (e) {
        setStatus({ ok: false, msg: e instanceof Error ? e.message : "Reset failed." });
      }
      setOpen(false);
      setConfirmReset(false);
    });
  }

  if (showSetup) {
    return (
      <ChartSetupModal
        portfolioId={portfolioId}
        onClose={() => { setShowSetup(false); setOpen(false); }}
        onDone={(msg) => { setShowSetup(false); setOpen(false); setStatus({ ok: true, msg }); }}
      />
    );
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

  if (confirmReset) {
    return (
      <div className="flex flex-col gap-2 text-[11px]" style={{ maxWidth: 340 }}>
        <p className="text-slate-300 font-medium">Clear all chart history?</p>
        <p className="text-slate-500">Removes all historical data and starts tracking from today. This cannot be undone.</p>
        <div className="flex gap-3">
          <button type="button" onClick={handleReset} disabled={isPending}
            className="font-semibold text-red-400 hover:text-red-300 disabled:opacity-50 transition">
            {isPending ? "Clearing…" : "Yes, clear history"}
          </button>
          <button type="button" onClick={() => setConfirmReset(false)} disabled={isPending}
            className="text-slate-500 hover:text-slate-400 transition">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (open) {
    return (
      <div className="flex flex-col gap-1 text-[11px]" style={{ maxWidth: 280 }}>
        <p className="text-slate-400 font-medium mb-1">Chart data</p>

        <button type="button" onClick={() => setShowSetup(true)}
          className="text-left text-slate-300 hover:text-white transition font-medium">
          Set up purchase history →
        </button>
        <p className="text-[10px] text-slate-600 mb-2">
          Opens a form with all your holdings. Confirm dates and prices, then rebuild the chart in one click.
        </p>

        <button type="button" onClick={() => setConfirmReset(true)}
          className="text-left text-slate-500 hover:text-slate-400 transition">
          Start fresh from today
        </button>
        <p className="text-[10px] text-slate-600 mb-1">
          Wipes chart history and begins tracking now. Use only as a last resort.
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
