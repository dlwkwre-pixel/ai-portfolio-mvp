"use client";

import { useState, useTransition } from "react";
import { createHolding, updateHolding, deleteHolding } from "./actions";

type AddHoldingFormProps = {
  portfolioId: string;
};

const inputClass = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
const selectClass = "w-full rounded-xl border border-white/10 bg-[#040d1a] px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
const labelClass = "mb-1.5 block text-xs font-medium uppercase tracking-widest text-slate-500";

export default function AddHoldingForm({ portfolioId }: AddHoldingFormProps) {
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
        className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/20"
      >
        {isOpen ? "Cancel" : "+ Add Holding"}
      </button>

      {isOpen && (
        <div className="mt-4 rounded-xl border border-white/8 bg-white/3 p-4">
          <h3 className="text-sm font-semibold text-white">Add Position</h3>
          <p className="mt-0.5 text-xs text-slate-500">Add a new holding to this portfolio.</p>

          <form
            className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            action={(formData) => {
              setErrorMessage("");
              startTransition(async () => {
                try {
                  await createHolding(formData);
                  setIsOpen(false);
                } catch (error) {
                  setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
                }
              });
            }}
          >
            <input type="hidden" name="portfolio_id" value={portfolioId} />

            <div>
              <label className={labelClass}>Ticker *</label>
              <input name="ticker" type="text" placeholder="AAPL" className={inputClass} required />
            </div>

            <div>
              <label className={labelClass}>Company Name</label>
              <input name="company_name" type="text" placeholder="Apple Inc." className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Asset Type</label>
              <select name="asset_type" defaultValue="stock" className={selectClass}>
                <option value="stock">Stock</option>
                <option value="etf">ETF</option>
                <option value="mutual_fund">Mutual Fund</option>
                <option value="crypto">Crypto</option>
                <option value="cash_equivalent">Cash Equivalent</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>Shares *</label>
              <input name="shares" type="number" step="0.000001" min="0" placeholder="10" className={inputClass} required />
            </div>

            <div>
              <label className={labelClass}>Avg Cost Basis *</label>
              <input name="average_cost_basis" type="number" step="0.000001" min="0" placeholder="185.50" className={inputClass} required />
            </div>

            <div>
              <label className={labelClass}>Opened At</label>
              <input name="opened_at" type="date" className={inputClass} />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className={labelClass}>Notes</label>
              <textarea name="notes" placeholder="Starter position, long-term compounder..." className={`${inputClass} min-h-16`} />
            </div>

            {errorMessage && (
              <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
                {errorMessage}
              </div>
            )}

            <div className="sm:col-span-2 lg:col-span-3 flex gap-2">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#2563eb,#4f46e5)" }}
              >
                {isPending ? "Adding..." : "Save Holding"}
              </button>
              <button type="button" onClick={toggleOpen} className="rounded-xl border border-white/10 bg-white/4 px-4 py-2.5 text-sm text-slate-400 transition hover:text-white">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// --- Inline Edit Form (used in the holdings table) ---
type EditHoldingFormProps = {
  holding: {
    id: string;
    portfolio_id: string;
    ticker: string;
    company_name: string | null;
    asset_type: string | null;
    shares: number;
    average_cost_basis: number | null;
    notes: string | null;
  };
  onClose: () => void;
};

export function EditHoldingForm({ holding, onClose }: EditHoldingFormProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");

  return (
    <form
      className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      action={(formData) => {
        setErrorMessage("");
        startTransition(async () => {
          try {
            await updateHolding(formData);
            onClose();
          } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
          }
        });
      }}
    >
      <input type="hidden" name="holding_id" value={holding.id} />
      <input type="hidden" name="portfolio_id" value={holding.portfolio_id} />

      <div>
        <label className={labelClass}>Company Name</label>
        <input name="company_name" type="text" defaultValue={holding.company_name || ""} placeholder="Apple Inc." className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Asset Type</label>
        <select name="asset_type" defaultValue={holding.asset_type || "stock"} className={selectClass}>
          <option value="stock">Stock</option>
          <option value="etf">ETF</option>
          <option value="mutual_fund">Mutual Fund</option>
          <option value="crypto">Crypto</option>
          <option value="cash_equivalent">Cash Equivalent</option>
        </select>
      </div>

      <div>
        <label className={labelClass}>Shares</label>
        <input name="shares" type="number" step="0.000001" min="0" defaultValue={holding.shares} className={inputClass} required />
      </div>

      <div>
        <label className={labelClass}>Avg Cost Basis</label>
        <input name="average_cost_basis" type="number" step="0.000001" min="0" defaultValue={holding.average_cost_basis ?? ""} className={inputClass} required />
      </div>

      <div className="sm:col-span-2 lg:col-span-2">
        <label className={labelClass}>Notes</label>
        <input name="notes" type="text" defaultValue={holding.notes || ""} placeholder="Optional notes" className={inputClass} />
      </div>

      {errorMessage && (
        <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
          {errorMessage}
        </div>
      )}

      <div className="sm:col-span-2 lg:col-span-3 flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: "linear-gradient(135deg,#2563eb,#4f46e5)" }}
        >
          {isPending ? "Saving..." : "Save Changes"}
        </button>
        <button type="button" onClick={onClose} className="rounded-xl border border-white/10 bg-white/4 px-4 py-2 text-sm text-slate-400 transition hover:text-white">
          Cancel
        </button>
      </div>
    </form>
  );
}

// --- Delete Button (inline confirm, no window.confirm) ---
type DeleteHoldingButtonProps = {
  holdingId: string;
  portfolioId: string;
  ticker: string;
};

export function DeleteHoldingButton({ holdingId, portfolioId, ticker }: DeleteHoldingButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs text-red-400/50 transition hover:text-red-400"
      >
        Remove
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-red-300">Remove {ticker}?</span>
      <form
        action={(formData) => {
          startTransition(async () => {
            await deleteHolding(formData);
          });
        }}
      >
        <input type="hidden" name="holding_id" value={holdingId} />
        <input type="hidden" name="portfolio_id" value={portfolioId} />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-60"
        >
          {isPending ? "..." : "Yes, remove"}
        </button>
      </form>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs text-slate-500 transition hover:text-slate-300"
      >
        Cancel
      </button>
    </div>
  );
}
