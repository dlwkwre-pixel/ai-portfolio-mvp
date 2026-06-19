import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import { getPortfolioPerformanceSummary } from "@/lib/portfolio/performance";
import ReportPrintButton from "./report-print-button";

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtMoney(v: number | null | undefined, showSign = false): string {
  if (v == null) return "—";
  const abs = Math.abs(v);
  const sign = showSign ? (v > 0 ? "+" : v < 0 ? "-" : "") : v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  return `${sign}$${abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function plColor(v: number | null | undefined): string {
  if (v == null || v === 0) return "#94a3b8";
  return v > 0 ? "#22c55e" : "#ef4444";
}

function riskLabel(v: string | null): string {
  const m: Record<string, string> = {
    low: "Conservative", conservative: "Conservative",
    moderate: "Moderate", medium: "Moderate",
    high: "Aggressive", aggressive: "Aggressive",
  };
  return m[(v ?? "").toLowerCase()] ?? v ?? "—";
}

function actionColor(action: string | null): string {
  const a = (action ?? "").toLowerCase();
  if (a.includes("buy") || a.includes("add")) return "#22c55e";
  if (a.includes("sell") || a.includes("exit") || a.includes("reduce")) return "#ef4444";
  if (a.includes("hold")) return "#f59e0b";
  return "#94a3b8";
}

const REPORT_CSS = `
:root {
  --rpt-bg: #040d1a;
  --rpt-surface: rgba(255,255,255,0.04);
  --rpt-card: rgba(255,255,255,0.06);
  --rpt-border: rgba(255,255,255,0.09);
  --rpt-blue: #2563eb;
  --rpt-blue-dim: rgba(37,99,235,0.14);
  --rpt-text: #f1f5f9;
  --rpt-secondary: #94a3b8;
  --rpt-muted: #475569;
  --rpt-green: #22c55e;
  --rpt-red: #ef4444;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--rpt-bg); color: var(--rpt-text); }

#bt-report {
  font-family: -apple-system, "DM Sans", "Inter", sans-serif;
  background: var(--rpt-bg);
  color: var(--rpt-text);
  min-height: 100vh;
  line-height: 1.5;
}

.rpt-num { font-family: "DM Mono", "Courier New", monospace; }

.rpt-label {
  font-size: 9px;
  color: var(--rpt-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 500;
}

.rpt-section-tag {
  font-size: 9px;
  color: var(--rpt-blue);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 600;
  margin-bottom: 8px;
}

.rpt-section-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--rpt-text);
  letter-spacing: -0.3px;
  margin-bottom: 18px;
}

.rpt-controls {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(4,13,26,0.96);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--rpt-border);
  padding: 10px 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.rpt-ctrl-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  text-decoration: none;
  border: none;
  font-family: inherit;
  line-height: 1;
}

.rpt-ctrl-btn-primary {
  background: var(--rpt-blue);
  color: #fff;
}

.rpt-ctrl-btn-ghost {
  background: transparent;
  color: var(--rpt-secondary);
  border: 1px solid var(--rpt-border);
}

.rpt-cover {
  padding: 48px 40px 44px;
  border-bottom: 1px solid var(--rpt-border);
}

.rpt-cover-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 44px;
}

.rpt-wordmark {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--rpt-text);
}

.rpt-wordmark-accent { color: var(--rpt-blue); }

.rpt-cover-name {
  font-size: 34px;
  font-weight: 700;
  color: var(--rpt-text);
  letter-spacing: -0.8px;
  line-height: 1.1;
  margin-bottom: 10px;
}

.rpt-cover-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 36px;
}

.rpt-cover-pill {
  font-size: 11px;
  color: var(--rpt-secondary);
  background: var(--rpt-surface);
  border: 1px solid var(--rpt-border);
  padding: 3px 10px;
  border-radius: 20px;
}

.rpt-hero-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.rpt-hero-card {
  background: var(--rpt-surface);
  border: 1px solid var(--rpt-border);
  border-radius: 10px;
  padding: 14px 16px;
}

.rpt-hero-card-highlight {
  background: var(--rpt-blue-dim);
  border-color: rgba(37,99,235,0.25);
}

.rpt-hero-value {
  font-family: "DM Mono", monospace;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.5px;
  margin-top: 4px;
  line-height: 1.1;
}

.rpt-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.rpt-kpi-card {
  background: var(--rpt-surface);
  border: 1px solid var(--rpt-border);
  border-radius: 8px;
  padding: 12px 14px;
}

.rpt-kpi-value {
  font-family: "DM Mono", monospace;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.3px;
  margin-top: 4px;
}

.rpt-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.rpt-table th {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-weight: 500;
  color: var(--rpt-muted);
  padding: 6px 10px;
  text-align: right;
  border-bottom: 1px solid var(--rpt-border);
  white-space: nowrap;
}

.rpt-table th:first-child,
.rpt-table th:nth-child(2) { text-align: left; }

.rpt-table td {
  padding: 9px 10px;
  font-size: 12px;
  color: var(--rpt-secondary);
  text-align: right;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}

.rpt-table td:first-child,
.rpt-table td:nth-child(2) { text-align: left; }

.rpt-table tr:last-child td { border-bottom: none; }
.rpt-table tr:nth-child(even) td { background: var(--surface-002); }

.rpt-ticker {
  font-family: "DM Mono", monospace;
  font-weight: 600;
  font-size: 12px;
  color: var(--rpt-text);
}

.rpt-rec-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}

.rpt-rec-row:last-child { border-bottom: none; }

.rpt-action-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-family: "DM Mono", monospace;
  flex-shrink: 0;
  margin-top: 2px;
}

.rpt-strategy-card {
  background: var(--rpt-blue-dim);
  border: 1px solid rgba(37,99,235,0.2);
  border-radius: 10px;
  padding: 18px 20px;
}

.rpt-section {
  padding: 36px 40px;
  border-bottom: 1px solid var(--rpt-border);
}

.rpt-cash-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  border-radius: 8px;
  margin-bottom: 4px;
}

.rpt-cash-row:nth-child(even) { background: var(--rpt-surface); }

.rpt-footer {
  padding: 28px 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  border-top: 1px solid var(--rpt-border);
}

/* Print styles */
@media print {
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }

  @page { margin: 0; size: Letter; }

  html, body {
    background: #040d1a !important;
    color: #f1f5f9 !important;
  }

  .rpt-controls { display: none !important; }
  .mobile-bottom-nav { display: none !important; }

  .rpt-section { page-break-inside: avoid; }
}
`;

// ─── page ────────────────────────────────────────────────────────────────────

export default async function PortfolioReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/portfolios/${id}/report`);

  const [
    { data: portfolio },
    { data: rawHoldings },
    { data: transactions },
    { data: assignment },
    { data: recs },
    { data: cashLedger },
    { data: profile },
  ] = await Promise.all([
    supabase.from("portfolios").select("*").eq("id", id).eq("user_id", user.id).maybeSingle(),
    supabase.from("holdings").select("*").eq("portfolio_id", id).order("ticker"),
    supabase
      .from("portfolio_transactions")
      .select("transaction_type, gross_amount, net_cash_impact, realized_gain_loss")
      .eq("portfolio_id", id),
    supabase
      .from("portfolio_strategy_assignments")
      .select(
        `*, strategies(id, name, description, style, risk_level), strategy_versions(version_number, max_position_pct, turnover_preference, holding_period_bias)`
      )
      .eq("portfolio_id", id)
      .eq("is_active", true)
      .is("ended_at", null)
      .order("assigned_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("recommendation_items")
      .select(
        "action_type, ticker, company_name, thesis, conviction, confidence_score, recommendation_status, created_at"
      )
      .eq("portfolio_id", id)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("cash_ledger")
      .select("*")
      .eq("portfolio_id", id)
      .order("effective_at", { ascending: false })
      .limit(8),
    supabase
      .from("user_profiles")
      .select("username, display_name")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  if (!portfolio) redirect("/portfolios");

  const cashBalance = Number(portfolio.cash_balance ?? 0);

  const valuation = await getPortfolioValuation({
    holdings: (rawHoldings ?? []).map((h) => ({
      id: h.id,
      ticker: h.ticker,
      company_name: h.company_name,
      asset_type: h.asset_type,
      shares: h.shares,
      average_cost_basis: h.average_cost_basis,
    })),
    cashBalance,
  });

  const perf = getPortfolioPerformanceSummary({
    valuedHoldings: valuation.valued_holdings,
    transactions: transactions ?? [],
    cashBalance,
  });

  const totalReturnPct =
    perf.invested_capital > 0
      ? (perf.total_pl / perf.invested_capital) * 100
      : null;

  const totalMV = perf.holdings_market_value_total;

  const holdings = valuation.valued_holdings
    .map((h) => ({
      ...h,
      weight_pct:
        totalMV > 0 && h.market_value ? (h.market_value / totalMV) * 100 : 0,
    }))
    .sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0));

  const benchmark = portfolio.benchmark_symbol || "SPY";
  const strategy = (assignment as { strategies?: { name: string; description: string | null; style: string | null; risk_level: string | null } | null } | null)?.strategies ?? null;
  const stratVer = (assignment as { strategy_versions?: { version_number: number | null; max_position_pct: number | null; turnover_preference: string | null; holding_period_bias: string | null } | null } | null)?.strategy_versions ?? null;
  const userName =
    profile?.display_name ||
    profile?.username ||
    user.email?.split("@")[0] ||
    "Investor";
  const reportDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: REPORT_CSS }} />

      <div id="bt-report">
        {/* Control bar */}
        <div className="rpt-controls">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <a href={`/portfolios/${id}`} className="rpt-ctrl-btn rpt-ctrl-btn-ghost">
              ← Back to Portfolio
            </a>
            <span style={{ fontSize: "12px", color: "var(--rpt-muted)" }}>
              {portfolio.name} — Report
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <ReportPrintButton />
          </div>
        </div>

        {/* ── COVER ─────────────────────────────────────────────────────── */}
        <div className="rpt-cover">
          <div className="rpt-cover-top">
            <div className="rpt-wordmark">
              BUY<span className="rpt-wordmark-accent">TUNE</span>
            </div>
            <div style={{ fontSize: "11px", color: "var(--rpt-muted)" }}>
              Portfolio Report · {reportDate}
            </div>
          </div>

          <div className="rpt-section-tag">Investment Report</div>
          <div className="rpt-cover-name">{portfolio.name}</div>

          <div className="rpt-cover-meta">
            <span className="rpt-cover-pill">{userName}</span>
            {portfolio.account_type && (
              <span
                className="rpt-cover-pill"
                style={{ textTransform: "capitalize" }}
              >
                {portfolio.account_type.replace(/_/g, " ")}
              </span>
            )}
            <span className="rpt-cover-pill">Benchmark: {benchmark}</span>
            {strategy && (
              <span
                className="rpt-cover-pill"
                style={{ borderColor: "rgba(37,99,235,0.3)", color: "#93c5fd" }}
              >
                {strategy.name}
              </span>
            )}
          </div>

          <div className="rpt-hero-grid">
            {[
              {
                label: "Total Portfolio Value",
                value: fmtMoney(perf.total_portfolio_value),
                color: "var(--rpt-text)",
                highlight: true,
              },
              {
                label: "Return on Capital",
                value: fmtPct(totalReturnPct),
                color: plColor(totalReturnPct),
                highlight: false,
              },
              {
                label: "Unrealized P/L",
                value: fmtMoney(perf.unrealized_pl_total, true),
                color: plColor(perf.unrealized_pl_total),
                highlight: false,
              },
              {
                label: "Total P/L",
                value: fmtMoney(perf.total_pl, true),
                color: plColor(perf.total_pl),
                highlight: false,
              },
            ].map(({ label, value, color, highlight }) => (
              <div
                key={label}
                className={`rpt-hero-card${highlight ? " rpt-hero-card-highlight" : ""}`}
              >
                <div className="rpt-label">{label}</div>
                <div className="rpt-hero-value" style={{ color }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION 1: PERFORMANCE ANALYTICS ─────────────────────────── */}
        <div className="rpt-section">
          <div className="rpt-section-tag">Section 1</div>
          <div className="rpt-section-title">Performance Analytics</div>

          <div className="rpt-kpi-grid">
            {[
              {
                label: "Invested Capital",
                value: fmtMoney(perf.invested_capital),
                color: "var(--rpt-text)",
              },
              {
                label: "Cost Basis",
                value: fmtMoney(perf.holdings_cost_basis_total),
                color: "var(--rpt-text)",
              },
              {
                label: "Market Value",
                value: fmtMoney(perf.holdings_market_value_total),
                color: "var(--rpt-text)",
              },
              {
                label: "Cash Balance",
                value: fmtMoney(cashBalance),
                color: "var(--rpt-text)",
              },
              {
                label: "Unrealized P/L",
                value: fmtMoney(perf.unrealized_pl_total, true),
                color: plColor(perf.unrealized_pl_total),
              },
              {
                label: "Realized P/L",
                value: fmtMoney(perf.realized_pl_total, true),
                color: plColor(perf.realized_pl_total),
              },
              {
                label: "Total P/L",
                value: fmtMoney(perf.total_pl, true),
                color: plColor(perf.total_pl),
              },
              {
                label: "Return on Capital",
                value: fmtPct(totalReturnPct),
                color: plColor(totalReturnPct),
              },
            ].map(({ label, value, color }) => (
              <div key={label} className="rpt-kpi-card">
                <div className="rpt-label">{label}</div>
                <div className="rpt-kpi-value" style={{ color }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION 2: HOLDINGS ───────────────────────────────────────── */}
        {holdings.length > 0 && (
          <div className="rpt-section">
            <div className="rpt-section-tag">Section 2</div>
            <div className="rpt-section-title">
              Holdings
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 400,
                  color: "var(--rpt-secondary)",
                  marginLeft: "10px",
                }}
              >
                {holdings.length} position{holdings.length !== 1 ? "s" : ""}
              </span>
            </div>

            <table className="rpt-table">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Company</th>
                  <th>Shares</th>
                  <th>Avg Cost</th>
                  <th>Current</th>
                  <th>Mkt Value</th>
                  <th>Weight</th>
                  <th>Unrealized</th>
                  <th>Return</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <span className="rpt-ticker">{h.ticker}</span>
                    </td>
                    <td
                      style={{
                        color: "var(--rpt-secondary)",
                        maxWidth: "180px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h.company_name || h.ticker}
                    </td>
                    <td className="rpt-num">{h.shares_number.toLocaleString()}</td>
                    <td className="rpt-num">{fmtMoney(h.average_cost_basis_number)}</td>
                    <td className="rpt-num">
                      {h.current_price != null ? fmtMoney(h.current_price) : "—"}
                    </td>
                    <td
                      className="rpt-num"
                      style={{ color: "var(--rpt-text)", fontWeight: 500 }}
                    >
                      {fmtMoney(h.market_value)}
                    </td>
                    <td className="rpt-num">{h.weight_pct.toFixed(1)}%</td>
                    <td
                      className="rpt-num"
                      style={{ color: plColor(h.unrealized_pl) }}
                    >
                      {fmtMoney(h.unrealized_pl, true)}
                    </td>
                    <td
                      className="rpt-num"
                      style={{ color: plColor(h.unrealized_pl_pct) }}
                    >
                      {fmtPct(h.unrealized_pl_pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {holdings.length > 0 && holdings[0].weight_pct > 20 && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "10px 14px",
                  background: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(245,158,11,0.18)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "#fbbf24",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span
                  style={{
                    fontFamily: "DM Mono, monospace",
                    fontWeight: 700,
                    fontSize: "10px",
                    letterSpacing: "0.06em",
                  }}
                >
                  CONCENTRATION
                </span>
                <span>
                  Largest position ({holdings[0].ticker}) represents{" "}
                  {holdings[0].weight_pct.toFixed(1)}% of holdings.
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── SECTION 3: STRATEGY PROFILE ──────────────────────────────── */}
        {strategy && (
          <div className="rpt-section">
            <div className="rpt-section-tag">Section 3</div>
            <div className="rpt-section-title">Strategy Profile</div>

            <div className="rpt-strategy-card">
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "12px",
                  marginBottom: "10px",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "17px",
                      fontWeight: 700,
                      color: "var(--rpt-text)",
                      letterSpacing: "-0.3px",
                    }}
                  >
                    {strategy.name}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--rpt-secondary)",
                      marginTop: "3px",
                    }}
                  >
                    {strategy.style || "Custom"} · {riskLabel(strategy.risk_level)}
                  </div>
                </div>
                {stratVer?.version_number != null && (
                  <div
                    style={{
                      flexShrink: 0,
                      fontSize: "10px",
                      color: "#93c5fd",
                      background: "rgba(37,99,235,0.18)",
                      padding: "3px 10px",
                      borderRadius: "20px",
                      fontWeight: 600,
                    }}
                  >
                    v{stratVer.version_number}
                  </div>
                )}
              </div>

              {strategy.description && (
                <div
                  style={{
                    fontSize: "13px",
                    color: "var(--rpt-secondary)",
                    lineHeight: 1.6,
                    marginBottom: "14px",
                  }}
                >
                  {strategy.description}
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "8px",
                }}
              >
                {(
                  [
                    [
                      "Max Position",
                      stratVer?.max_position_pct
                        ? `${stratVer.max_position_pct}%`
                        : "—",
                    ],
                    ["Turnover", stratVer?.turnover_preference ?? "—"],
                    ["Holding Period", stratVer?.holding_period_bias ?? "—"],
                    ["Risk Level", riskLabel(strategy.risk_level)],
                  ] as [string, string][]
                ).map(([label, value]) => (
                  <div
                    key={label}
                    style={{
                      background: "var(--surface-005)",
                      borderRadius: "6px",
                      padding: "8px 10px",
                    }}
                  >
                    <div className="rpt-label">{label}</div>
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: 500,
                        color: "var(--rpt-text)",
                        marginTop: "2px",
                        textTransform: "capitalize",
                      }}
                    >
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SECTION 4: AI RECOMMENDATIONS ────────────────────────────── */}
        {recs && recs.length > 0 && (
          <div className="rpt-section">
            <div className="rpt-section-tag">Section 4</div>
            <div className="rpt-section-title">AI Recommendations</div>

            <div>
              {recs.map((rec, i) => {
                const acColor = actionColor(rec.action_type);
                const acBg =
                  acColor === "#22c55e"
                    ? "rgba(34,197,94,0.12)"
                    : acColor === "#ef4444"
                    ? "rgba(239,68,68,0.12)"
                    : "rgba(245,158,11,0.12)";
                const statusColor =
                  rec.recommendation_status === "executed"
                    ? "#22c55e"
                    : rec.recommendation_status === "accepted"
                    ? "#93c5fd"
                    : rec.recommendation_status === "rejected"
                    ? "#f87171"
                    : "#64748b";
                const statusBg =
                  rec.recommendation_status === "executed"
                    ? "rgba(34,197,94,0.1)"
                    : rec.recommendation_status === "accepted"
                    ? "rgba(37,99,235,0.1)"
                    : rec.recommendation_status === "rejected"
                    ? "rgba(239,68,68,0.1)"
                    : "rgba(255,255,255,0.06)";

                return (
                  <div key={i} className="rpt-rec-row">
                    <div
                      className="rpt-action-badge"
                      style={{ background: acBg, color: acColor }}
                    >
                      {(rec.action_type ?? "").replace(/_/g, " ")}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginBottom: "3px",
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "DM Mono, monospace",
                            fontWeight: 700,
                            fontSize: "13px",
                            color: "var(--rpt-text)",
                          }}
                        >
                          {rec.ticker}
                        </span>
                        {rec.company_name && (
                          <span
                            style={{
                              fontSize: "12px",
                              color: "var(--rpt-muted)",
                            }}
                          >
                            {rec.company_name}
                          </span>
                        )}
                        {rec.conviction && (
                          <span
                            style={{
                              fontSize: "10px",
                              color: "var(--rpt-secondary)",
                              background: "var(--rpt-surface)",
                              border: "1px solid var(--rpt-border)",
                              padding: "1px 7px",
                              borderRadius: "4px",
                            }}
                          >
                            {rec.conviction}
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: "10px",
                            padding: "1px 6px",
                            borderRadius: "4px",
                            background: statusBg,
                            color: statusColor,
                          }}
                        >
                          {rec.recommendation_status ?? "proposed"}
                        </span>
                      </div>
                      {rec.thesis && (
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--rpt-secondary)",
                            lineHeight: 1.5,
                          }}
                        >
                          {rec.thesis}
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--rpt-muted)",
                        flexShrink: 0,
                        fontFamily: "DM Mono, monospace",
                      }}
                    >
                      {new Date(rec.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── SECTION 5: CASH ACTIVITY ──────────────────────────────────── */}
        {cashLedger && cashLedger.length > 0 && (
          <div className="rpt-section">
            <div className="rpt-section-tag">Section 5</div>
            <div className="rpt-section-title">Cash Activity</div>

            <div>
              {cashLedger.map((entry) => (
                <div key={entry.id} className="rpt-cash-row">
                  <div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "var(--rpt-text)",
                        textTransform: "capitalize",
                      }}
                    >
                      {(entry.reason ?? "").replace(/_/g, " ")}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--rpt-muted)",
                        marginTop: "1px",
                      }}
                    >
                      {new Date(entry.effective_at).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: "DM Mono, monospace",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: entry.direction === "IN" ? "#22c55e" : "#ef4444",
                    }}
                  >
                    {entry.direction === "IN" ? "+" : "-"}
                    {fmtMoney(Number(entry.amount))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── FOOTER ────────────────────────────────────────────────────── */}
        <div className="rpt-footer">
          <div className="rpt-wordmark">
            BUY<span className="rpt-wordmark-accent">TUNE</span>
          </div>
          <div
            style={{
              fontSize: "11px",
              color: "var(--rpt-muted)",
              textAlign: "center",
            }}
          >
            AI-generated investment intelligence · {reportDate}
          </div>
          <div style={{ fontSize: "11px", color: "var(--rpt-muted)" }}>
            Generated for {userName}
          </div>
        </div>
      </div>
    </>
  );
}
