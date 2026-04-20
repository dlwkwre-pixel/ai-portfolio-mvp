"use client";

import { useState, useTransition } from "react";
import { createCashActivity } from "./actions";

type AddCashActivityFormProps = {
  portfolioId: string;
};

export default function AddCashActivityForm({
  portfolioId,
}: AddCashActivityFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");

  function toggleOpen() {
    setErrorMessage("");
    setIsOpen((prev) => !prev);
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggleOpen}
        className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
      >
        {isOpen ? "Close Form" : "Add Cash Activity"}
      </button>

      {isOpen ? (
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Add Cash Activity</h3>
            <p className="mt-1 text-sm text-slate-400">
              Record deposits, withdrawals, dividends, fees, or adjustments.
            </p>
          </div>

          <form
            className="mt-4 grid gap-3 md:grid-cols-2"
            action={(formData) => {
              setErrorMessage("");

              startTransition(async () => {
                try {
                  await createCashActivity(formData);
                  setIsOpen(false);
                } catch (error) {
                  setErrorMessage(
                    error instanceof Error ? error.message : "Something went wrong."
                  );
                }
              });
            }}
          >
            <input type="hidden" name="portfolio_id" value={portfolioId} />

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Activity Type
              </label>
              <select
                name="reason"
                defaultValue="deposit"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500"
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
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Amount
              </label>
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="500.00"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Effective Date / Time
              </label>
              <input
                name="effective_at"
                type="datetime-local"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500"
              />
            </div>

            {errorMessage ? (
              <div className="md:col-span-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
                {errorMessage}
              </div>
            ) : null}

            <div className="md:col-span-2 flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isPending ? "Saving..." : "Save Cash Activity"}
              </button>

              <button
                type="button"
                onClick={toggleOpen}
                className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}