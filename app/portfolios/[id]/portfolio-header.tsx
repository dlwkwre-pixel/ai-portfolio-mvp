"use client";

import { usePortfolioPrivacy } from "./portfolio-privacy-context";

type StatCard = {
  label: string;
  value: string;
  isMoney: boolean;
  highlight?: boolean;
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

export default function PortfolioHeader({ statCards }: PortfolioHeaderProps) {
  const { isPrivate, setIsPrivate, hide } = usePortfolioPrivacy();

  return (
    <>
      {/* Privacy toggle — shown in topbar */}
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
            Private
          </>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
              <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41z" clipRule="evenodd" />
            </svg>
            Privacy
          </>
        )}
      </button>

      {/* Stat cards — rendered as a separate section below topbar */}
      <div
        data-stat-cards
        className="bt-animate-page bt-page-header"
        style={{
          display: "grid",
          gap: "8px",
          gridTemplateColumns: "repeat(4, 1fr)",
          padding: "12px 24px",
          borderBottom: "1px solid var(--border-subtle)",
          background: "var(--bg-base)",
        }}
      >
        {statCards.map((stat) => (
          <div
            key={stat.label}
            style={{
              background: stat.highlight ? "rgba(37,99,235,0.08)" : "var(--card-bg)",
              border: `1px solid ${stat.highlight ? "rgba(37,99,235,0.2)" : "var(--card-border)"}`,
              borderRadius: "var(--radius-md)",
              padding: "10px 14px",
            }}
          >
            <div className="label" style={{ marginBottom: "4px" }}>{stat.label}</div>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: "16px",
              fontWeight: 500,
              letterSpacing: "-0.3px",
              color: stat.highlight ? "#93c5fd" : "var(--text-primary)",
            }}>
              {hide(stat.value, stat.isMoney)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
