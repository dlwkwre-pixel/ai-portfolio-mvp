"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateRecommendationStatus, deleteRecommendationItem } from "./recommendation-actions";

type RecommendationStatusButtonsProps = {
  portfolioId: string;
  recommendationItemId: string;
  currentStatus: string | null;
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
}: RecommendationStatusButtonsProps) {
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const router = useRouter();

  function handleStatusChange(statusValue: string) {
    setErrorMessage("");
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
    </div>
  );
}
