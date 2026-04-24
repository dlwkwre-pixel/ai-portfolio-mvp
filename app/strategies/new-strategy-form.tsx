"use client";

import { useState, useTransition } from "react";
import { createStrategy } from "./actions";

const STRATEGY_STYLES = ["Growth","Value","Blend","Dividend / Income","Quality","Index / Passive","Sector / Thematic","Momentum","Swing","Mean Reversion","Defensive","Balanced","Speculative","Options / Derivatives","Custom"];
const RISK_LEVELS = ["Conservative", "Moderate", "Aggressive"];
const TURNOVER_PREFERENCES = ["Low", "Moderate", "High"];
const HOLDING_PERIOD_BIASES = ["Short-term","Swing","Medium-term","Long-term","Very Long-term","Flexible"];

const inputClass = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
const selectClass = "w-full rounded-xl border border-white/10 bg-[#040d1a] px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
const labelClass = "mb-1.5 block text-xs font-medium uppercase tracking-widest text-slate-500";

export default function NewStrategyForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
        style={{ background: "linear-gradient(135deg,#2563eb,#4f46e5)", boxShadow: "0 4px 16px rgba(37,99,235,0.3)" }}
      >
        {isOpen ? "Cancel" : "+ New Strategy"}
      </button>

      {isOpen && (
        <div className="mt-6 rounded-2xl border border-white/8 bg-white/3 p-6">
          <h2 className="text-lg font-semibold text-white">Create Strategy</h2>
          <p className="mt-1 text-sm text-slate-400">Define the first version of a reusable investing framework.</p>

          <form
            className="mt-5 grid gap-4 md:grid-cols-2"
            action={(formData) => {
              setErrorMessage("");
              startTransition(async () => {
                try {
                  await createStrategy(formData);
                  setIsOpen(false);
                } catch (error) {
                  setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
                }
              });
            }}
          >
            <div>
              <label className={labelClass}>Strategy Name *</label>
              <input name="name" type="text" placeholder="Growth Core" className={inputClass} required />
            </div>

            <div>
              <label className={labelClass}>Style</label>
              <select name="style" defaultValue="Growth" className={selectClass}>
                {STRATEGY_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className={labelClass}>Risk Level</label>
              <select name="risk_level" defaultValue="Moderate" className={selectClass}>
                {RISK_LEVELS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div>
              <label className={labelClass}>Turnover Preference</label>
              <select name="turnover_preference" defaultValue="Moderate" className={selectClass}>
                {TURNOVER_PREFERENCES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className={labelClass}>Holding Period Bias</label>
              <select name="holding_period_bias" defaultValue="Long-term" className={selectClass}>
                {HOLDING_PERIOD_BIASES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div>
              <label className={labelClass}>Max Position %</label>
              <input name="max_position_pct" type="number" step="0.01" min="0" placeholder="15" className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Min Position %</label>
              <input name="min_position_pct" type="number" step="0.01" min="0" placeholder="3" className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Cash Min %</label>
              <input name="cash_min_pct" type="number" step="0.01" min="0" placeholder="5" className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Cash Max %</label>
              <input name="cash_max_pct" type="number" step="0.01" min="0" placeholder="20" className={inputClass} />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Description</label>
              <textarea name="description" placeholder="Concentrated growth strategy focused on quality compounders." spellCheck={true} className={`${inputClass} min-h-20`} />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>AI Prompt / Rules</label>
              <p className="mb-2 text-xs text-slate-600">This is sent to the AI when analyzing this portfolio. Be specific about what matters to you.</p>
              <textarea name="prompt_text" placeholder="Prioritize quality growth companies with durable moats, healthy balance sheets, disciplined sizing, and strong long-term compounding potential." spellCheck={true} className={`${inputClass} min-h-32`} />
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
                {isPending ? "Creating..." : "Create Strategy"}
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
