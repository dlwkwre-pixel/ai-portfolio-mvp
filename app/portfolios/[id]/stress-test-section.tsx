"use client";

import { useState } from "react";

type HoldingInput = {
  ticker: string;
  company_name: string | null;
  market_value: number;
  weight_pct: number;
};

type ScenarioResult = {
  id: string;
  label: string;
  estimatedLoss: string;
  estimatedDollars: string;
  exposed: string[];
  hedges: string[];
  summary: string;
};

type StressTestResult = {
  scenarios: ScenarioResult[];
  overallRisk?: string;
};

type Props = {
  holdings: HoldingInput[];
  totalValue: number;
  cashBalance: number;
};

const SCENARIO_ICONS: Record<string, React.ReactNode> = {
  tech_crash: (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clipRule="evenodd" />
    </svg>
  ),
  rate_spike: (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
    </svg>
  ),
  recession: (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  ),
  inflation: (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
      <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.028 2.353 1.118V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.028-2.354-1.118V5z" clipRule="evenodd" />
    </svg>
  ),
};

const SCENARIO_COLORS: Record<string, string> = {
  tech_crash: "#f59e0b",
  rate_spike: "#f87171",
  recession: "#94a3b8",
  inflation: "#fb923c",
};

export default function StressTestSection({ holdings, totalValue, cashBalance }: Props) {
  const [result, setResult] = useState<StressTestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runStressTest() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolios/stress-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdings, totalValue, cashBalance }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Request failed");
      }
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: "rgba(248,113,113,0.03)", border: "1px solid rgba(248,113,113,0.1)", borderRadius: "var(--radius-lg)", padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="#f87171">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.1px" }}>Portfolio Stress Test</h2>
        </div>
        <button
          onClick={runStressTest}
          disabled={loading || holdings.length === 0}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "7px 14px",
            fontSize: "12px",
            fontWeight: 500,
            color: loading ? "var(--text-muted)" : "#f87171",
            background: loading ? "rgba(255,255,255,0.03)" : "rgba(248,113,113,0.08)",
            border: `1px solid ${loading ? "var(--border-subtle)" : "rgba(248,113,113,0.25)"}`,
            borderRadius: "var(--radius-md)",
            cursor: loading || holdings.length === 0 ? "not-allowed" : "pointer",
            fontFamily: "var(--font-body)",
            transition: "var(--transition-base)",
          }}
        >
          {loading ? (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              Analyzing…
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
              </svg>
              Run stress test
            </>
          )}
        </button>
      </div>

      <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: result ? "16px" : "0", lineHeight: 1.5 }}>
        Grok estimates your portfolio&apos;s exposure to 4 macro shock scenarios: tech selloff, rate spike, recession, and stagflation.
      </p>

      {error && (
        <div style={{ marginTop: "12px", padding: "10px 14px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: "var(--radius-md)", fontSize: "12px", color: "var(--red)" }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {result.overallRisk && (
            <div style={{ padding: "10px 14px", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: "var(--radius-md)" }}>
              <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--red)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Biggest vulnerability</span>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.5 }}>{result.overallRisk}</p>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            {result.scenarios.map((s) => {
              const color = SCENARIO_COLORS[s.id] ?? "#94a3b8";
              const icon = SCENARIO_ICONS[s.id];
              return (
                <div
                  key={s.id}
                  style={{
                    padding: "12px",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                    <span style={{ color, flexShrink: 0 }}>{icon}</span>
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-primary)" }}>{s.label}</span>
                  </div>

                  <div style={{ display: "flex", gap: "6px", marginBottom: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, fontFamily: "var(--font-mono)", color }}>
                      {s.estimatedLoss}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                      {s.estimatedDollars}
                    </span>
                  </div>

                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.55, marginBottom: "8px" }}>{s.summary}</p>

                  {s.exposed?.length > 0 && (
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      {s.exposed.map((t) => (
                        <span key={t} style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color, background: `rgba(${color === "#f59e0b" ? "245,158,11" : color === "var(--red)" ? "248,113,113" : color === "#fb923c" ? "251,146,60" : "148,163,184"},0.1)`, border: `1px solid ${color}30`, padding: "1px 5px", borderRadius: "var(--radius-sm)" }}>
                          {t}
                        </span>
                      ))}
                      {s.hedges?.length > 0 && s.hedges.map((t) => (
                        <span key={t} style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--green)", background: "rgba(0,211,149,0.08)", border: "1px solid rgba(0,211,149,0.2)", padding: "1px 5px", borderRadius: "var(--radius-sm)" }}>
                          {t} ✓
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p style={{ fontSize: "10px", color: "var(--text-muted)" }}>
            Estimates only. Not financial advice. Based on approximate sector correlations.
          </p>
        </div>
      )}
    </div>
  );
}
