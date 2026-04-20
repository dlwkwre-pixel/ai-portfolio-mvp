"use client";

import { useState, useTransition } from "react";
import { archivePortfolio, restorePortfolio } from "./actions";

type PortfolioStatusButtonProps = {
  portfolioId: string;
  portfolioName: string;
  mode: "archive" | "restore";
};

export default function PortfolioStatusButton({
  portfolioId,
  portfolioName,
  mode,
}: PortfolioStatusButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");

  const isArchive = mode === "archive";

  return (
    <div className="mt-4">
      <form
        action={(formData) => {
          const confirmed = window.confirm(
            isArchive
              ? `Archive "${portfolioName}"? It will move to your archived portfolios section.`
              : `Restore "${portfolioName}" to your active portfolios?`
          );

          if (!confirmed) {
            return;
          }

          setErrorMessage("");

          startTransition(async () => {
            try {
              if (isArchive) {
                await archivePortfolio(formData);
              } else {
                await restorePortfolio(formData);
              }
            } catch (error) {
              setErrorMessage(
                error instanceof Error ? error.message : "Something went wrong."
              );
            }
          });
        }}
      >
        <input type="hidden" name="portfolio_id" value={portfolioId} />

        <button
          type="submit"
          disabled={isPending}
          className={
            isArchive
              ? "rounded-2xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-sm font-semibold text-yellow-300 transition hover:bg-yellow-500/20 disabled:cursor-not-allowed disabled:opacity-70"
              : "rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-70"
          }
        >
          {isPending
            ? isArchive
              ? "Archiving..."
              : "Restoring..."
            : isArchive
            ? "Archive"
            : "Restore"}
        </button>
      </form>

      {errorMessage ? (
        <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}