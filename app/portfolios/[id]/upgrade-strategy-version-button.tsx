"use client";

import { useState, useTransition } from "react";
import { upgradePortfolioStrategyToLatest } from "./assign-strategy-actions";

type UpgradeStrategyVersionButtonProps = {
  portfolioId: string;
  currentVersionNumber: number;
  latestVersionNumber: number;
};

export default function UpgradeStrategyVersionButton({
  portfolioId,
  currentVersionNumber,
  latestVersionNumber,
}: UpgradeStrategyVersionButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");

  return (
    <div className="mt-4">
      <form
        action={(formData) => {
          const confirmed = window.confirm(
            `Upgrade this portfolio from strategy version v${currentVersionNumber} to v${latestVersionNumber}? The old assignment will remain in history.`
          );

          if (!confirmed) {
            return;
          }

          setErrorMessage("");

          startTransition(async () => {
            try {
              await upgradePortfolioStrategyToLatest(formData);
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
          className="rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-2.5 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending
            ? "Upgrading..."
            : `Upgrade to Latest Version (v${latestVersionNumber})`}
        </button>
      </form>

      {errorMessage ? (
        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}