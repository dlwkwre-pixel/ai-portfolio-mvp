"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTransaction, deleteTransaction } from "./transaction-actions";

type Transaction = {
  id: string;
  portfolio_id: string;
  transaction_type: string | null;
  ticker: string | null;
  company_name: string | null;
  quantity: number | null;
  price_per_share: number | null;
  gross_amount: number | null;
  fees: number | null;
  notes: string | null;
  traded_at: string;
};

type EditTransactionFormProps = {
  transaction: Transaction;
  onClose: () => void;
};

const inputClass = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
const labelClass = "mb-1 block text-[10px] font-semibold uppercase tracking-widest text-slate-500";

export function EditTransactionForm({ transaction, onClose }: EditTransactionFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");

  const [quantity, setQuantity] = useState(String(transaction.quantity ?? ""));
  const [pricePerShare, setPricePerShare] = useState(String(transaction.price_per_share ?? ""));
  const [fees, setFees] = useState(String(transaction.fees ?? "0"));
  const [notes, setNotes] = useState(transaction.notes ?? "");
  const [tradedAt, setTradedAt] = useState(
    transaction.traded_at
      ? new Date(transaction.traded_at).toISOString().slice(0, 16)
      : ""
  );

  // Auto-calculate gross amount
  const grossAmount =
    quantity && pricePerShare
      ? (Number(quantity) * Number(pricePerShare)).toFixed(2)
      : "";

  function handleSave() {
    setErrorMessage("");
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("transaction_id", transaction.id);
        formData.set("portfolio_id", transaction.portfolio_id);
        formData.set("quantity", quantity);
        formData.set("price_per_share", pricePerShare);
        formData.set("fees", fees || "0");
        formData.set("notes", notes);
        formData.set("traded_at", tradedAt);
        await updateTransaction(formData);
        router.refresh();
        onClose();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to update transaction.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-blue-500/15 bg-blue-500/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-white">
            Edit {transaction.transaction_type?.toUpperCase()} · {transaction.ticker}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Adjust price, quantity, or date to match your actual execution.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={labelClass}>Quantity</label>
          <input
            type="number"
            step="0.0001"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Price Per Share</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={pricePerShare}
            onChange={(e) => setPricePerShare(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Gross Amount (auto)</label>
          <input
            type="text"
            value={grossAmount ? `$${grossAmount}` : "—"}
            readOnly
            className={`${inputClass} opacity-50 cursor-not-allowed`}
          />
        </div>

        <div>
          <label className={labelClass}>Fees</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={fees}
            onChange={(e) => setFees(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={labelClass}>Execution Date & Time</label>
          <input
            type="datetime-local"
            value={tradedAt}
            onChange={(e) => setTradedAt(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={labelClass}>Notes</label>
          <input
            type="text"
            placeholder="Add notes about this trade..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {errorMessage && (
        <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {errorMessage}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: "linear-gradient(135deg,#2563eb,#4f46e5)" }}
        >
          {isPending ? "Saving..." : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-white/10 bg-white/4 px-4 py-2 text-sm text-slate-400 transition hover:text-white"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function DeleteTransactionButton({
  transactionId,
  portfolioId,
  ticker,
}: {
  transactionId: string;
  portfolioId: string;
  ticker: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  function handleDelete() {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("transaction_id", transactionId);
        formData.set("portfolio_id", portfolioId);
        await deleteTransaction(formData);
        router.refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to delete.");
        setShowConfirm(false);
      }
    });
  }

  if (showConfirm) {
    return (
      <div className="flex items-center gap-2 mt-2">
        <span className="text-xs text-slate-500">Delete this transaction?</span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-60"
        >
          {isPending ? "Deleting..." : "Confirm"}
        </button>
        <button
          type="button"
          onClick={() => setShowConfirm(false)}
          className="rounded-lg border border-white/10 bg-white/4 px-2.5 py-1 text-xs text-slate-400 transition hover:text-white"
        >
          Cancel
        </button>
        {errorMessage && <span className="text-xs text-red-400">{errorMessage}</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setShowConfirm(true)}
      className="text-xs text-red-400/40 transition hover:text-red-400"
    >
      Delete
    </button>
  );
}
