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
  const [confirming, setConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isArchive = mode === "archive";

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={
          isArchive
            ? "rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/20"
            : "rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
        }
      >
        {isArchive ? "Archive" : "Restore"}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${isArchive ? "border-amber-500/20 bg-amber-500/8" : "border-emerald-500/20 bg-emerald-500/8"}`}>
        <p className="text-xs text-slate-300">
          {isArchive
            ? `Archive "${portfolioName}"?`
            : `Restore "${portfolioName}"?`}
        </p>
        <form
          action={(formData) => {
            setErrorMessage("");
            startTransition(async () => {
              try {
                if (isArchive) {
                  await archivePortfolio(formData);
                } else {
                  await restorePortfolio(formData);
                }
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
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60 ${isArchive ? "bg-amber-600" : "bg-emerald-600"}`}
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
      {errorMessage && (
        <p className="text-xs text-red-400">{errorMessage}</p>
      )}
    </div>
  );
}
