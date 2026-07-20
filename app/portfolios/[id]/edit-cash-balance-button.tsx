"use client";

import { useState, useTransition } from "react";
import { setDirectCashBalance } from "./actions";

export default function EditCashBalanceButton({
  portfolioId,
  currentCashBalance,
}: {
  portfolioId: string;
  currentCashBalance: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function fmt(n: number) {
    return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function handleOpen() {
    setValue(currentCashBalance.toFixed(2));
    setError("");
    setIsOpen(true);
  }

  function handleCancel() {
    setIsOpen(false);
    setError("");
    setValue("");
  }

  function handleSave() {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      setError("Enter a valid non-negative amount.");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        await setDirectCashBalance(portfolioId, n);
        setIsOpen(false);
        setValue("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update cash balance.");
      }
    });
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        title="Edit cash balance directly — no ledger entry"
        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/8 hover:text-white"
        style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
      >
        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style={{ flexShrink: 0 }}>
          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
        </svg>
        Edit Cash
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/3 p-4" style={{ maxWidth: "400px" }}>
      <div style={{ marginBottom: "12px" }}>
        <p className="text-sm font-semibold text-white">Edit Cash Balance</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Sets the balance directly — no ledger entry. Use this to correct timing or price discrepancies after a trade.
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <span className="text-xs text-slate-500" style={{ whiteSpace: "nowrap" }}>Current: {fmt(currentCashBalance)}</span>
      </div>

      <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <span style={{
            position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)",
            color: "var(--text-secondary)", fontSize: "14px", pointerEvents: "none",
          }}>$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel(); }}
            autoFocus
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
            style={{ paddingLeft: "24px" }}
          />
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--brand-gradient)", whiteSpace: "nowrap" }}
        >
          {isPending ? "Saving…" : "Set Balance"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-xl border border-white/10 bg-white/4 px-3 py-2.5 text-sm text-slate-400 transition hover:text-white"
        >
          Cancel
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
