"use client";

import { useState, useTransition } from "react";
import { createPortfolioSnapshot } from "./actions";

type AddSnapshotFormProps = {
  portfolioId: string;
};

export default function AddSnapshotForm({ portfolioId }: AddSnapshotFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");

  const inputClass = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
  const labelClass = "mb-1.5 block text-xs font-medium uppercase tracking-widest text-slate-500";

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/8 hover:text-white"
      >
        {isOpen ? "Cancel" : "+ Add Snapshot"}
      </button>

      {isOpen && (
        <div className="mt-4 rounded-xl border border-white/8 bg-white/3 p-4">
          <h3 className="text-sm font-semibold text-white">Add Portfolio Snapshot</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Record your total portfolio value today. Used to track performance vs benchmark over time.
          </p>

          <form
            className="mt-4 grid gap-3 sm:grid-cols-2"
            action={(formData) => {
              setErrorMessage("");
              startTransition(async () => {
                try {
                  await createPortfolioSnapshot(formData);
                  setIsOpen(false);
                } catch (error) {
                  setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
                }
              });
            }}
          >
            <input type="hidden" name="portfolio_id" value={portfolioId} />

            <div>
              <label className={labelClass}>Total Portfolio Value *</label>
              <input
                name="total_value"
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 25000"
                className={inputClass}
                required
              />
              <p className="mt-1 text-[10px] text-slate-600">
                Use the Total Value shown at the top of this page.
              </p>
            </div>

            <div>
              <label className={labelClass}>Snapshot Date</label>
              <input
                name="snapshot_date"
                type="datetime-local"
                className={inputClass}
              />
              <p className="mt-1 text-[10px] text-slate-600">Leave blank to use today.</p>
            </div>

            <div className="sm:col-span-2">
              <label className={labelClass}>Notes (optional)</label>
              <input
                name="notes"
                type="text"
                placeholder="End of month, after NFLX trim, etc."
                className={inputClass}
              />
            </div>

            {errorMessage && (
              <div className="sm:col-span-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
                {errorMessage}
              </div>
            )}

            <div className="sm:col-span-2 flex gap-2">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#2563eb,#4f46e5)" }}
              >
                {isPending ? "Saving..." : "Save Snapshot"}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
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
