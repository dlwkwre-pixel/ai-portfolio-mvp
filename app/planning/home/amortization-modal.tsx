"use client";

// Full-screen amortization schedule modal — split out of home-client.tsx so its table
// markup doesn't ship in the initial /planning/home bundle. Receives pre-computed data
// as props (amortStats/amortization are already built in the parent from the shared
// buildAmortization() call that also feeds the always-visible summary section) plus
// export callbacks — no calculation logic lives here, so nothing needs to move back.

type AmorRow = {
  year: number;
  balance: number;
  annualPrincipal: number;
  annualInterest: number;
  cumulativeInterest: number;
  homeValue: number;
  equity: number;
  equityPct: number;
  isCrossover: boolean;
};

type AmorStats = {
  totalInterest: number;
  crossoverYear: number | null;
  equity20Year: number | null;
  equity50Year: number | null;
  equity80Year: number | null;
  monthlyPayment: number;
};

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const fmtK = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000) return "$" + (n / 1000).toFixed(0) + "K";
  return "$" + Math.round(n);
};

export default function AmortizationModal({
  scenarioName, purchasePrice, downPayment, mortgageRate, loanTermYears, holdYears,
  amortStats, amortization,
  onClose, onExportPDF, onExportCSV,
}: {
  scenarioName: string;
  purchasePrice: number;
  downPayment: number;
  mortgageRate: number;
  loanTermYears: number;
  holdYears: number;
  amortStats: AmorStats;
  amortization: AmorRow[];
  onClose: () => void;
  onExportPDF: () => void;
  onExportCSV: () => void;
}) {
  return (
    <div className="amort-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="amort-modal">

        {/* Header */}
        <div className="amort-modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(14,165,160,0.12)", border: "1px solid rgba(14,165,160,0.22)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#60a5fa" strokeWidth="1.6"><path d="M3 3h14v14H3zM3 7h14M7 7v10M11 7v10" strokeLinecap="round"/></svg>
            </div>
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#0ea5a0", fontFamily: "var(--font-mono)", marginBottom: "2px" }}>Amortization Schedule</div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#f1f5f9", fontFamily: "var(--font-display)", letterSpacing: "-0.3px" }}>{scenarioName}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "28px", marginRight: "12px" }}>
            {[
              { label: "Purchase Price", value: fmt(purchasePrice) },
              { label: "Rate / Term", value: `${mortgageRate}% · ${loanTermYears} yr` },
              { label: "Down Payment", value: fmt(downPayment) },
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign: "right" }}>
                <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>{label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: "#94a3b8", marginTop: "1px" }}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={onExportPDF} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "8px", border: "1px solid rgba(63,174,74,0.3)", background: "rgba(63,174,74,0.08)", color: "oklch(0.72 0.18 195)", fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", transition: "background 0.15s" }}>
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="14" height="14" rx="2"/><path d="M7 8h3M7 11h6M7 14h4" strokeLinecap="round"/></svg>
              Export PDF
            </button>
            <button onClick={onExportCSV} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "8px", border: "1px solid rgba(14,165,160,0.28)", background: "rgba(14,165,160,0.08)", color: "#3fc9c3", fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", transition: "background 0.15s" }}>
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 14l6 5 6-5M10 2v17" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Export to Excel
            </button>
            <button onClick={onClose} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", borderRadius: "8px", border: "1px solid var(--line-008)", background: "transparent", color: "var(--text-tertiary)", fontSize: "18px", cursor: "pointer", transition: "color 0.15s, background 0.15s" }}>
              ×
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid var(--line-006)" }}>
          {[
            { label: "Monthly P&I", value: fmt(amortStats.monthlyPayment), sub: "principal + interest", accent: "#e2e8f0" },
            { label: "Total Interest Cost", value: fmtK(amortStats.totalInterest), sub: "over full loan term", accent: "oklch(0.68 0.18 25)" },
            { label: "More Going to You", value: amortStats.crossoverYear != null ? `Year ${amortStats.crossoverYear}` : "—", sub: "principal beats interest", accent: "#0ea5a0" },
            { label: "Halfway Home", value: amortStats.equity50Year != null ? `Year ${amortStats.equity50Year}` : "—", sub: "loan half paid off", accent: "#00d395" },
          ].map(({ label, value, sub, accent }, i) => (
            <div key={label} style={{ padding: "14px 18px", borderRight: i < 3 ? "1px solid rgba(255,255,255,0.06)" : undefined }}>
              <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-tertiary)", marginBottom: "5px", fontFamily: "var(--font-body)" }}>{label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 700, color: accent, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: "10px", color: "#334155", marginTop: "3px", fontFamily: "var(--font-body)" }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="amort-modal-body">
          <table className="amort-modal-table">
            <colgroup>
              <col style={{ width: "56px" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "9%" }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: "left", paddingLeft: "20px" }}>Year</th>
                <th>Loan Balance</th>
                <th>Principal</th>
                <th>Interest</th>
                <th>Total Interest</th>
                <th>Home Value</th>
                <th>Equity</th>
                <th>Equity %</th>
              </tr>
            </thead>
            <tbody>
              {amortization.map((row, idx) => {
                const isHoldYear = row.year === holdYears;
                const isCrossover = row.isCrossover;
                const isEven = idx % 2 === 0;
                const rowBg = isHoldYear
                  ? "rgba(14,165,160,0.09)"
                  : isCrossover
                  ? "rgba(0,211,149,0.06)"
                  : isEven ? "rgba(255,255,255,0.01)" : "transparent";
                return (
                  <tr key={row.year} style={{ background: rowBg, borderLeft: isHoldYear ? "3px solid #0ea5a0" : isCrossover ? "3px solid rgba(0,211,149,0.4)" : "3px solid transparent" }}>
                    <td style={{ textAlign: "left", paddingLeft: "17px", color: isHoldYear ? "#3fc9c3" : "#475569", fontWeight: isHoldYear ? 700 : 400 }}>
                      {row.year}{isHoldYear ? " ★" : ""}
                    </td>
                    <td style={{ color: "var(--text-tertiary)" }}>{row.balance < 100 ? <span style={{ color: "#1e3a5f" }}>Paid off</span> : fmtK(row.balance)}</td>
                    <td style={{ color: "#0ea5a0" }}>{row.year === 0 ? <span style={{ color: "#1e3a5f" }}>—</span> : fmtK(row.annualPrincipal)}</td>
                    <td style={{ color: "oklch(0.68 0.16 25)" }}>{row.year === 0 ? <span style={{ color: "#1e3a5f" }}>—</span> : fmtK(row.annualInterest)}</td>
                    <td style={{ color: "var(--text-tertiary)" }}>{fmtK(row.cumulativeInterest)}</td>
                    <td style={{ color: "var(--text-tertiary)" }}>{fmtK(row.homeValue)}</td>
                    <td style={{ color: "var(--green)", fontWeight: 600 }}>{fmtK(row.equity)}</td>
                    <td>
                      <span style={{
                        display: "inline-block", padding: "1px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: 700,
                        background: row.equityPct >= 50 ? "rgba(0,211,149,0.1)" : row.equityPct >= 20 ? "rgba(14,165,160,0.1)" : "rgba(148,163,184,0.06)",
                        color: row.equityPct >= 50 ? "#00d395" : row.equityPct >= 20 ? "#3fc9c3" : "#475569",
                      }}>
                        {row.year === 0 ? `${row.equityPct.toFixed(0)}%` : `${row.equityPct.toFixed(1)}%`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ padding: "10px 20px 14px", borderTop: "1px solid var(--line-006)", display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
          {[
            { dot: "#0ea5a0", text: "★ = your planned hold year" },
            { dot: "rgba(0,211,149,0.5)", text: "Green border = crossover (principal > interest)" },
            { dot: "#00d395", text: "Equity % turns green at 50%+" },
          ].map(({ dot, text }) => (
            <div key={text} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: dot, flexShrink: 0 }} />
              <span style={{ fontSize: "10px", color: "#334155", fontFamily: "var(--font-body)" }}>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
