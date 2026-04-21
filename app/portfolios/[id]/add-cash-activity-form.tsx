"use client";

import { useState, useTransition } from "react";
import { createCashActivity } from "./actions";

type AddCashActivityFormProps = {
  portfolioId: string;
  currentCashBalance?: number;
};

const CASH_OUT_REASONS = ["withdrawal", "fee", "adjustment_out"];

export default function AddCashActivityForm({
  portfolioId,
  currentCashBalance,
}: AddCashActivityFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");
  const [reason, setReason] = useState("deposit");
  const [amount, setAmount] = useState("");

  const isOut = CASH_OUT_REASONS.includes(reason);
  const amountNum = Number(amount) || 0;
  const projectedBalance =
    currentCashBalance !== undefined
      ? isOut
        ? currentCashBalance - amountNum
        : currentCashBalance + amountNum
      : null;
  const wouldGoNegative = projectedBalance !== null && projectedBalance < 0;

  function formatMoney(value: number) {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function toggleOpen() {
    setErrorMessage("");
    setIsOpen((prev) => !prev);
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggleOpen}
        className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/8 hover:text-white"
      >
        {isOpen ? "Cancel" : "+ Add Cash Activity"}
      </button>

      {isOpen && (
        <div className="mt-4 rounded-xl border border-white/8 bg-white/3 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Add Cash Activity</h3>
              <p className="mt-0.5 text-xs text-slate-500">Record deposits, withdrawals, dividends, fees, or adjustments.</p>
            </div>
            {currentCashBalance !== undefined && (
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-slate-600">Current Cash</p>
                <p className="text-sm font-semibold text-white">{formatMoney(currentCashBalance)}</p>
              </div>
            )}
          </div>

          <form
            className="mt-4 grid gap-3 sm:grid-cols-2"
            action={(formData) => {
              setErrorMessage("");
              startTransition(async () => {
                try {
                  await createCashActivity(formData);
                  setIsOpen(false);
                  setAmount("");
                  setReason("deposit");
                } catch (error) {
                  setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
                }
              });
            }}
          >
            <input type="hidden" name="portfolio_id" value={portfolioId} />

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-slate-500">
                Activity Type
              </label>
              <select
                name="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#040d1a] px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="deposit">Deposit</option>
                <option value="withdrawal">Withdrawal</option>
                <option value="dividend">Dividend</option>
                <option value="fee">Fee</option>
                <option value="adjustment_in">Adjustment In</option>
                <option value="adjustment_out">Adjustment Out</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-slate-500">
                Amount
              </label>
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="500.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-slate-500">
                Effective Date / Time
              </label>
              <input
                name="effective_at"
                type="datetime-local"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {/* Live projected balance */}
            {projectedBalance !== null && amount && (
              <div className={`sm:col-span-2 flex items-center justify-between rounded-xl border px-4 py-3 ${
                wouldGoNegative
                  ? "border-red-500/20 bg-red-500/10"
                  : "border-white/8 bg-white/3"
              }`}>
                <p className="text-xs text-slate-500">Projected cash balance after this activity</p>
                <p className={`text-sm font-semibold ${wouldGoNegative ? "text-red-400" : "text-emerald-400"}`}>
                  {formatMoney(projectedBalance)}
                  {wouldGoNegative && <span className="ml-1.5 text-xs font-normal text-red-400">⚠ Would go negative</span>}
                </p>
              </div>
            )}

            {errorMessage && (
              <div className="sm:col-span-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
                {errorMessage}
              </div>
            )}

            <div className="sm:col-span-2 flex gap-2">
              <button
                type="submit"
                disabled={isPending || wouldGoNegative}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#2563eb,#4f46e5)" }}
              >
                {isPending ? "Saving..." : "Save Cash Activity"}
              </button>
              <button
                type="button"
                onClick={toggleOpen}
                className="rounded-xl border border-white/10 bg-white/4 px-4 py-2.5 text-sm text-slate-400 transition hover:text-white"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
