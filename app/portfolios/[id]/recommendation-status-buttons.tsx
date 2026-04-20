"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateRecommendationStatus } from "./recommendation-actions";

type RecommendationStatusButtonsProps = {
  portfolioId: string;
  recommendationItemId: string;
  currentStatus: string | null;
};

const STATUSES = [
  { value: "accepted", label: "Accept" },
  { value: "watchlist", label: "Watchlist" },
  { value: "rejected", label: "Reject" },
  { value: "executed", label: "Executed" },
];

export default function RecommendationStatusButtons({
  portfolioId,
  recommendationItemId,
  currentStatus,
}: RecommendationStatusButtonsProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((status) => {
          const isActive = currentStatus === status.value;

          return (
            <button
              key={status.value}
              type="button"
              disabled={isPending || isActive}
              onClick={() => {
                setErrorMessage("");

                startTransition(async () => {
                  try {
                    const formData = new FormData();
                    formData.append("portfolio_id", portfolioId);
                    formData.append("recommendation_item_id", recommendationItemId);
                    formData.append("new_status", status.value);

                    await updateRecommendationStatus(formData);
                    router.refresh();
                  } catch (error) {
                    setErrorMessage(
                      error instanceof Error ? error.message : "Something went wrong."
                    );
                  }
                });
              }}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? "cursor-not-allowed border border-blue-500/40 bg-blue-500/20 text-blue-300"
                  : "border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
              } disabled:opacity-70`}
            >
              {isPending && isActive ? "Saving..." : status.label}
            </button>
          );
        })}
      </div>

      {errorMessage ? (
        <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}