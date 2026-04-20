"use client";

import { useState, useTransition } from "react";
import { createStrategy } from "./actions";

const STRATEGY_STYLES = [
  "Growth",
  "Value",
  "Blend",
  "Dividend / Income",
  "Quality",
  "Index / Passive",
  "Sector / Thematic",
  "Momentum",
  "Swing",
  "Mean Reversion",
  "Defensive",
  "Balanced",
  "Speculative",
  "Options / Derivatives",
  "Custom",
];

const RISK_LEVELS = ["Conservative", "Moderate", "Aggressive"];

const TURNOVER_PREFERENCES = ["Low", "Moderate", "High"];

const HOLDING_PERIOD_BIASES = [
  "Short-term",
  "Swing",
  "Medium-term",
  "Long-term",
  "Very Long-term",
  "Flexible",
];

export default function NewStrategyForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-500"
      >
        {isOpen ? "Close Form" : "New Strategy"}
      </button>

      {isOpen ? (
        <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-2xl font-semibold">Create Strategy</h2>
          <p className="mt-2 text-slate-400">
            Define the first version of a reusable investing strategy.
          </p>

          <form
            className="mt-6 grid gap-4 md:grid-cols-2"
            action={(formData) => {
              setErrorMessage("");

              startTransition(async () => {
                try {
                  await createStrategy(formData);
                  setIsOpen(false);
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
                Strategy Name
              </label>
              <input
                name="name"
                type="text"
                placeholder="Growth Core"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Style
              </label>
              <select
                name="style"
                defaultValue="Growth"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
              >
                {STRATEGY_STYLES.map((style) => (
                  <option key={style} value={style}>
                    {style}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Risk Level
              </label>
              <select
                name="risk_level"
                defaultValue="Moderate"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
              >
                {RISK_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Turnover Preference
              </label>
              <select
                name="turnover_preference"
                defaultValue="Moderate"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
              >
                {TURNOVER_PREFERENCES.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Max Position %
              </label>
              <input
                name="max_position_pct"
                type="number"
                step="0.01"
                min="0"
                placeholder="15"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Min Position %
              </label>
              <input
                name="min_position_pct"
                type="number"
                step="0.01"
                min="0"
                placeholder="3"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Cash Min %
              </label>
              <input
                name="cash_min_pct"
                type="number"
                step="0.01"
                min="0"
                placeholder="5"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Cash Max %
              </label>
              <input
                name="cash_max_pct"
                type="number"
                step="0.01"
                min="0"
                placeholder="20"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Holding Period Bias
              </label>
              <select
                name="holding_period_bias"
                defaultValue="Long-term"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
              >
                {HOLDING_PERIOD_BIASES.map((bias) => (
                  <option key={bias} value={bias}>
                    {bias}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Description
              </label>
              <textarea
                name="description"
                placeholder="Concentrated growth strategy focused on quality compounders."
                className="min-h-24 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-300">
                AI Prompt / Rules
              </label>
              <textarea
                name="prompt_text"
                placeholder="Prioritize quality growth companies with durable moats, healthy balance sheets, disciplined sizing, and strong long-term compounding potential."
                className="min-h-32 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500"
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
                {isPending ? "Creating..." : "Create Strategy"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}