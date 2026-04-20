"use client";

import { useState, useTransition } from "react";
import { archivePortfolio } from "./actions";

type ArchivePortfolioButtonProps = {
  portfolioId: string;
  portfolioName: string;
};

export default function ArchivePortfolioButton({
  portfolioId,
  portfolioName,
}: ArchivePortfolioButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");

  return (
    <div className="mt-4">
      <form
        action={(formData) => {
          const confirmed = window.confirm(
            `Archive "${portfolioName}"? You can add an unarchive feature later, but for now it will disappear from your active portfolio list.`
          );

          if (!confirmed) {
            return;
          }

          setErrorMessage("");

          startTransition(async () => {
            try {
              await archivePortfolio(formData);
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
          className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-sm font-semibold text-yellow-300 transition hover:bg-yellow-500/20 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending ? "Archiving..." : "Archive"}
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