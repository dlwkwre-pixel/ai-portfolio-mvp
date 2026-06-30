"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import InfoTooltip from "@/app/components/info-tooltip";
import { createCashActivity } from "./actions";

type DivEvent = { ticker: string; shares: number; perShare: number; estAmount: number; exDate: string; payDate: string | null };
type DivEvents = { upcoming: DivEvent[]; recent: DivEvent[] };

type IncomeHolding = { ticker: string; value: number; yieldPct: number; annualIncome: number; yieldOnCostPct: number | null };
type Data = {
  available: boolean;
  hasHoldings?: boolean;
  projectedAnnual?: number;
  monthlyAvg?: number;
  portfolioYield?: number;
  payerCount?: number;
  holdingCount?: number;
  coveragePct?: number;
  topPayerPct?: number;
  holdings?: IncomeHolding[];
  trailing12?: number;
  months?: { month: string; amount: number }[];
  hasActual?: boolean;
};

const fmt = (n: number) => "$" + Math.round(n).toLocaleString();
const fmtDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

function Hint({ text }: { text: string }) {
  return (
    <InfoTooltip text={text} align="start" width={240}>
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "15px", height: "15px", borderRadius: "50%", marginLeft: "6px", cursor: "help", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", color: "var(--accent, #818cf8)", fontSize: "10px", fontWeight: 700 }}>?</span>
    </InfoTooltip>
  );
}

export default function IncomeTab({ portfolioId }: { portfolioId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [events, setEvents] = useState<DivEvents | null>(null);
  const [logging, setLogging] = useState<string | null>(null);
  const [logged, setLogged] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portfolios/${portfolioId}/income`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Data) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setErr(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    fetch(`/api/portfolios/${portfolioId}/dividend-events`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: DivEvents) => { if (!cancelled) setEvents(d); })
      .catch(() => { /* calendar is best-effort */ });
    return () => { cancelled = true; };
  }, [portfolioId]);

  function logDividend(ev: DivEvent) {
    const key = `${ev.ticker}-${ev.payDate ?? ev.exDate}`;
    if (logging || logged[key]) return;
    setLogging(key);
    const fd = new FormData();
    fd.set("portfolio_id", portfolioId);
    fd.set("reason", "dividend");
    fd.set("amount", String(ev.estAmount));
    fd.set("effective_at", (ev.payDate ?? ev.exDate) || new Date().toISOString().slice(0, 10));
    startTransition(async () => {
      try {
        await createCashActivity(fd);
        setLogged((p) => ({ ...p, [key]: true }));
        // Refresh the received chart + projection.
        fetch(`/api/portfolios/${portfolioId}/income`).then((r) => r.ok ? r.json() : null).then((d) => { if (d) setData(d); }).catch(() => {});
        router.refresh();
      } catch { /* surfaced by disabling; keep silent */ } finally {
        setLogging(null);
      }
    });
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "40px", justifyContent: "center", color: "var(--text-muted)", fontSize: "13px" }}>
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--brand-blue)", opacity: 0.7, animation: "bt-pulse 1.4s ease-in-out infinite" }} />
        Calculating dividend income…
      </div>
    );
  }
  if (err || !data || !data.available) {
    return <p style={{ fontSize: "13px", color: "var(--text-tertiary)", fontStyle: "italic", textAlign: "center", padding: "30px" }}>Couldn&apos;t load income data right now. Try again in a moment.</p>;
  }
  if (!data.hasHoldings) {
    return <p style={{ fontSize: "13px", color: "var(--text-tertiary)", fontStyle: "italic", textAlign: "center", padding: "30px" }}>Add holdings to project your dividend income.</p>;
  }

  const holdings = data.holdings ?? [];
  const months = data.months ?? [];
  const maxMonth = Math.max(1, ...months.map((m) => m.amount));
  const noPayers = (data.payerCount ?? 0) === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <style>{`@keyframes bt-inc-grow{from{transform:scaleY(0)}to{transform:scaleY(1)}} .bt-inc-bar{transform-origin:bottom;animation:bt-inc-grow .6s cubic-bezier(0.16,1,0.3,1) both}`}</style>

      {/* Hero */}
      <div style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(37,99,235,0.05))", border: "1px solid rgba(16,185,129,0.22)", borderRadius: "var(--radius-lg)", padding: "18px 20px" }}>
        {noPayers ? (
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>No dividend payers detected</div>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "4px 0 0", lineHeight: 1.5 }}>None of your holdings report a dividend yield — your return here is coming from price growth, not income. That&apos;s common for growth-tilted portfolios.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#34d399", display: "flex", alignItems: "center" }}>
                Projected annual income<Hint text="Estimated forward dividends: each holding's current market value × its trailing dividend yield. A forward run-rate, not a guarantee — companies can cut or raise payouts." />
              </div>
              <div style={{ fontSize: "30px", fontWeight: 800, fontFamily: "var(--font-display)", letterSpacing: "-1px", color: "var(--text-primary)", lineHeight: 1.1, marginTop: "2px" }}>{fmt(data.projectedAnnual ?? 0)}</div>
              <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "2px" }}>≈ {fmt(data.monthlyAvg ?? 0)}/mo · from {data.payerCount} payer{data.payerCount === 1 ? "" : "s"}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Portfolio yield</div>
              <div style={{ fontSize: "24px", fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{(data.portfolioYield ?? 0).toFixed(2)}%</div>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>on total value</div>
            </div>
          </div>
        )}
      </div>

      {/* Dividend calendar — upcoming + recent (one-tap logging) */}
      {events && (events.upcoming.length > 0 || events.recent.length > 0) && (
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 18px" }}>
          <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px", display: "flex", alignItems: "center" }}>
            Dividend calendar<Hint text="Upcoming and recently-paid dividends for your holdings, with the cash estimated from your share count × the declared per-share amount. We can't see your brokerage, so tap 'Log' to record a payout when it lands." />
          </h2>
          <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "0 0 12px" }}>Estimated from declared per-share amounts · dates from FMP</p>

          {events.upcoming.length > 0 && (
            <div style={{ marginBottom: events.recent.length > 0 ? "14px" : 0 }}>
              <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", marginBottom: "6px" }}>Upcoming</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {events.upcoming.map((ev) => (
                  <div key={`u-${ev.ticker}-${ev.exDate}`} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 11px", borderRadius: "8px", background: "rgba(37,99,235,0.05)", border: "1px solid rgba(37,99,235,0.16)" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "12.5px", color: "var(--text-primary)", minWidth: "52px" }}>{ev.ticker}</span>
                    <span style={{ fontSize: "11.5px", color: "var(--text-tertiary)", flex: 1 }}>{ev.payDate ? `pays ${fmtDate(ev.payDate)}` : `ex-date ${fmtDate(ev.exDate)}`}</span>
                    <span style={{ fontSize: "12.5px", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-secondary)" }}>~{fmt(ev.estAmount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {events.recent.length > 0 && (
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", marginBottom: "6px" }}>Recently paid — log it</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {events.recent.map((ev) => {
                  const key = `${ev.ticker}-${ev.payDate ?? ev.exDate}`;
                  const isLogged = logged[key];
                  return (
                    <div key={`r-${key}`} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 11px", borderRadius: "8px", background: isLogged ? "rgba(16,185,129,0.06)" : "var(--bg-base)", border: `1px solid ${isLogged ? "rgba(16,185,129,0.2)" : "var(--border-subtle)"}` }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "12.5px", color: "var(--text-primary)", minWidth: "52px" }}>{ev.ticker}</span>
                      <span style={{ fontSize: "11.5px", color: "var(--text-tertiary)", flex: 1 }}>{ev.payDate ? `paid ${fmtDate(ev.payDate)}` : `ex-date ${fmtDate(ev.exDate)}`}</span>
                      <span style={{ fontSize: "12.5px", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-secondary)" }}>~{fmt(ev.estAmount)}</span>
                      <button
                        type="button"
                        onClick={() => logDividend(ev)}
                        disabled={isLogged || logging === key}
                        style={{ flexShrink: 0, padding: "5px 11px", borderRadius: "7px", fontSize: "11px", fontWeight: 600, fontFamily: "var(--font-body)", cursor: isLogged ? "default" : "pointer",
                          border: `1px solid ${isLogged ? "rgba(16,185,129,0.3)" : "rgba(16,185,129,0.35)"}`,
                          background: isLogged ? "transparent" : "rgba(16,185,129,0.12)", color: isLogged ? "#34d399" : "#34d399" }}>
                        {isLogged ? "Logged ✓" : logging === key ? "…" : `Log ${fmt(ev.estAmount)}`}
                      </button>
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "8px" }}>One tap records it to your cash ledger as a dividend (editable on the Overview tab). Estimates assume the full position was held through the ex-date.</p>
            </div>
          )}
        </div>
      )}

      {/* Per-holding income */}
      {holdings.length > 0 && (
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 18px" }}>
          <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 12px", display: "flex", alignItems: "center" }}>
            Income by holding<Hint text="Yield-on-cost compares the income to what you originally paid — it climbs over time as a company raises its dividend, even though the headline yield on today's price looks flat." />
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
              <thead>
                <tr style={{ color: "var(--text-tertiary)", textAlign: "right", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  <th style={{ textAlign: "left", fontWeight: 600, padding: "4px 8px" }}>Ticker</th>
                  <th style={{ fontWeight: 600, padding: "4px 8px" }}>Yield</th>
                  <th style={{ fontWeight: 600, padding: "4px 8px" }}>Yield/cost</th>
                  <th style={{ fontWeight: 600, padding: "4px 8px" }}>Annual</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
                  <tr key={h.ticker} style={{ borderTop: "1px solid var(--border-subtle)", textAlign: "right" }}>
                    <td style={{ textAlign: "left", padding: "7px 8px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)" }}>{h.ticker}</td>
                    <td style={{ padding: "7px 8px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{h.yieldPct.toFixed(2)}%</td>
                    <td style={{ padding: "7px 8px", fontFamily: "var(--font-mono)", color: h.yieldOnCostPct != null && h.yieldOnCostPct > h.yieldPct ? "var(--green)" : "var(--text-tertiary)" }}>{h.yieldOnCostPct != null ? `${h.yieldOnCostPct.toFixed(2)}%` : "—"}</td>
                    <td style={{ padding: "7px 8px", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-primary)" }}>{fmt(h.annualIncome)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(data.topPayerPct ?? 0) >= 50 && holdings[0] && (
            <div style={{ marginTop: "12px", padding: "9px 12px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "var(--radius-md)", fontSize: "11.5px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              <strong style={{ color: "#f59e0b" }}>{data.topPayerPct}% of your income comes from {holdings[0].ticker}.</strong> A cut there would hit your cash flow hard — worth diversifying your income sources.
            </div>
          )}
          {(data.coveragePct ?? 100) < 100 && (
            <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "10px" }}>Based on {data.coveragePct}% of value with dividend data. Funds and uncovered tickers are excluded from the projection.</p>
          )}
        </div>
      )}

      {/* Actual dividends received */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 18px" }}>
        <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px", display: "flex", alignItems: "center" }}>
          Dividends received<Hint text="Actual dividend cash logged to this portfolio over the last 12 months (from your cash activity). Log dividends as they arrive to track real income vs the projection." />
        </h2>
        <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "0 0 14px" }}>Trailing 12 months · <strong style={{ color: "var(--text-secondary)" }}>{fmt(data.trailing12 ?? 0)}</strong></p>
        {data.hasActual ? (
          <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "90px" }}>
            {months.map((m, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", height: "100%", justifyContent: "flex-end" }}>
                <div title={`${m.month}: ${fmt(m.amount)}`} className="bt-inc-bar" style={{ width: "100%", maxWidth: "26px", height: `${Math.max(2, (m.amount / maxMonth) * 70)}px`, background: m.amount > 0 ? "linear-gradient(180deg,#34d399,#10b981)" : "rgba(148,163,184,0.15)", borderRadius: "3px 3px 0 0", animationDelay: `${i * 40}ms` }} />
                <span style={{ fontSize: "8.5px", color: "var(--text-muted)" }}>{m.month}</span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: "12px", color: "var(--text-tertiary)", fontStyle: "italic", lineHeight: 1.5 }}>
            No dividends logged yet. When a payout lands, add it via <strong style={{ color: "var(--text-secondary)" }}>Add Cash Activity → Dividend</strong> on the Overview tab — then this fills in and you can track real income against the projection above.
          </p>
        )}
      </div>
    </div>
  );
}
