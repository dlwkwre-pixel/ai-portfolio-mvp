"use client";

import { usePortfolioPrivacy } from "./portfolio-privacy-context";
import EditPortfolioForm from "./edit-portfolio-form";

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

export default function PortfolioHeader({
  portfolioId,
  portfolioName,
  portfolioDescription,
  accountTypeLabel,
  benchmarkSymbol,
  status,
  createdAt,
  styleDot,
  styleBadge,
  statCards,
}: PortfolioHeaderProps) {
  const { isPrivate, setIsPrivate, hide } = usePortfolioPrivacy();

  return (
    <div style={{ marginBottom: "16px" }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "16px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name + pills row */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
            {/* Glowing dot */}
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: styleDot, boxShadow: `0 0 8px ${styleDot}`, flexShrink: 0 }} />
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.4px", lineHeight: 1 }}>
              {portfolioName}
            </h1>
            <span className={styleBadge}>{accountTypeLabel}</span>
            <span style={{ fontSize: "10px", color: "var(--text-tertiary)", background: "var(--card-bg)", border: "1px solid var(--card-border)", padding: "2px 8px", borderRadius: "var(--radius-full)" }}>
              {benchmarkSymbol}
            </span>
            <span style={{ fontSize: "10px", color: "var(--text-tertiary)", background: "var(--card-bg)", border: "1px solid var(--card-border)", padding: "2px 8px", borderRadius: "var(--radius-full)", textTransform: "capitalize" }}>
              {status}
            </span>
            <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
              Since {createdAt}
            </span>
          </div>

          {/* Description */}
          {portfolioDescription && (
            <p style={{ fontSize: "12px", color: "var(--text-tertiary)", lineHeight: 1.6, maxWidth: "600px" }}>
              {portfolioDescription}
            </p>
          )}
        </div>

        {/* Action buttons — compact icon+label style */}
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexShrink: 0 }}>
          <EditPortfolioForm
            portfolio={{
              id: portfolioId,
              name: portfolioName,
              description: portfolioDescription,
              benchmark_symbol: benchmarkSymbol,
              status,
            }}
          />

          {/* Privacy toggle */}
          <button
            type="button"
            onClick={() => setIsPrivate(!isPrivate)}
            title={isPrivate ? "Show values" : "Hide values"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "7px 12px",
              borderRadius: "var(--radius-md)",
              fontSize: "12px",
              fontWeight: 500,
              fontFamily: "var(--font-body)",
              cursor: "pointer",
              border: `1px solid ${isPrivate ? "rgba(167,139,250,0.3)" : "var(--card-border)"}`,
              background: isPrivate ? "rgba(124,58,237,0.12)" : "var(--card-bg)",
              color: isPrivate ? "var(--violet)" : "var(--text-secondary)",
              transition: "var(--transition-base)",
            }}
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
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gap: "8px", gridTemplateColumns: "repeat(4, 1fr)" }}>
        {statCards.map((stat) => (
          <div
            key={stat.label}
            style={{
              background: stat.highlight ? "rgba(37,99,235,0.08)" : "var(--card-bg)",
              border: `1px solid ${stat.highlight ? "rgba(37,99,235,0.2)" : "var(--card-border)"}`,
              borderRadius: "var(--radius-md)",
              padding: "12px 14px",
            }}
          >
            <div className="label" style={{ marginBottom: "5px" }}>{stat.label}</div>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: "17px",
              fontWeight: 500,
              letterSpacing: "-0.4px",
              color: stat.highlight ? "#93c5fd" : "var(--text-primary)",
            }}>
              {hide(stat.value, stat.isMoney)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
