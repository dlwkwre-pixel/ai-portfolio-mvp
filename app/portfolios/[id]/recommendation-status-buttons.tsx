"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateRecommendationStatus, deleteRecommendationItem } from "./recommendation-actions";

type RecommendationStatusButtonsProps = {
  portfolioId: string;
  recommendationItemId: string;
  currentStatus: string | null;
  actionType?: string | null;
  ticker?: string | null;
  shareQuantity?: number | null;
  sizingDollars?: number | null;
};

const STATUSES = [
  {
    value: "executed",
    label: "Executed",
    description: "Made the trade — creates a transaction",
    activeStyle: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
    hoverStyle: "border-emerald-500/20 bg-emerald-500/8 text-emerald-400 hover:bg-emerald-500/15",
  },
  {
    value: "watchlist",
    label: "Watchlist",
    description: "Monitoring, not acting yet",
    activeStyle: "border-amber-500/40 bg-amber-500/15 text-amber-300",
    hoverStyle: "border-white/10 bg-white/4 text-slate-400 hover:bg-white/8 hover:text-white",
  },
  {
    value: "rejected",
    label: "Reject",
    description: "Disagree — won't act on this",
    activeStyle: "border-red-500/40 bg-red-500/15 text-red-300",
    hoverStyle: "border-white/10 bg-white/4 text-slate-400 hover:bg-white/8 hover:text-white",
  },
];

export default function RecommendationStatusButtons({
  portfolioId,
  recommendationItemId,
  currentStatus,
  actionType,
  ticker,
  shareQuantity,
  sizingDollars,
}: RecommendationStatusButtonsProps) {
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const router = useRouter();

  const action = (actionType || "").toLowerCase();
  const isTrade = ["buy", "add", "sell", "trim"].includes(action) && !!ticker;

  // Execution-confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [qtyInput, setQtyInput] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [priceLoading, setPriceLoading] = useState(false);

  function openConfirm() {
    setErrorMessage("");
    // Default shares from the recommendation; price fetched live (the real fill, not the target)
    setQtyInput(shareQuantity != null ? String(shareQuantity) : "");
    setPriceInput("");
    setConfirmOpen(true);
    setPriceLoading(true);
    fetch(`/api/market/quote/${encodeURIComponent(ticker!)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.price > 0) setPriceInput(String(Number(d.price).toFixed(2)));
        else if (shareQuantity && sizingDollars) setPriceInput(String((sizingDollars / shareQuantity).toFixed(2)));
      })
      .catch(() => {})
      .finally(() => setPriceLoading(false));
  }

  function submitExecuted(price?: string, qty?: string) {
    setErrorMessage("");
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("portfolio_id", portfolioId);
        formData.append("recommendation_item_id", recommendationItemId);
        formData.append("new_status", "executed");
        if (price && Number(price) > 0) formData.append("executed_price", price);
        if (qty && Number(qty) > 0) formData.append("executed_quantity", qty);
        await updateRecommendationStatus(formData);
        setConfirmOpen(false);
        router.refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
      }
    });
  }

  function handleStatusChange(statusValue: string) {
    setErrorMessage("");
    // For real trades, confirm shares + fill price first so cost basis is accurate
    if (statusValue === "executed" && isTrade) {
      openConfirm();
      return;
    }
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("portfolio_id", portfolioId);
        formData.append("recommendation_item_id", recommendationItemId);
        formData.append("new_status", statusValue);
        await updateRecommendationStatus(formData);
        router.refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
      }
    });
  }

  function handleDelete() {
    setErrorMessage("");
    startDeleteTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("portfolio_id", portfolioId);
        formData.append("recommendation_item_id", recommendationItemId);
        await deleteRecommendationItem(formData);
        router.refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to delete.");
        setShowDeleteConfirm(false);
      }
    });
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        {STATUSES.map((status) => {
          const isActive = currentStatus === status.value;
          return (
            <button
              key={status.value}
              type="button"
              disabled={isPending || isDeleting || isActive}
              onClick={() => handleStatusChange(status.value)}
              title={status.description}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
                isActive ? `cursor-default ${status.activeStyle}` : status.hoverStyle
              }`}
            >
              {isPending && isActive ? "Saving..." : status.label}
            </button>
          );
        })}

        {/* Delete button */}
        <div className="ml-auto">
          {showDeleteConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Delete this recommendation?</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-60"
              >
                {isDeleting ? "Deleting..." : "Confirm"}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-xl border border-white/10 bg-white/4 px-3 py-1.5 text-xs text-slate-400 transition hover:text-white"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isPending || isDeleting}
              className="rounded-xl border border-white/8 bg-white/3 p-1.5 text-slate-600 transition hover:border-red-500/30 hover:text-red-400 disabled:opacity-60"
              title="Delete recommendation"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="mt-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {errorMessage}
        </div>
      )}

      {/* Confirm execution — shares + actual fill price set the cost basis */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
          style={{ background: "rgba(2,6,16,0.72)", backdropFilter: "blur(4px)" }}
          onClick={() => !isPending && setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 p-5"
            style={{ background: "var(--bg-card, #0a1424)", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 text-sm font-semibold text-white">
              Confirm {action === "sell" || action === "trim" ? "sale" : "purchase"} — {ticker}
            </div>
            <p className="mb-4 text-xs text-slate-400">
              These set your cost basis and the transaction. Adjust to your actual fill so your returns aren&apos;t distorted.
            </p>

            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Shares</label>
            <input
              type="number" min="0" step="any" value={qtyInput}
              onChange={(e) => setQtyInput(e.target.value)}
              className="mb-3 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
              placeholder="Number of shares"
            />

            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Price per share {priceLoading && <span className="text-slate-600">· fetching current…</span>}
            </label>
            <input
              type="number" min="0" step="any" value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
              placeholder="Actual fill price"
            />
            {qtyInput && priceInput && Number(qtyInput) > 0 && Number(priceInput) > 0 && (
              <p className="mt-2 text-xs text-slate-400">
                Total: <span className="font-mono text-white">${(Number(qtyInput) * Number(priceInput)).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={isPending}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:text-white disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => submitExecuted(priceInput, qtyInput)}
                disabled={isPending || !(Number(qtyInput) > 0) || !(Number(priceInput) > 0)}
                className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Confirm & record"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
