"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortfolio } from "./actions";

type InitialHolding = {
  ticker: string;
  company_name: string;
  shares: string;
  average_cost_basis: string;
};

export default function NewPortfolioForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [errorMessage, setErrorMessage] = useState("");

  // Portfolio fields
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState("");
  const [cashBalance, setCashBalance] = useState("");
  const [benchmarkSymbol, setBenchmarkSymbol] = useState("SPY");
  const [description, setDescription] = useState("");

  // Holdings
  const [holdings, setHoldings] = useState<InitialHolding[]>([]);
  const [newHolding, setNewHolding] = useState<InitialHolding>({
    ticker: "",
    company_name: "",
    shares: "",
    average_cost_basis: "",
  });

  function addHolding() {
    if (!newHolding.ticker || !newHolding.shares) return;
    setHoldings((prev) => [...prev, { ...newHolding }]);
    setNewHolding({ ticker: "", company_name: "", shares: "", average_cost_basis: "" });
  }

  function removeHolding(index: number) {
    setHoldings((prev) => prev.filter((_, i) => i !== index));
  }

  function resetForm() {
    setName("");
    setAccountType("");
    setCashBalance("");
    setBenchmarkSymbol("SPY");
    setDescription("");
    setHoldings([]);
    setNewHolding({ ticker: "", company_name: "", shares: "", average_cost_basis: "" });
    setStep(1);
    setErrorMessage("");
  }

  function handleClose() {
    setOpen(false);
    resetForm();
  }

  async function handleSubmit() {
    if (!name || !accountType) {
      setErrorMessage("Portfolio name and account type are required.");
      return;
    }

    setErrorMessage("");

    const formData = new FormData();
    formData.set("name", name);
    formData.set("account_type", accountType);
    formData.set("cash_balance", cashBalance || "0");
    formData.set("benchmark_symbol", benchmarkSymbol || "SPY");
    formData.set("description", description);
    formData.set("initial_holdings", JSON.stringify(holdings));

    startTransition(async () => {
      try {
        const result = await createPortfolio(formData);
        handleClose();
        // If createPortfolio returns the new portfolio id, navigate to it
        if (result && typeof result === "object" && "id" in result) {
          router.push(`/portfolios/${result.id}`);
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
      }
    });
  }

  const inputClass = "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
  const selectClass = "w-full rounded-xl border border-white/10 bg-[#040d1a] px-4 py-2.5 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
  const labelClass = "mb-1.5 block text-xs font-medium uppercase tracking-widest text-slate-400";

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
        style={{ background: "linear-gradient(135deg,#2563eb,#4f46e5)", boxShadow: "0 4px 16px rgba(37,99,235,0.3)" }}
      >
        {open ? "Cancel" : "+ New Portfolio"}
      </button>

      {open && (
        <div className="mt-6 rounded-2xl border border-white/8 bg-white/3 p-6 backdrop-blur-sm">
          {/* Step indicator */}
          <div className="mb-6 flex items-center gap-3">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition ${step === 1 ? "bg-blue-600 text-white" : "bg-emerald-500/20 text-emerald-400"}`}>
              {step > 1 ? "✓" : "1"}
            </div>
            <div className="h-px flex-1 bg-white/10" />
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition ${step === 2 ? "bg-blue-600 text-white" : "bg-white/8 text-slate-500"}`}>
              2
            </div>
            <span className="text-xs text-slate-500">{step === 1 ? "Portfolio details" : "Add holdings (optional)"}</span>
          </div>

          {step === 1 && (
            <>
              <h2 className="text-lg font-semibold text-white">Create Portfolio</h2>
              <p className="mt-1 text-sm text-slate-400">Set up your account details.</p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Portfolio Name</label>
                  <input
                    type="text"
                    placeholder="Main Account"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Account Type</label>
                  <select
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">Select type</option>
                    <option value="brokerage">Brokerage</option>
                    <option value="roth_ira">Roth IRA</option>
                    <option value="traditional_ira">Traditional IRA</option>
                    <option value="margin">Margin</option>
                    <option value="paper trade">Paper Trading</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Uninvested Cash</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="10000"
                    value={cashBalance}
                    onChange={(e) => setCashBalance(e.target.value)}
                    className={inputClass}
                  />
                  <p className="mt-1.5 text-[10px] text-slate-600">
                    Cash sitting uninvested — not your total portfolio value. Add stock positions in the next step.
                  </p>
                </div>

                <div>
                  <label className={labelClass}>Benchmark Symbol</label>
                  <input
                    type="text"
                    placeholder="SPY"
                    value={benchmarkSymbol}
                    onChange={(e) => setBenchmarkSymbol(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className={labelClass}>Description</label>
                  <textarea
                    placeholder="Long-term growth account"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className={`${inputClass} min-h-20`}
                  />
                </div>
              </div>

              {errorMessage && (
                <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {errorMessage}
                </div>
              )}

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => { if (!name || !accountType) { setErrorMessage("Portfolio name and account type are required."); return; } setErrorMessage(""); setStep(2); }}
                  className="rounded-xl px-6 py-2.5 text-sm font-semibold text-white"
                  style={{ background: "linear-gradient(135deg,#2563eb,#4f46e5)", boxShadow: "0 4px 16px rgba(37,99,235,0.3)" }}
                >
                  Next: Add Holdings →
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isPending}
                  className="rounded-xl border border-white/10 bg-white/4 px-6 py-2.5 text-sm font-medium text-slate-300 transition hover:text-white disabled:opacity-60"
                >
                  {isPending ? "Creating..." : "Skip & Create"}
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-xl border border-white/8 bg-white/3 px-4 py-2.5 text-sm text-slate-500 transition hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Add Initial Holdings</h2>
                  <p className="mt-1 text-sm text-slate-400">Optionally add your existing positions to <span className="text-white font-medium">{name}</span>.</p>
                </div>
                <button type="button" onClick={() => setStep(1)} className="text-xs text-slate-500 transition hover:text-white">
                  ← Back
                </button>
              </div>

              {/* Add holding row */}
              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                <div>
                  <label className={labelClass}>Ticker</label>
                  <input
                    type="text"
                    placeholder="AAPL"
                    value={newHolding.ticker}
                    onChange={(e) => setNewHolding((prev) => ({ ...prev, ticker: e.target.value.toUpperCase() }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Company (optional)</label>
                  <input
                    type="text"
                    placeholder="Apple Inc."
                    value={newHolding.company_name}
                    onChange={(e) => setNewHolding((prev) => ({ ...prev, company_name: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Shares</label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    placeholder="10"
                    value={newHolding.shares}
                    onChange={(e) => setNewHolding((prev) => ({ ...prev, shares: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Avg Cost Basis</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="185.00"
                    value={newHolding.average_cost_basis}
                    onChange={(e) => setNewHolding((prev) => ({ ...prev, average_cost_basis: e.target.value }))}
                    className={inputClass}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={addHolding}
                disabled={!newHolding.ticker || !newHolding.shares}
                className="mt-3 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-300 transition hover:bg-blue-500/20 disabled:opacity-40"
              >
                + Add to list
              </button>

              {/* Holdings list */}
              {holdings.length > 0 && (
                <div className="mt-5 rounded-xl border border-white/5 overflow-hidden">
                  <table className="min-w-full divide-y divide-white/5">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-widest text-slate-500">
                        <th className="bg-white/3 px-3 py-2.5">Ticker</th>
                        <th className="bg-white/3 px-3 py-2.5 hidden sm:table-cell">Company</th>
                        <th className="bg-white/3 px-3 py-2.5">Shares</th>
                        <th className="bg-white/3 px-3 py-2.5">Avg Cost</th>
                        <th className="bg-white/3 px-3 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/4">
                      {holdings.map((h, i) => (
                        <tr key={i} className="text-sm">
                          <td className="px-3 py-2.5 font-bold text-white">{h.ticker}</td>
                          <td className="px-3 py-2.5 text-slate-400 hidden sm:table-cell">{h.company_name || "—"}</td>
                          <td className="px-3 py-2.5 text-slate-300">{h.shares}</td>
                          <td className="px-3 py-2.5 text-slate-300">{h.average_cost_basis ? `$${h.average_cost_basis}` : "—"}</td>
                          <td className="px-3 py-2.5">
                            <button
                              type="button"
                              onClick={() => removeHolding(i)}
                              className="text-xs text-red-400/60 transition hover:text-red-400"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {holdings.length === 0 && (
                <div className="mt-4 rounded-xl border border-white/5 bg-white/2 p-4 text-center">
                  <p className="text-xs text-slate-600">No holdings added yet. You can always add them later from the portfolio page.</p>
                </div>
              )}

              {errorMessage && (
                <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {errorMessage}
                </div>
              )}

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isPending}
                  className="rounded-xl px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg,#2563eb,#4f46e5)", boxShadow: "0 4px 16px rgba(37,99,235,0.3)" }}
                >
                  {isPending ? "Creating..." : `Create Portfolio${holdings.length > 0 ? ` with ${holdings.length} holding${holdings.length !== 1 ? "s" : ""}` : ""}`}
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-xl border border-white/8 bg-white/3 px-4 py-2.5 text-sm text-slate-500 transition hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
