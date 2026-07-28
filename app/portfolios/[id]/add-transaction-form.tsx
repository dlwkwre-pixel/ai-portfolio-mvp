"use client";

import { useState, useTransition } from "react";
import { createPortfolioTransaction } from "./transaction-actions";

type AddTransactionFormProps = {
  portfolioId: string;
};

export default function AddTransactionForm({
  portfolioId,
}: AddTransactionFormProps) {
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
        className="bt-btn bt-btn-ghost"
      >
        {isOpen ? "Close Form" : "Add Transaction"}
      </button>

      {isOpen ? (
        <div className="mt-4 rounded-xl p-4" style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)" }}>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Add Portfolio Transaction
            </h3>
            <p className="mt-1 text-sm" style={{ color: "var(--text-tertiary)" }}>
              Record a finance event that affects portfolio cash and trade history.
            </p>
          </div>

          <form
            className="mt-4 grid gap-3 md:grid-cols-2"
            action={(formData) => {
              setErrorMessage("");

              startTransition(async () => {
                try {
                  await createPortfolioTransaction(formData);
                  setIsOpen(false);
                } catch (error) {
                  setErrorMessage(
                    error instanceof Error ? error.message : "Something went wrong."
                  );
                }
              });
            }}
          >
            <input type="hidden" name="portfolio_id" value={portfolioId} />

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Transaction Type
              </label>
              <select
                name="transaction_type"
                defaultValue="buy"
                className="bt-input"
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
                <option value="dividend">Dividend</option>
                <option value="deposit">Deposit</option>
                <option value="withdrawal">Withdrawal</option>
                <option value="fee">Fee</option>
                <option value="interest">Interest</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Ticker
              </label>
              <input
                name="ticker"
                type="text"
                placeholder="AAPL"
                className="bt-input"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Company Name
              </label>
              <input
                name="company_name"
                type="text"
                placeholder="Apple Inc."
                className="bt-input"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Quantity
              </label>
              <input
                name="quantity"
                type="number"
                step="0.000001"
                min="0"
                placeholder="10"
                className="bt-input"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Price Per Share
              </label>
              <input
                name="price_per_share"
                type="number"
                step="0.000001"
                min="0"
                placeholder="185.50"
                className="bt-input"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Gross Amount
              </label>
              <input
                name="gross_amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="1855.00"
                className="bt-input"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Fees
              </label>
              <input
                name="fees"
                type="number"
                step="0.01"
                min="0"
                defaultValue="0"
                className="bt-input"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Trade Date / Time
              </label>
              <input
                name="traded_at"
                type="datetime-local"
                className="bt-input"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Date Acquired <span className="normal-case text-slate-600">(sell only, for tax)</span>
              </label>
              <input
                name="acquired_at"
                type="date"
                className="bt-input"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Notes
              </label>
              <textarea
                name="notes"
                placeholder="Starter position after pullback..."
                className="bt-input" style={{ minHeight: "96px" }}
              />
            </div>

            {errorMessage ? (
              <div className="md:col-span-2 rounded-xl px-3 py-2.5 text-sm" style={{ border: "1px solid var(--red-border)", background: "var(--red-bg)", color: "var(--red)" }}>
                {errorMessage}
              </div>
            ) : null}

            <div className="md:col-span-2 flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={isPending}
                className="bt-btn bt-btn-primary disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isPending ? "Saving..." : "Save Transaction"}
              </button>

              <button
                type="button"
                onClick={toggleOpen}
                className="bt-btn bt-btn-ghost"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}