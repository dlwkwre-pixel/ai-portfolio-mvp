"use client";

import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type FundamentalsData = {
  ticker: string;
  companyName: string | null;
  ttmRevenue: number | null;
  ttmNetIncome: number | null;
  ttmEpsDiluted: number | null;
  totalAssets: number | null;
  stockholdersEquity: number | null;
  revenueGrowthYoy: number | null;
  error?: string;
};

type FundamentalsPanelProps = {
  ticker: string;
  currentPrice: number | null;
};

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtLarge(n: number | null): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000_000) return `${sign}$${(abs / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  return `${sign}$${abs.toLocaleString()}`;
}

function fmtEps(n: number | null): string {
  if (n == null) return "—";
  return `${n >= 0 ? "" : "-"}$${Math.abs(n).toFixed(2)}`;
}

function fmtPe(price: number | null, eps: number | null): string {
  if (price == null || eps == null || eps <= 0) return "—";
  const pe = price / eps;
  if (!Number.isFinite(pe) || pe > 10000) return "—";
  return `${pe.toFixed(1)}x`;
}

function fmtGrowth(n: number | null): string {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonBlock({ width = "100%" }: { width?: string }) {
  return (
    <div
      style={{
        width,
        height: "14px",
        borderRadius: "4px",
        background: "var(--bg-surface)",
        animation: "fundamentals-pulse 1.5s ease-in-out infinite",
      }}
    />
  );
}

// ─── Metric Cell ──────────────────────────────────────────────────────────────

function MetricCell({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <div
        style={{
          fontSize: "9px",
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          marginBottom: "4px",
        }}
      >
        {label}
      </div>
      <div
        className="num"
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: valueColor ?? "var(--text-primary)",
          fontFamily: "var(--font-mono)",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FundamentalsPanel({ ticker, currentPrice }: FundamentalsPanelProps) {
  const [data, setData] = useState<FundamentalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    setData(null);

    fetch(`/api/market/fundamentals/${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((d: FundamentalsData) => {
        if (cancelled) return;
        if (d.error && !d.companyName) {
          setFetchError(d.error);
        } else {
          setData(d);
        }
      })
      .catch(() => {
        if (!cancelled) setFetchError("Failed to load fundamentals.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const netIncomeColor =
    data?.ttmNetIncome == null
      ? "var(--text-primary)"
      : data.ttmNetIncome >= 0
      ? "#00d395"
      : "#f87171";

  const growthColor =
    data?.revenueGrowthYoy == null
      ? "var(--text-muted)"
      : data.revenueGrowthYoy >= 10
      ? "#00d395"
      : data.revenueGrowthYoy >= 0
      ? "var(--amber)"
      : "#f87171";

  return (
    <>
      <style>{`
        @keyframes fundamentals-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>

      <div
        style={{
          padding: "14px 18px 16px",
          background: "var(--bg-surface)",
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "12px",
          }}
        >
          <span
            style={{
              fontSize: "9px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "var(--text-muted)",
            }}
          >
            SEC Financials · {ticker}
          </span>
          {data?.companyName && (
            <>
              <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
              <span
                style={{
                  fontSize: "10px",
                  color: "var(--text-muted)",
                  maxWidth: "220px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {data.companyName}
              </span>
            </>
          )}
          {!data?.companyName && (
            <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
          )}
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
              gap: "6px",
            }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                style={{
                  padding: "10px 12px",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <SkeletonBlock width="60%" />
                <SkeletonBlock width="80%" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && fetchError && (
          <div
            style={{
              fontSize: "12px",
              color: "var(--text-muted)",
              padding: "10px 12px",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            {fetchError}
          </div>
        )}

        {/* Data grid */}
        {!loading && data && !fetchError && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
              gap: "6px",
            }}
          >
            <MetricCell label="Revenue (TTM)" value={fmtLarge(data.ttmRevenue)} />
            <MetricCell
              label="Net Income (TTM)"
              value={fmtLarge(data.ttmNetIncome)}
              valueColor={netIncomeColor}
            />
            <MetricCell label="EPS (TTM)" value={fmtEps(data.ttmEpsDiluted)} />
            <MetricCell
              label="P/E Ratio"
              value={fmtPe(currentPrice, data.ttmEpsDiluted)}
            />
            <MetricCell label="Total Assets" value={fmtLarge(data.totalAssets)} />
            <MetricCell label="Book Value" value={fmtLarge(data.stockholdersEquity)} />
            {data.revenueGrowthYoy != null && (
              <MetricCell
                label="Rev Growth YoY"
                value={fmtGrowth(data.revenueGrowthYoy)}
                valueColor={growthColor}
              />
            )}
          </div>
        )}

        {/* Attribution */}
        <div
          style={{
            marginTop: "10px",
            fontSize: "9px",
            color: "var(--text-muted)",
            textAlign: "right",
          }}
        >
          Data via SEC EDGAR · XBRL filings · Updated every 6 hours
        </div>
      </div>
    </>
  );
}
