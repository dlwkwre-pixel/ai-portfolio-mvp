"use client";

import { useState, useTransition } from "react";
import { assignStrategyToPortfolio } from "./assign-strategy-actions";

type Strategy = {
  id: string;
  name: string;
};

type AssignStrategyFormProps = {
  portfolioId: string;
  strategies: Strategy[];
};

export default function AssignStrategyForm({
  portfolioId,
  strategies,
}: AssignStrategyFormProps) {
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
        {isOpen ? "Close Form" : "Assign Strategy"}
      </button>

      {isOpen ? (
        <div className="mt-4 rounded-xl p-4" style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)" }}>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Assign Strategy</h3>
            <p className="mt-1 text-sm" style={{ color: "var(--text-tertiary)" }}>
              Choose one of your saved strategies for this portfolio.
            </p>
          </div>

          <form
            className="mt-4 grid gap-3"
            action={(formData) => {
              setErrorMessage("");

              startTransition(async () => {
                try {
                  await assignStrategyToPortfolio(formData);
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
                Strategy
              </label>
              <select
                name="strategy_id"
                className="bt-input"
                required
              >
                <option value="">Select a strategy</option>
                {strategies.map((strategy) => (
                  <option key={strategy.id} value={strategy.id}>
                    {strategy.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">
                Assignment Notes
              </label>
              <textarea
                name="notes"
                placeholder="This portfolio should follow the Growth Core framework."
                className="bt-input"
                style={{ minHeight: "96px" }}
              />
            </div>

            {errorMessage ? (
              <div className="rounded-xl px-3 py-2.5 text-sm" style={{ border: "1px solid var(--red-border)", background: "var(--red-bg)", color: "var(--red)" }}>
                {errorMessage}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={isPending}
                className="bt-btn bt-btn-primary disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isPending ? "Assigning..." : "Assign Strategy"}
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