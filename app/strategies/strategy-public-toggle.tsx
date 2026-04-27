"use client";

import { useState, useTransition } from "react";
import { toggleStrategyPublic } from "@/app/community/social-actions";

export default function StrategyPublicToggle({
  strategyId,
  isPublic: initialIsPublic,
}: {
  strategyId: string;
  isPublic: boolean;
}) {
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [isPending, startTransition] = useTransition();

  function handle() {
    const next = !isPublic;
    setIsPublic(next);
    startTransition(() => toggleStrategyPublic(strategyId, next));
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={isPending}
      title={isPublic ? "Make private" : "Share publicly"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "5px",
        padding: "6px 11px",
        borderRadius: "var(--radius-md)",
        fontSize: "11px",
        fontWeight: 500,
        fontFamily: "var(--font-body)",
        cursor: "pointer",
        border: `1px solid ${isPublic ? "rgba(0,211,149,0.25)" : "var(--card-border)"}`,
        background: isPublic ? "rgba(0,211,149,0.07)" : "var(--card-bg)",
        color: isPublic ? "var(--green)" : "var(--text-tertiary)",
        transition: "var(--transition-base)",
        opacity: isPending ? 0.6 : 1,
      }}
    >
      {isPublic ? (
        <>
          <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd"/>
          </svg>
          Public
        </>
      ) : (
        <>
          <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
          </svg>
          Private
        </>
      )}
    </button>
  );
}
