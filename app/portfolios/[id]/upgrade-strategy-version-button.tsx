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
  const [confirming, setConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/20"
      >
        Upgrade to v{latestVersionNumber}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/8 px-3 py-2">
        <p className="text-xs text-slate-300">
          Upgrade from v{currentVersionNumber} → v{latestVersionNumber}?
        </p>
        <form
          action={(formData) => {
            setErrorMessage("");
            startTransition(async () => {
              try {
                await upgradePortfolioStrategyToLatest(formData);
                setConfirming(false);
              } catch (error) {
                setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
              }
            });
          }}
          className="flex items-center gap-1.5"
        >
          <input type="hidden" name="portfolio_id" value={portfolioId} />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
          >
            {isPending ? "..." : "Confirm"}
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
      {errorMessage && <p className="text-xs text-red-400">{errorMessage}</p>}
    </div>
  );
}
