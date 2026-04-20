"use client";

import { useState, useTransition } from "react";
import { createPortfolio } from "./actions";

export default function NewPortfolioForm() {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-500"
      >
        {open ? "Close Form" : "New Portfolio"}
      </button>

      {open ? (
        <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-2xl font-semibold">Create Portfolio</h2>
          <p className="mt-2 text-slate-400">
            Add your first real account to BuyTune.io
          </p>

          <form
            className="mt-6 grid gap-4"
            action={(formData) => {
              setErrorMessage("");

              startTransition(async () => {
                try {
                  await createPortfolio(formData);
                  setOpen(false);
                } catch (error) {
                  setErrorMessage(
                    error instanceof Error ? error.message : "Something went wrong."
                  );
                }
              });
            }}
          >
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Portfolio Name
              </label>
              <input
                name="name"
                type="text"
                placeholder="Main Account"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Account Type
              </label>
              <select
                name="account_type"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                required
              >
                <option value="">Select account type</option>
                <option value="brokerage">Brokerage</option>
                <option value="roth_ira">Roth IRA</option>
                <option value="traditional_ira">Traditional IRA</option>
                <option value="margin">Margin</option>
                <option value="paper trade">Paper Trading</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Starting Cash Balance
              </label>
              <input
                name="cash_balance"
                type="number"
                step="0.01"
                min="0"
                placeholder="10000"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Benchmark Symbol
              </label>
              <input
                name="benchmark_symbol"
                type="text"
                placeholder="SPY"
                defaultValue="SPY"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Description
              </label>
              <textarea
                name="description"
                placeholder="Long-term growth account"
                className="min-h-28 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
              />
            </div>

            {errorMessage ? (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {errorMessage}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isPending}
              className="rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isPending ? "Creating..." : "Create Portfolio"}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}