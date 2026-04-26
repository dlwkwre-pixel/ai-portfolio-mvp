"use client";

import { usePortfolioPrivacy } from "./portfolio-privacy-context";

type Props = {
  investedCapital: number;
  holdingsCostBasis: number;
  holdingsMarketValue: number;
  totalPortfolioValue: number;
  unrealizedPl: number;
  realizedPl: number;
  totalPl: number;
  totalReturnPct: number | null;
};

function fmt(value: number | null | undefined) {
  if (value == null) return "—";
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(value: number | null | undefined) {
  if (value == null) return "—";
  return `${Number(value).toFixed(2)}%`;
}

function plColor(value: number | null | undefined) {
  if (value == null) return "var(--text-primary)";
  if (value > 0) return "var(--green)";
  if (value < 0) return "var(--red)";
  return "var(--text-primary)";
}

export default function PerformanceDisplay({
  investedCapital, holdingsCostBasis, holdingsMarketValue,
  totalPortfolioValue, unrealizedPl, realizedPl, totalPl, totalReturnPct,
}: Props) {
  const { isPrivate } = usePortfolioPrivacy();
  const h = (v: string) => isPrivate ? "$••••••" : v;
  const hp = (v: string) => isPrivate ? "••••%" : v;

  const stats = [
    { label: "Invested Capital",     value: h(fmt(investedCapital)),        color: "var(--text-primary)" },
    { label: "Cost Basis",           value: h(fmt(holdingsCostBasis)),       color: "var(--text-primary)" },
    { label: "Market Value",         value: h(fmt(holdingsMarketValue)),     color: "var(--text-primary)" },
    { label: "Total Value",          value: h(fmt(totalPortfolioValue)),     color: "var(--text-primary)", highlight: true },
    { label: "Unrealized P/L",       value: h(fmt(unrealizedPl)),           color: isPrivate ? "var(--text-primary)" : plColor(unrealizedPl) },
    { label: "Realized P/L",         value: h(fmt(realizedPl)),             color: isPrivate ? "var(--text-primary)" : plColor(realizedPl) },
    { label: "Total P/L",            value: h(fmt(totalPl)),                color: isPrivate ? "var(--text-primary)" : plColor(totalPl) },
    { label: "Return on Capital",    value: hp(fmtPct(totalReturnPct)),     color: isPrivate ? "var(--text-primary)" : plColor(totalReturnPct) },
  ];

  return (
    <div className="bt-card">
      <div style={{ marginBottom: "14px" }}>
        <h2 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)" }}>
          Performance Analytics
        </h2>
        <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>
          Portfolio-level profit, cost basis, and return metrics.
        </p>
      </div>

      <div className="bt-animate-page" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
        {stats.map((stat) => (
          <div
            key={stat.label}
            style={{
              background: stat.highlight ? "rgba(37,99,235,0.07)" : "var(--bg-elevated)",
              border: `1px solid ${stat.highlight ? "rgba(37,99,235,0.18)" : "var(--border-subtle)"}`,
              borderRadius: "var(--radius-md)",
              padding: "11px 13px",
            }}
          >
            <div className="label" style={{ marginBottom: "5px" }}>{stat.label}</div>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: "15px",
              fontWeight: 500,
              color: stat.color,
              letterSpacing: "-0.3px",
            }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
