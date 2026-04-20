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

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
      >
        {isOpen ? "Close Form" : "Add Snapshot"}
      </button>

      {isOpen ? (
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950 p-6">
          <h3 className="text-xl font-semibold">Add Portfolio Snapshot</h3>
          <p className="mt-2 text-slate-400">
            Record the total value of this portfolio for the chart.
          </p>

          <form
            className="mt-6 grid gap-4 md:grid-cols-2"
            action={(formData) => {
              setErrorMessage("");

              startTransition(async () => {
                try {
                  await createPortfolioSnapshot(formData);
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
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Total Portfolio Value
              </label>
              <input
                name="total_value"
                type="number"
                step="0.01"
                min="0"
                placeholder="15000"
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Snapshot Date / Time
              </label>
              <input
                name="snapshot_date"
                type="datetime-local"
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Notes
              </label>
              <textarea
                name="notes"
                placeholder="End of week snapshot"
                className="min-h-24 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
              />
            </div>

            {errorMessage ? (
              <div className="md:col-span-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {errorMessage}
              </div>
            ) : null}

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isPending ? "Saving..." : "Save Snapshot"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}