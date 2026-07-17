"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { createHolding, updateHolding, deleteHolding, updateManualNav } from "./actions";

type AddHoldingFormProps = {
  portfolioId: string;
};

const inputClass = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
const selectClass = "w-full rounded-xl border border-white/10 bg-(--bg-base) px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
const labelClass = "mb-1.5 block text-xs font-medium uppercase tracking-widest text-slate-500";

export default function AddHoldingForm({ portfolioId }: AddHoldingFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");
  const [assetType, setAssetType] = useState("stock");

  function toggleOpen() {
    setErrorMessage("");
    setIsOpen((prev) => !prev);
  }

  const modal = isOpen ? (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "16px", overflowY: "auto" }}
      onClick={(e) => { if (e.target === e.currentTarget) toggleOpen(); }}
    >
      <div
        className="rounded-2xl border border-white/10 bg-slate-900"
        style={{ width: "100%", maxWidth: "560px", margin: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/8 p-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Add Position</h3>
            <p className="mt-0.5 text-xs text-slate-500">Add a new holding to this portfolio.</p>
          </div>
          <button type="button" onClick={toggleOpen} aria-label="Close" className="shrink-0 rounded-lg p-1 text-slate-500 transition hover:text-white">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>
        </div>

          <form
            className="grid gap-3 p-4 sm:grid-cols-2"
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
              <input
                name="ticker"
                type="text"
                placeholder={assetType === "crypto" ? "BTC" : "AAPL"}
                className={inputClass}
                required
                onChange={(e) => {
                  if (assetType === "crypto") {
                    const pos = e.target.selectionStart;
                    e.target.value = e.target.value.toUpperCase();
                    e.target.setSelectionRange(pos, pos);
                  }
                }}
              />
              {assetType === "crypto" && (
                <p className="mt-1 text-xs text-slate-500">
                  Enter the ticker symbol (e.g. BTC, ETH, SOL)
                </p>
              )}
            </div>

            <div>
              <label className={labelClass}>Company Name</label>
              <input name="company_name" type="text" placeholder={assetType === "crypto" ? "Bitcoin" : "Apple Inc."} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Asset Type</label>
              <select
                name="asset_type"
                defaultValue="stock"
                className={selectClass}
                onChange={(e) => setAssetType(e.target.value)}
              >
                <option value="stock">Stock</option>
                <option value="etf">ETF</option>
                <option value="mutual_fund">Mutual Fund</option>
                <option value="crypto">Crypto</option>
                <option value="cash_equivalent">Cash Equivalent</option>
                <option value="manual">Non-tradeable Fund</option>
              </select>
              {assetType === "manual" && (
                <p className="mt-1 text-xs text-slate-500">
                  Advisor / private / interval funds with no public price. You enter and refresh the NAV yourself.
                </p>
              )}
            </div>

            <div>
              <label className={labelClass}>Shares *</label>
              <input aria-label="10" name="shares" type="number" step="0.000001" min="0" placeholder="10" className={inputClass} required />
            </div>

            <div>
              <label className={labelClass}>{assetType === "manual" ? "Purchase NAV *" : "Avg Cost Basis *"}</label>
              <input aria-label="185.50" name="average_cost_basis" type="number" step="0.000001" min="0" placeholder="185.50" className={inputClass} required />
            </div>

            {assetType === "manual" && (
              <div>
                <label className={labelClass}>Current NAV *</label>
                <input aria-label="192.40" name="manual_price" type="number" step="0.000001" min="0" placeholder="192.40" className={inputClass} required />
                <p className="mt-1 text-xs text-slate-500">Latest price per share from your statement.</p>
              </div>
            )}

            <div>
              <label className={labelClass}>Opened At</label>
              <input name="opened_at" type="date" className={inputClass} />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className={labelClass}>Notes</label>
              <textarea aria-label="Starter position, long-term compounder" name="notes" placeholder="Starter position, long-term compounder..." className={`${inputClass} min-h-16`} />
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
      </div>
    ) : null;

  return (
    <>
      <button
        type="button"
        onClick={toggleOpen}
        className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/20"
      >
        + Add Holding
      </button>
      {typeof document !== "undefined" && modal ? createPortal(modal, document.body) : null}
    </>
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
    manual_price?: number | null;
    notes: string | null;
    opened_at: string | null;
  };
  onClose: () => void;
};

export function EditHoldingForm({ holding, onClose }: EditHoldingFormProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");
  const [assetType, setAssetType] = useState(holding.asset_type || "stock");

  const modal = (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "16px", overflowY: "auto" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-2xl border border-white/10 bg-slate-900"
        style={{ width: "100%", maxWidth: "560px", margin: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/8 p-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Edit {holding.ticker}</h3>
            <p className="mt-0.5 text-xs text-slate-500">Update this position&apos;s details.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-lg p-1 text-slate-500 transition hover:text-white">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>
        </div>

        <form
          className="grid gap-3 p-4 sm:grid-cols-2"
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
            <input aria-label="Apple Inc." name="company_name" type="text" defaultValue={holding.company_name || ""} placeholder="Apple Inc." className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Asset Type</label>
            <select name="asset_type" value={assetType} onChange={(e) => setAssetType(e.target.value)} className={selectClass}>
              <option value="stock">Stock</option>
              <option value="etf">ETF</option>
              <option value="mutual_fund">Mutual Fund</option>
              <option value="crypto">Crypto</option>
              <option value="cash_equivalent">Cash Equivalent</option>
              <option value="manual">Non-tradeable Fund</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>Shares</label>
            <input name="shares" type="number" step="0.000001" min="0" defaultValue={holding.shares} className={inputClass} required />
          </div>

          <div>
            <label className={labelClass}>{assetType === "manual" ? "Purchase NAV" : "Avg Cost Basis"}</label>
            <input name="average_cost_basis" type="number" step="0.000001" min="0" defaultValue={holding.average_cost_basis ?? ""} className={inputClass} required />
          </div>

          {assetType === "manual" && (
            <div>
              <label className={labelClass}>Current NAV</label>
              <input aria-label="192.40" name="manual_price" type="number" step="0.000001" min="0" defaultValue={holding.manual_price ?? ""} placeholder="192.40" className={inputClass} required />
            </div>
          )}

          <div>
            <label className={labelClass}>Purchase Date</label>
            <input
              name="opened_at"
              type="date"
              defaultValue={holding.opened_at ? holding.opened_at.slice(0, 10) : ""}
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Notes</label>
            <input aria-label="Optional notes" name="notes" type="text" defaultValue={holding.notes || ""} placeholder="Optional notes" className={inputClass} />
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
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : null;
}

// --- Update NAV (inline quick-edit for non-tradeable funds) ---
type UpdateNavButtonProps = {
  holdingId: string;
  portfolioId: string;
  currentNav: number | null;
};

export function UpdateNavButton({ holdingId, portfolioId, currentNav }: UpdateNavButtonProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setError(""); setOpen(true); }}
        className="text-xs text-amber-400/70 transition hover:text-amber-300"
      >
        Update NAV
      </button>
    );
  }

  return (
    <form
      className="flex items-center gap-1.5"
      action={(formData) => {
        setError("");
        startTransition(async () => {
          try {
            await updateManualNav(formData);
            setOpen(false);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to update.");
          }
        });
      }}
    >
      <input type="hidden" name="holding_id" value={holdingId} />
      <input type="hidden" name="portfolio_id" value={portfolioId} />
      <input
        name="manual_price"
        type="number"
        step="0.000001"
        min="0"
        defaultValue={currentNav ?? ""}
        autoFocus
        placeholder="NAV"
        className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white outline-none transition focus:border-amber-500/60"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-60"
      >
        {isPending ? "..." : "Save"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 transition hover:text-slate-300">
        Cancel
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
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
