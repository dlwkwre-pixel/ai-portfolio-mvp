"use client";

import { useState, useTransition } from "react";
import { updateStrategy } from "./actions";

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

type StrategyCardData = {
  id: string;
  name: string;
  description: string | null;
  style: string | null;
  risk_level: string | null;
  latest_version?: {
    version_number: number;
    prompt_text: string | null;
    max_position_pct: number | null;
    min_position_pct: number | null;
    turnover_preference: string | null;
    holding_period_bias: string | null;
    cash_min_pct: number | null;
    cash_max_pct: number | null;
  } | null;
};

type EditStrategyFormProps = {
  strategy: StrategyCardData;
};

export default function EditStrategyForm({ strategy }: EditStrategyFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");

  const latest = strategy.latest_version;

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
      >
        {isOpen ? "Close Edit" : "Edit Strategy"}
      </button>

      {isOpen ? (
        <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-950 p-6">
          <h3 className="text-xl font-semibold">Edit Strategy</h3>
          <p className="mt-2 text-slate-400">
            Saving will create a new strategy version.
          </p>

          <form
            className="mt-6 grid gap-4 md:grid-cols-2"
            action={(formData) => {
              setErrorMessage("");

              startTransition(async () => {
                try {
                  await updateStrategy(formData);
                  setIsOpen(false);
                } catch (error) {
                  setErrorMessage(
                    error instanceof Error ? error.message : "Something went wrong."
                  );
                }
              });
            }}
          >
            <input type="hidden" name="strategy_id" value={strategy.id} />

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Strategy Name
              </label>
              <input
                name="name"
                type="text"
                defaultValue={strategy.name}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Style
              </label>
              <select
                name="style"
                defaultValue={strategy.style || "Growth"}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
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
                defaultValue={strategy.risk_level || "Moderate"}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
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
                defaultValue={latest?.turnover_preference || "Moderate"}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
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
                defaultValue={latest?.max_position_pct ?? ""}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
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
                defaultValue={latest?.min_position_pct ?? ""}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
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
                defaultValue={latest?.cash_min_pct ?? ""}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
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
                defaultValue={latest?.cash_max_pct ?? ""}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Holding Period Bias
              </label>
              <select
                name="holding_period_bias"
                defaultValue={latest?.holding_period_bias || "Long-term"}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
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
                defaultValue={strategy.description || ""}
                className="min-h-24 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-300">
                AI Prompt / Rules
              </label>
              <textarea
                name="prompt_text"
                defaultValue={latest?.prompt_text || ""}
                className="min-h-32 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
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
                {isPending ? "Saving..." : "Save New Version"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}