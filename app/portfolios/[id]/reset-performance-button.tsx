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
  const [mode, setMode] = useState<"idle" | "menu" | "confirmReset" | "confirmReconstruct">("idle");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  const missingDate = holdings.filter((h) => !h.opened_at);

  function handleReset() {
    setError("");
    startTransition(async () => {
      try {
        await resetPerformanceHistory(portfolioId);
        setSuccessMsg("Chart reset — tracking from today.");
        setMode("idle");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Reset failed.");
      }
    });
  }

  function handleAutoImport() {
    setError("");
    startTransition(async () => {
      try {
        const result = await autoImportLots(portfolioId);
        const parts: string[] = [];
        if (result.created > 0) parts.push(`${result.created} lots created`);
        if (result.alreadyHaveLots.length > 0) parts.push(`${result.alreadyHaveLots.length} already had lots`);
        if (result.skipped.length > 0) parts.push(`skipped (no data): ${result.skipped.join(", ")}`);
        if (result.errors.length > 0) parts.push(`errors: ${result.errors.join("; ")}`);
        setSuccessMsg(`Auto-import done — ${parts.join(" · ")}. Run "Rebuild from purchase history" to update the chart.`);
        setMode("idle");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed.");
      }
    });
  }

  function handleReconstruct() {
    setError("");
    startTransition(async () => {
      const result = await reconstructPortfolioChart(portfolioId);
      if (result.success) {
        const parts: string[] = [
          `${result.inserted} snapshots`,
          `${result.cashFlows} cash flows`,
          `tickers: ${result.tickers.join(", ")}`,
        ];
        if (result.missingFromChart.length > 0) {
          parts.push(`missing (no price data): ${result.missingFromChart.join(", ")}`);
        }
        if (result.guessedDates.length > 0) {
          parts.push(`used portfolio start date for: ${result.guessedDates.join(", ")} — add lots for accuracy`);
        }
        setSuccessMsg(`Rebuilt: ${parts.join(" · ")}.`);
        setMode("idle");
      } else {
        setError(result.error);
      }
    });
  }

  if (successMsg) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <span className="text-[11px] text-emerald-400">{successMsg}</span>
        <button
          type="button"
          onClick={() => setSuccessMsg("")}
          className="text-[10px] text-slate-600 hover:text-slate-400 transition text-left"
        >
          Dismiss
        </button>
      </div>
    );
  }

  if (mode === "confirmReset") {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-slate-400">Delete all snapshots and restart from today?</span>
        <button type="button" onClick={handleReset} disabled={isPending}
          className="text-[11px] font-semibold text-red-400 hover:text-red-300 disabled:opacity-50 transition">
          {isPending ? "Resetting…" : "Yes, reset"}
        </button>
        <button type="button" onClick={() => setMode("idle")} disabled={isPending}
          className="text-[11px] text-slate-500 hover:text-slate-400 transition">
          Cancel
        </button>
        {error && <span className="text-[11px] text-red-400">{error}</span>}
      </div>
    );
  }

  if (mode === "confirmReconstruct") {
    return (
      <div style={{ maxWidth: "380px" }} className="flex flex-col gap-2 text-[11px]">
        <p className="text-slate-300 font-medium">Rebuild chart from purchase history</p>

        <div>
          <p className="text-slate-400 mb-0.5">Holdings to reconstruct:</p>
          <p className="text-emerald-400 font-mono">{holdings.map((h) => h.ticker).join(", ")}</p>
        </div>

        {missingDate.length > 0 && (
          <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20">
            <p className="text-amber-300 font-medium mb-0.5">No purchase date: {missingDate.map((h) => h.ticker).join(", ")}</p>
            <p className="text-slate-400">These will use your portfolio start date as a placeholder. For accuracy, add lots via Purchase History or click "Auto-import lots" first.</p>
          </div>
        )}

        <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20">
          <p className="text-blue-300">Also clears all cash activity and resets cash to $0 — since those deposits were added to fix display errors, not real deposits.</p>
        </div>

        <div className="flex gap-2 mt-1 flex-wrap">
          <button type="button" onClick={handleReconstruct} disabled={isPending}
            className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 disabled:opacity-50 transition">
            {isPending ? "Reconstructing…" : "Confirm rebuild"}
          </button>
          {missingDate.length > 0 && (
            <button type="button" onClick={handleAutoImport} disabled={isPending}
              className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 disabled:opacity-50 transition">
              {isPending ? "Importing…" : "Auto-import lots first"}
            </button>
          )}
          <button type="button" onClick={() => setMode("idle")} disabled={isPending}
            className="text-[11px] text-slate-500 hover:text-slate-400 transition">
            Cancel
          </button>
        </div>
        {error && <p className="text-red-400">{error}</p>}
      </div>
    );
  }

  if (mode === "menu") {
    return (
      <div className="flex flex-col gap-1 text-[11px]">
        <button type="button" onClick={() => setMode("confirmReconstruct")}
          className="text-left text-slate-400 hover:text-slate-200 transition">
          Rebuild from purchase history
        </button>
        <button type="button" onClick={handleAutoImport} disabled={isPending}
          className="text-left text-slate-400 hover:text-slate-200 disabled:opacity-50 transition">
          {isPending ? "Importing…" : "Auto-import lots from trade data"}
        </button>
        <button type="button" onClick={() => setMode("confirmReset")}
          className="text-left text-slate-500 hover:text-slate-400 transition">
          Reset from today
        </button>
        <button type="button" onClick={() => setMode("idle")}
          className="text-left text-slate-600 hover:text-slate-500 transition">
          Cancel
        </button>
        {error && <span className="text-[10px] text-red-400">{error}</span>}
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setMode("menu")}
      className="text-[11px] text-slate-500 hover:text-slate-400 underline underline-offset-2 transition">
      Fix chart data
    </button>
  );
}
