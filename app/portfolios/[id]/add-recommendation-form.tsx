"use client";

import { useState, useTransition } from "react";
import { createManualRecommendation } from "./recommendation-actions";

type AddRecommendationFormProps = {
  portfolioId: string;
};

export default function AddRecommendationForm({
  portfolioId,
}: AddRecommendationFormProps) {
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
        {isOpen ? "Close Form" : "Add Recommendation"}
      </button>

      {isOpen ? (
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Add Recommendation</h3>
            <p className="mt-1 text-sm text-slate-400">
              Seed recommendation data now. Later the AI can populate this automatically.
            </p>
          </div>

          <form
            className="mt-4 grid gap-3 md:grid-cols-2"
            action={(formData) => {
              setErrorMessage("");

              startTransition(async () => {
                try {
                  await createManualRecommendation(formData);
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
                Action Type
              </label>
              <select
                name="action_type"
                defaultValue="buy"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500"
              >
                <option value="buy">Buy</option>
                <option value="add">Add</option>
                <option value="trim">Trim</option>
                <option value="sell">Sell</option>
                <option value="hold">Hold</option>
                <option value="rebalance">Rebalance</option>
                <option value="raise_cash">Raise Cash</option>
              </select>
            </div>

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
                Time Horizon
              </label>
              <select
                name="time_horizon"
                defaultValue="medium_term"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500"
              >
                <option value="short_term">Short-term</option>
                <option value="medium_term">Medium-term</option>
                <option value="long_term">Long-term</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Thesis
              </label>
              <textarea
                name="thesis"
                placeholder="High-quality compounder with durable moat and attractive setup."
                className="min-h-24 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Rationale
              </label>
              <textarea
                name="rationale"
                placeholder="Valuation has compressed while quality remains high. Fits current strategy and position sizing limits."
                className="min-h-24 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Risks
              </label>
              <textarea
                name="risks"
                placeholder="Valuation could remain pressured, earnings growth could slow, macro could weaken demand."
                className="min-h-24 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Conviction
              </label>
              <select
                name="conviction"
                defaultValue="Moderate"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500"
              >
                <option value="Low">Low</option>
                <option value="Moderate">Moderate</option>
                <option value="High">High</option>
                <option value="Very High">Very High</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Confidence Score
              </label>
              <input
                name="confidence_score"
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="78"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Priority Rank
              </label>
              <input
                name="priority_rank"
                type="number"
                min="1"
                placeholder="1"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Suggested Size %
              </label>
              <input
                name="sizing_pct"
                type="number"
                step="0.01"
                min="0"
                placeholder="5"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Suggested Dollar Amount
              </label>
              <input
                name="sizing_dollars"
                type="number"
                step="0.01"
                min="0"
                placeholder="500"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Estimated Share Quantity
              </label>
              <input
                name="share_quantity"
                type="number"
                step="0.000001"
                min="0"
                placeholder="2.4"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Target Price 1
              </label>
              <input
                name="target_price_1"
                type="number"
                step="0.0001"
                min="0"
                placeholder="210"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Target Price 2
              </label>
              <input
                name="target_price_2"
                type="number"
                step="0.0001"
                min="0"
                placeholder="230"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Stop Price
              </label>
              <input
                name="stop_price"
                type="number"
                step="0.0001"
                min="0"
                placeholder="175"
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
                {isPending ? "Saving..." : "Save Recommendation"}
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