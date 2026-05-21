"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePortfolio } from "./actions";

const BENCHMARKS = [
  { value: "SPY", label: "SPY — S&P 500" },
  { value: "QQQ", label: "QQQ — Nasdaq 100" },
  { value: "DIA", label: "DIA — Dow Jones" },
  { value: "IWM", label: "IWM — Russell 2000" },
  { value: "VTI", label: "VTI — Total US Market" },
  { value: "VT", label: "VT — Total World Market" },
  { value: "AGG", label: "AGG — US Bonds" },
  { value: "GLD", label: "GLD — Gold" },
  { value: "BTC-USD", label: "BTC-USD — Bitcoin" },
];

type EditPortfolioFormProps = {
  portfolio: {
    id: string;
    name: string;
    description: string | null;
    benchmark_symbol: string | null;
    status: string | null;
  };
};

const inputClass = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
const selectClass = "w-full rounded-xl border border-white/10 bg-[#040d1a] px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
const labelClass = "mb-1.5 block text-xs font-medium uppercase tracking-widest text-slate-500";

export default function EditPortfolioForm({ portfolio }: EditPortfolioFormProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");

  // Find matching benchmark or default to SPY
  const currentBenchmark = BENCHMARKS.find(
    (b) => b.value === portfolio.benchmark_symbol
  )?.value ?? "SPY";

  function handleSubmit(formData: FormData) {
    setErrorMessage("");
    startTransition(async () => {
      try {
        await updatePortfolio(formData);
        setIsOpen(false);
        router.refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((p) => !p)}
        title={isOpen ? "Cancel" : "Edit Portfolio"}
        className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/8 hover:text-white sm:px-4"
      >
        {isOpen ? (
          <>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="shrink-0"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            <span className="hidden sm:inline">Cancel</span>
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="shrink-0"><path d="M11 2a1.5 1.5 0 012.121 2.121L5.5 11.742l-2.5.5.5-2.5L11 2z" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="hidden sm:inline">Edit Portfolio</span>
          </>
        )}
      </button>

      {isOpen && (
        <div className="mt-4 rounded-xl border border-white/8 bg-white/3 p-5">
          <h3 className="text-sm font-semibold text-white">Edit Portfolio Settings</h3>
          <p className="mt-0.5 text-xs text-slate-500">Update your portfolio name, description, and benchmark.</p>

          <form action={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="portfolio_id" value={portfolio.id} />

            <div>
              <label className={labelClass}>Portfolio Name *</label>
              <input
                name="name"
                type="text"
                defaultValue={portfolio.name}
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className={labelClass}>Benchmark</label>
              <select
                name="benchmark_symbol"
                defaultValue={currentBenchmark}
                className={selectClass}
              >
                {BENCHMARKS.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Status</label>
              <select
                name="status"
                defaultValue={portfolio.status ?? "active"}
                className={selectClass}
              >
                <option value="active">Active</option>
                <option value="watching">Watching</option>
                <option value="paused">Paused</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className={labelClass}>Description</label>
              <textarea
                name="description"
                defaultValue={portfolio.description ?? ""}
                spellCheck={true}
                placeholder="Long-term growth account..."
                className={`${inputClass} min-h-16`}
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
                className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#2563eb,#4f46e5)" }}
              >
                {isPending ? "Saving..." : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-xl border border-white/10 bg-white/4 px-5 py-2.5 text-sm text-slate-400 transition hover:text-white"
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
