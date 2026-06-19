"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useTickerLookup } from "@/app/components/ticker-quick-look";

type PrepHolding = {
  ticker: string;
  company_name: string | null;
  total_value: number;
  weight_pct: number;
  portfolio_id: string;
};

type PrepItem = {
  id: string;
  label: string;
  detail: string;
  type: "earnings" | "risk" | "action" | "info";
  href: string | null;
  cta: string | null;
  ticker: string | null;
};

type PrepData = {
  checklist: PrepItem[];
  holdings: PrepHolding[];
  total_value: number;
  cash_pct: number;
  open_recs_count: number;
  earnings_count: number;
  week_of: string;
  first_portfolio_id: string | null;
};

function isFriSatSun(): boolean {
  const day = new Date().getDay();
  return day === 5 || day === 6 || day === 0;
}

const TYPE_ACCENT: Record<string, string> = {
  earnings: "#f59e0b",
  risk: "var(--red)",
  action: "rgba(96,165,250,0.9)",
  info: "rgba(148,163,184,0.5)",
};

function formatValue(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

export default function MondayPrepCard() {
  const [data, setData] = useState<PrepData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const { open } = useTickerLookup();

  const STORAGE_KEY = `bt-monday-prep-${new Date().toISOString().split("T")[0]}`;

  useEffect(() => {
    if (!isFriSatSun()) { setLoading(false); return; }
    setShow(true);

    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as string[];
      setChecked(new Set(stored));
    } catch {}

    // Stagger 3s after week-ahead to avoid simultaneous Gemini calls
    const t = setTimeout(() => {
      fetch("/api/market/monday-prep")
        .then((r) => r.json())
        .then((d) => {
          if (d?.checklist) setData(d);
          else setError(true);
        })
        .catch(() => setError(true))
        .finally(() => setLoading(false));
    }, 3000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!show || error) return null;

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  // Every rendered checklist item is checkable, so the progress counts them all.
  const allItems = data?.checklist ?? [];
  const doneCount = allItems.filter((i) => checked.has(i.id)).length;
  const totalCount = allItems.length;
  const allDone = totalCount > 0 && doneCount === totalCount;

  const accentColor = allDone ? "rgba(74,222,128,0.85)" : "rgba(96,165,250,0.85)";
  const borderColor = allDone ? "rgba(34,197,94,0.2)" : "rgba(96,165,250,0.12)";
  const bgColor = allDone ? "rgba(34,197,94,0.03)" : "rgba(37,99,235,0.03)";

  return (
    <div style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: "var(--radius-lg)", padding: "14px 16px", transition: "all 0.3s ease" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: loading ? "0" : "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill={accentColor} style={{ transition: "fill 0.3s" }}>
            {allDone
              ? <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              : <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
            }
          </svg>
          <span style={{ fontSize: "11px", fontWeight: 600, color: accentColor, letterSpacing: "0.04em", textTransform: "uppercase", transition: "color 0.3s" }}>
            {allDone ? "Ready for Monday" : "Prepare for Monday"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {data && totalCount > 0 && (
            <span style={{ fontSize: "10px", color: doneCount > 0 ? "var(--text-secondary)" : "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
              {doneCount}/{totalCount}
            </span>
          )}
          {data && (
            <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>Week of {data.week_of}</span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {data && totalCount > 0 && (
        <div style={{ height: "2px", background: "var(--surface-006)", borderRadius: "2px", marginBottom: "14px", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: "2px", background: allDone ? "var(--green)" : "rgba(96,165,250,0.6)", width: `${(doneCount / totalCount) * 100}%`, transition: "width 0.3s ease, background 0.3s ease" }} />
        </div>
      )}

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "rgba(96,165,250,0.5)", animation: "bt-pulse 1.2s ease-in-out infinite" }} />
          <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Preparing your Monday briefing...</span>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Holdings grid — tap to open quick-look */}
          {data.holdings.length > 0 && (
            <div style={{ marginBottom: "14px" }}>
              <p style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "8px" }}>
                Your Positions — Tap for Quick Look
              </p>
              <div className="bt-stagger" style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {data.holdings.map((h) => (
                  <button
                    type="button"
                    key={h.ticker}
                    onClick={() => open(h.ticker)}
                    className="bt-chip"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "5px 10px",
                      borderRadius: "var(--radius-md)",
                      background: "var(--surface-004)",
                      border: "1px solid var(--line-007)",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 600, color: "var(--text-primary)" }}>
                      {h.ticker}
                    </span>
                    <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>
                      {formatValue(h.total_value)}
                    </span>
                    {h.weight_pct >= 10 && (
                      <span style={{ fontSize: "9px", color: "rgba(96,165,250,0.7)", background: "rgba(96,165,250,0.08)", padding: "0 4px", borderRadius: "3px" }}>
                        {h.weight_pct.toFixed(0)}%
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Divider */}
          {data.holdings.length > 0 && (
            <div style={{ height: "1px", background: "var(--surface-005)", marginBottom: "12px" }} />
          )}

          {/* Contextual checklist */}
          <div className="bt-stagger" style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            {data.checklist.map((item) => {
              const done = checked.has(item.id);
              const isExpanded = expanded === item.id;
              const accent = TYPE_ACCENT[item.type] ?? TYPE_ACCENT.info;
              const hasAction = !!item.ticker || !!item.href;

              return (
                <div
                  key={item.id}
                  className="bt-prep-row"
                  style={{
                    borderRadius: "var(--radius-md)",
                    background: done ? "rgba(34,197,94,0.04)" : "var(--surface-004)",
                    border: `1px solid ${done ? "rgba(34,197,94,0.1)" : "var(--card-border)"}`,
                    overflow: "hidden",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "9px", padding: "8px 10px" }}>
                    {/* Checkbox */}
                    <button
                      type="button"
                      onClick={() => toggle(item.id)}
                      style={{
                        width: "15px",
                        height: "15px",
                        borderRadius: "4px",
                        border: `1.5px solid ${done ? "var(--green)" : "var(--border-strong)"}`,
                        background: done ? "rgba(34,197,94,0.15)" : "transparent",
                        cursor: "pointer",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.15s",
                      }}
                      aria-label={done ? "Mark incomplete" : "Mark complete"}
                    >
                      {done && (
                        <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="var(--green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>

                    {/* Accent dot */}
                    <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: accent, flexShrink: 0 }} />

                    {/* Label */}
                    <span
                      onClick={() => setExpanded(isExpanded ? null : item.id)}
                      style={{
                        flex: 1,
                        fontSize: "12px",
                        fontWeight: 500,
                        color: done ? "var(--text-muted)" : "var(--text-primary)",
                        textDecoration: done ? "line-through" : "none",
                        cursor: "pointer",
                        transition: "color 0.2s",
                        userSelect: "none",
                      }}
                    >
                      {item.label}
                    </span>

                    {/* Quick action — modal for tickers, link otherwise */}
                    {hasAction && !done && (
                      item.ticker ? (
                        <button
                          type="button"
                          onClick={() => open(item.ticker!)}
                          title={item.cta ?? ""}
                          style={{
                            flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                            width: "22px", height: "22px", borderRadius: "var(--radius-sm)",
                            background: "rgba(96,165,250,0.08)", color: "rgba(96,165,250,0.8)",
                            border: "none", cursor: "pointer", transition: "background 0.15s",
                          }}
                        >
                          <svg width="8" height="8" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                          </svg>
                        </button>
                      ) : (
                        <Link
                          href={item.href!}
                          title={item.cta ?? ""}
                          style={{
                            flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                            width: "22px", height: "22px", borderRadius: "var(--radius-sm)",
                            background: "rgba(96,165,250,0.08)", color: "rgba(96,165,250,0.8)",
                            textDecoration: "none", transition: "background 0.15s",
                          }}
                        >
                          <svg width="8" height="8" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                          </svg>
                        </Link>
                      )
                    )}

                    {/* Expand chevron */}
                    {item.detail && (
                      <button
                        type="button"
                        onClick={() => setExpanded(isExpanded ? null : item.id)}
                        style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px", display: "flex", alignItems: "center" }}
                      >
                        <svg width="8" height="8" viewBox="0 0 20 20" fill="currentColor" style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ padding: "0 10px 10px 34px", borderTop: "1px solid var(--line-004)" }}>
                      <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.6, paddingTop: "8px", marginBottom: hasAction && item.cta ? "8px" : "0" }}>
                        {item.detail}
                      </p>
                      {hasAction && item.cta && (
                        item.ticker ? (
                          <button
                            type="button"
                            onClick={() => open(item.ticker!)}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: "4px",
                              fontSize: "11px", fontWeight: 600, color: accent,
                              padding: "4px 10px", borderRadius: "var(--radius-sm)",
                              background: "var(--surface-004)", border: "1px solid var(--line-007)",
                              cursor: "pointer",
                            }}
                          >
                            {item.cta}
                          </button>
                        ) : (
                          <Link
                            href={item.href!}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: "4px",
                              fontSize: "11px", fontWeight: 600, color: accent, textDecoration: "none",
                              padding: "4px 10px", borderRadius: "var(--radius-sm)",
                              background: "var(--surface-004)", border: "1px solid var(--line-007)",
                            }}
                          >
                            {item.cta}
                          </Link>
                        )
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
