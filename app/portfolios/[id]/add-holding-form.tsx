"use client";

import { useState, useTransition } from "react";
import { createHolding } from "./actions";

type AddHoldingFormProps = {
  portfolioId: string;
};

export default function AddHoldingForm({
  portfolioId,
}: AddHoldingFormProps) {
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
        {isOpen ? "Close Form" : "Add Holding"}
      </button>

      {isOpen ? (
        <div className="mt-4 w-full rounded-xl border border-slate-800 bg-slate-950 p-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Add Holding</h3>
            <p className="mt-1 text-sm text-slate-400">
              Add a position to this portfolio.
            </p>
          </div>

          <form
            className="mt-4 grid gap-3 md:grid-cols-2"
            action={(formData) => {
              setErrorMessage("");

              startTransition(async () => {
                try {
                  await createHolding(formData);
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
                Ticker
              </label>
              <input
                name="ticker"
                type="text"
                placeholder="AAPL"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Company Name
              </label>
              <input
                name="company_name"
                type="text"
                placeholder="Apple Inc."
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Shares
              </label>
              <input
                name="shares"
                type="number"
                step="0.000001"
                min="0"
                placeholder="10"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Average Cost Basis
              </label>
              <input
                name="average_cost_basis"
                type="number"
                step="0.000001"
                min="0"
                placeholder="185.50"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Asset Type
              </label>
              <select
                name="asset_type"
                defaultValue="stock"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500"
              >
                <option value="stock">Stock</option>
                <option value="etf">ETF</option>
                <option value="mutual_fund">Mutual Fund</option>
                <option value="crypto">Crypto</option>
                <option value="cash_equivalent">Cash Equivalent</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Opened At
              </label>
              <input
                name="opened_at"
                type="date"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Notes
              </label>
              <textarea
                name="notes"
                placeholder="Starter position, long-term compounder, etc."
                className="min-h-24 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500"
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
                {isPending ? "Adding..." : "Save Holding"}
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