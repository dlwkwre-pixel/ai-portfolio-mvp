"use client";

import { useState, useTransition } from "react";
import { usePortfolioPrivacy } from "./portfolio-privacy-context";
import { setDirectCashBalance } from "./actions";

type StatCard = {
  label: string;
  value: string;
  isMoney: boolean;
  highlight?: boolean;
};

type EditCashProps = {
  portfolioId: string;
  cashBalance: number;
};

type PortfolioHeaderProps = {
  portfolioId: string;
  portfolioName: string;
  portfolioDescription: string | null;
  accountTypeLabel: string;
  benchmarkSymbol: string;
  status: string | null;
  createdAt: string;
  styleDot: string;
  styleBadge: string;
  statCards: StatCard[];
};

// Rendered separately below the topbar in page.tsx so it is never a flex
// child of the topbar row (which would break the header layout on mobile).
export function PortfolioStatCards({
  statCards,
  editCash,
}: {
  statCards: StatCard[];
  editCash?: EditCashProps;
}) {
  const { hide } = usePortfolioPrivacy();
  const [isEditing, setIsEditing] = useState(false);
  const [cashValue, setCashValue] = useState("");
  const [cashError, setCashError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleEditOpen() {
    setCashValue((editCash?.cashBalance ?? 0).toFixed(2));
    setCashError("");
    setIsEditing(true);
  }

  function handleEditCancel() {
    setIsEditing(false);
    setCashError("");
  }

  function handleEditSave() {
    const n = Number(cashValue);
    if (!Number.isFinite(n) || n < 0) {
      setCashError("Enter a valid amount.");
      return;
    }
    setCashError("");
    startTransition(async () => {
      try {
        await setDirectCashBalance(editCash!.portfolioId, n);
        setIsEditing(false);
      } catch (e) {
        setCashError(e instanceof Error ? e.message : "Failed.");
      }
    });
  }

  return (
    <div
      className="portfolio-stat-grid bt-page-header"
      style={{
        gap: "8px",
        padding: "12px 24px",
        borderBottom: "1px solid var(--border-subtle)",
        background: "var(--bg-base)",
      }}
    >
      {statCards.map((stat) => {
        const isCashCard = stat.label === "Cash" && !!editCash;

        if (isCashCard && isEditing) {
          return (
            <div
              key={stat.label}
              style={{
                background: "var(--card-bg)",
                border: "1px solid rgba(37,99,235,0.3)",
                borderRadius: "var(--radius-md)",
                padding: "10px 14px",
              }}
            >
              <div className="label" style={{ marginBottom: "6px" }}>Cash</div>
              <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      position: "absolute",
                      left: "8px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--text-secondary)",
                      fontSize: "13px",
                      pointerEvents: "none",
                    }}
                  >
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={cashValue}
                    onChange={(e) => setCashValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleEditSave();
                      if (e.key === "Escape") handleEditCancel();
                    }}
                    autoFocus
                    style={{
                      width: "100%",
                      paddingLeft: "20px",
                      paddingRight: "6px",
                      paddingTop: "4px",
                      paddingBottom: "4px",
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: "6px",
                      color: "var(--text-primary)",
                      fontSize: "13px",
                      fontFamily: "var(--font-mono)",
                      outline: "none",
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleEditSave}
                  disabled={isPending}
                  style={{
                    padding: "4px 10px",
                    background: "linear-gradient(135deg,#2563eb,#4f46e5)",
                    border: "none",
                    borderRadius: "6px",
                    color: "white",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: isPending ? "not-allowed" : "pointer",
                    opacity: isPending ? 0.6 : 1,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {isPending ? "…" : "Set"}
                </button>
                <button
                  type="button"
                  onClick={handleEditCancel}
                  style={{
                    padding: "4px 8px",
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "6px",
                    color: "var(--text-secondary)",
                    fontSize: "12px",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              </div>
              {cashError && (
                <p style={{ marginTop: "4px", fontSize: "11px", color: "#f87171" }}>
                  {cashError}
                </p>
              )}
            </div>
          );
        }

        return (
          <div
            key={stat.label}
            style={{
              background: stat.highlight ? "rgba(37,99,235,0.08)" : "var(--card-bg)",
              border: `1px solid ${stat.highlight ? "rgba(37,99,235,0.2)" : "var(--card-border)"}`,
              borderRadius: "var(--radius-md)",
              padding: "10px 14px",
            }}
          >
            <div
              className="label"
              style={{
                marginBottom: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>{stat.label}</span>
              {isCashCard && (
                <button
                  type="button"
                  onClick={handleEditOpen}
                  title="Edit cash balance directly — no ledger entry"
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-tertiary)",
                    padding: "0 0 0 4px",
                    display: "flex",
                    alignItems: "center",
                    opacity: 0.5,
                    transition: "opacity 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}
                >
                  <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                </button>
              )}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "16px",
                fontWeight: 500,
                letterSpacing: "-0.3px",
                color: stat.highlight ? "#93c5fd" : "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {hide(stat.value, stat.isMoney)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Default export: only the privacy toggle button — lives in the topbar.
export default function PortfolioHeader({ statCards: _statCards, ..._ }: PortfolioHeaderProps) {
  const { isPrivate, setIsPrivate } = usePortfolioPrivacy();

  return (
    <button
      type="button"
      onClick={() => setIsPrivate(!isPrivate)}
      title={isPrivate ? "Show values" : "Hide values"}
      className="bt-btn bt-btn-ghost bt-btn-sm"
      style={{ gap: "6px" }}
    >
      {isPrivate ? (
        <>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.029 10.029 0 003.3-4.38 1.651 1.651 0 000-1.185A10.004 10.004 0 009.999 3a9.956 9.956 0 00-4.744 1.194L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 013.374 3.373l1.091 1.092a4 4 0 00-5.557-5.557z" clipRule="evenodd" />
            <path d="M10.748 13.93l2.523 2.523a9.987 9.987 0 01-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 010-1.186A10.007 10.007 0 012.839 6.02L6.07 9.252a4 4 0 004.678 4.678z" />
          </svg>
          <span className="hidden sm:inline">Private</span>
        </>
      ) : (
        <>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
            <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41z" clipRule="evenodd" />
          </svg>
          <span className="hidden sm:inline">Privacy</span>
        </>
      )}
    </button>
  );
}
