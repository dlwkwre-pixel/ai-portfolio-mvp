"use client";

import { useState, useTransition } from "react";
import { updateStrategy } from "./actions";

const STRATEGY_STYLES = ["Growth","Value","Blend","Dividend / Income","Quality","Index / Passive","Sector / Thematic","Momentum","Swing","Mean Reversion","Defensive","Balanced","Speculative","Options / Derivatives","Custom"];
const RISK_LEVELS = ["Conservative", "Moderate", "Aggressive"];
const TURNOVER_PREFERENCES = ["Low", "Moderate", "High"];
const HOLDING_PERIOD_BIASES = ["Short-term","Swing","Medium-term","Long-term","Very Long-term","Flexible"];

const inputClass = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
const selectClass = "w-full rounded-xl border border-white/10 bg-[#040d1a] px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
const labelClass = "mb-1.5 block text-xs font-medium uppercase tracking-widest text-slate-500";

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

export default function EditStrategyForm({ strategy }: { strategy: StrategyCardData }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");
  const latest = strategy.latest_version;

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/8 hover:text-white"
      >
        {isOpen ? "Cancel" : "Edit Strategy"}
      </button>

      {isOpen && (
        <div className="mt-4 rounded-xl border border-white/8 bg-white/3 p-5">
          <h3 className="text-sm font-semibold text-white">Edit Strategy</h3>
          <p className="mt-0.5 text-xs text-slate-500">Saving creates a new version. Previous versions are preserved.</p>

          <form
            className="mt-4 grid gap-3 md:grid-cols-2"
            action={(formData) => {
              setErrorMessage("");
              startTransition(async () => {
                try {
                  await updateStrategy(formData);
                  setIsOpen(false);
                } catch (error) {
                  setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
                }
              });
            }}
          >
            <input type="hidden" name="strategy_id" value={strategy.id} />

            <div>
              <label className={labelClass}>Strategy Name *</label>
              <input name="name" type="text" defaultValue={strategy.name} className={inputClass} required />
            </div>

            <div>
              <label className={labelClass}>Style</label>
              <select name="style" defaultValue={strategy.style || "Growth"} className={selectClass}>
                {STRATEGY_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className={labelClass}>Risk Level</label>
              <select name="risk_level" defaultValue={strategy.risk_level || "Moderate"} className={selectClass}>
                {RISK_LEVELS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div>
              <label className={labelClass}>Turnover Preference</label>
              <select name="turnover_preference" defaultValue={latest?.turnover_preference || "Moderate"} className={selectClass}>
                {TURNOVER_PREFERENCES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className={labelClass}>Holding Period Bias</label>
              <select name="holding_period_bias" defaultValue={latest?.holding_period_bias || "Long-term"} className={selectClass}>
                {HOLDING_PERIOD_BIASES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div>
              <label className={labelClass}>Max Position %</label>
              <input name="max_position_pct" type="number" step="0.01" min="0" defaultValue={latest?.max_position_pct ?? ""} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Min Position %</label>
              <input name="min_position_pct" type="number" step="0.01" min="0" defaultValue={latest?.min_position_pct ?? ""} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Cash Min %</label>
              <input name="cash_min_pct" type="number" step="0.01" min="0" defaultValue={latest?.cash_min_pct ?? ""} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Cash Max %</label>
              <input name="cash_max_pct" type="number" step="0.01" min="0" defaultValue={latest?.cash_max_pct ?? ""} className={inputClass} />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Description</label>
              <textarea name="description" defaultValue={strategy.description || ""} className={`${inputClass} min-h-20`} />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>AI Prompt / Rules</label>
              <p className="mb-2 text-xs text-slate-600">This guides the AI when analyzing portfolios using this strategy.</p>
              <textarea name="prompt_text" defaultValue={latest?.prompt_text || ""} className={`${inputClass} min-h-32`} />
            </div>

            {errorMessage && (
              <div className="md:col-span-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
                {errorMessage}
              </div>
            )}

            <div className="md:col-span-2 flex gap-2">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#2563eb,#4f46e5)" }}
              >
                {isPending ? "Saving..." : "Save New Version"}
              </button>
              <button type="button" onClick={() => setIsOpen(false)} className="rounded-xl border border-white/10 bg-white/4 px-5 py-2.5 text-sm text-slate-400 transition hover:text-white">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
