"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetPerformanceHistory, trimSnapshotsBefore, removePolygonBackfill } from "./actions";
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
  const [showTrim, setShowTrim] = useState(false);
  const [trimDate, setTrimDate] = useState("");
  const [confirmRemoveBackfill, setConfirmRemoveBackfill] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

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

  function handleTrim() {
    if (!trimDate) return;
    startTransition(async () => {
      try {
        const result = await trimSnapshotsBefore(portfolioId, trimDate);
        setStatus({ ok: true, msg: `Removed ${result.deleted} snapshot${result.deleted !== 1 ? "s" : ""} before ${new Date(trimDate + "T12:00:00").toLocaleDateString()}. Chart now starts from that date.` });
      } catch (e) {
        setStatus({ ok: false, msg: e instanceof Error ? e.message : "Trim failed." });
      }
      setShowTrim(false);
      setOpen(false);
    });
  }

  function handleRemoveBackfill() {
    startTransition(async () => {
      try {
        const result = await removePolygonBackfill(portfolioId);
        setStatus({
          ok: true,
          msg: result.deleted > 0
            ? `Removed ${result.deleted} Polygon backfill snapshot${result.deleted !== 1 ? "s" : ""}. You can re-run Build chart history anytime.`
            : "No Polygon backfill data found — nothing to remove.",
        });
      } catch (e) {
        setStatus({ ok: false, msg: e instanceof Error ? e.message : "Remove failed." });
      }
      setConfirmRemoveBackfill(false);
      setOpen(false);
    });
  }

  async function handleBackfillFromMenu() {
    setBackfilling(true);
    setOpen(false);
    try {
      const res = await fetch(`/api/portfolio/${portfolioId}/backfill`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setStatus({ ok: true, msg: data.inserted > 0 ? `Built ${data.inserted} historical snapshots from Polygon.` : "History already complete — no new snapshots needed." });
        router.refresh();
      } else {
        setStatus({ ok: false, msg: data.error ?? "Backfill failed." });
      }
    } catch {
      setStatus({ ok: false, msg: "Backfill request failed." });
    } finally {
      setBackfilling(false);
    }
  }

  if (backfilling) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83" />
        </svg>
        Fetching history from Polygon… (may take a minute)
      </div>
    );
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

  if (confirmRemoveBackfill) {
    return (
      <div className="flex flex-col gap-2 text-[11px]" style={{ maxWidth: 340 }}>
        <p className="text-slate-300 font-medium">Remove Polygon backfill data?</p>
        <p className="text-slate-500">Deletes all snapshots created by Build chart history. You can re-run backfill at any time to restore this data.</p>
        <div className="flex gap-3">
          <button type="button" onClick={handleRemoveBackfill} disabled={isPending}
            className="font-semibold text-amber-400 hover:text-amber-300 disabled:opacity-50 transition">
            {isPending ? "Removing…" : "Yes, remove backfill"}
          </button>
          <button type="button" onClick={() => setConfirmRemoveBackfill(false)} disabled={isPending}
            className="text-slate-500 hover:text-slate-400 transition">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (showTrim) {
    return (
      <div className="flex flex-col gap-2 text-[11px]" style={{ maxWidth: 320 }}>
        <p className="text-slate-300 font-medium">Remove history before…</p>
        <p className="text-slate-500">
          Deletes all snapshots before this date. Use this when you added a new account mid-way and the early data skews your returns.
        </p>
        <input
          type="date"
          value={trimDate}
          onChange={(e) => setTrimDate(e.target.value)}
          className="rounded-lg px-2 py-1.5 text-xs text-white w-full"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)" }}
        />
        <div className="flex gap-3 mt-1">
          <button
            type="button"
            onClick={handleTrim}
            disabled={isPending || !trimDate}
            className="font-semibold text-amber-400 hover:text-amber-300 disabled:opacity-40 transition"
          >
            {isPending ? "Trimming…" : "Remove those snapshots"}
          </button>
          <button type="button" onClick={() => { setShowTrim(false); }} disabled={isPending}
            className="text-slate-500 hover:text-slate-400 transition">
            Cancel
          </button>
        </div>
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

        <button type="button" onClick={handleBackfillFromMenu}
          className="text-left text-slate-300 hover:text-white transition font-medium">
          Build full chart history →
        </button>
        <p className="text-[10px] text-slate-600 mb-2">
          Fetch historical prices from Polygon.io for all holdings. Fills in missing days going back to your first purchase.
        </p>

        <button type="button" onClick={() => setShowSetup(true)}
          className="text-left text-slate-300 hover:text-white transition font-medium">
          Set up purchase history →
        </button>
        <p className="text-[10px] text-slate-600 mb-2">
          Opens a form with all your holdings. Confirm dates and prices, then rebuild the chart in one click.
        </p>

        <button type="button" onClick={() => setShowTrim(true)}
          className="text-left text-slate-300 hover:text-white transition font-medium">
          Remove history before a date →
        </button>
        <p className="text-[10px] text-slate-600 mb-2">
          Added a new account mid-way and it's skewing your returns? Pick the date to start from.
        </p>

        <button type="button" onClick={() => setConfirmRemoveBackfill(true)}
          className="text-left text-slate-300 hover:text-white transition font-medium">
          Remove backfill history →
        </button>
        <p className="text-[10px] text-slate-600 mb-2">
          Undo the Polygon backfill. Removes those snapshots — you can re-run Build chart history anytime.
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
