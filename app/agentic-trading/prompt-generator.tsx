"use client";

import { useMemo, useState } from "react";

type Portfolio = { id: string; name: string };
type Strategy = { id: string; name: string };

const DAY_OPTIONS = [
  { value: "weekdays", label: "Weekdays (Mon–Fri)" },
  { value: "daily", label: "Every day" },
];

function fmtTime12h(t: string): string {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${period}`;
}

export default function PromptGenerator({ portfolios, strategies }: { portfolios: Portfolio[]; strategies: Strategy[] }) {
  const [strategyName, setStrategyName] = useState(strategies[0]?.name ?? "");
  const [portfolioName, setPortfolioName] = useState(portfolios[0]?.name ?? "");
  const [brokerage, setBrokerage] = useState("Robinhood");
  const [account, setAccount] = useState("");
  const [days, setDays] = useState("weekdays");
  const [morningTime, setMorningTime] = useState("10:00");
  const [includeAfternoon, setIncludeAfternoon] = useState(true);
  const [afternoonTime, setAfternoonTime] = useState("15:45");
  const [requireApproval, setRequireApproval] = useState(true);
  const [copied, setCopied] = useState(false);

  const dayLabel = DAY_OPTIONS.find((d) => d.value === days)?.label.split(" (")[0] ?? "Weekdays";

  const prompt = useMemo(() => {
    const times = [fmtTime12h(morningTime), includeAfternoon ? fmtTime12h(afternoonTime) : null].filter(Boolean).join(" and ");
    const accountLine = account.trim() ? `account ${account.trim()}` : "my connected account";
    const approvalLine = requireApproval
      ? `First run only: message me with the candidate, reasoning, and proposed size before executing, and wait for my approval. After that, proceed autonomously.`
      : `Proceed autonomously from the first run — no confirmation needed before executing, unless something looks genuinely wrong (e.g. an order that doesn't match the strategy's own rules).`;

    return `${dayLabel} at ${times}: connect to BuyTune's MCP tools and ${brokerage.trim() || "[your brokerage]"}'s agentic trading tools for ${accountLine}.

Call get_trading_routine() and follow it. Use get_strategies() to find "${strategyName || "[your strategy name]"}" and apply it to the portfolio named "${portfolioName || "[your portfolio name]"}".

${approvalLine}`;
  }, [dayLabel, morningTime, includeAfternoon, afternoonTime, brokerage, account, strategyName, portfolioName, requireApproval]);

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: "7px", border: "1px solid var(--card-border)",
    background: "var(--bg-elevated, rgba(255,255,255,0.03))", color: "var(--text-primary)", fontSize: "12.5px",
    fontFamily: "var(--font-body)", outline: "none",
  };
  const labelStyle: React.CSSProperties = { fontSize: "11px", fontWeight: 600, color: "var(--text-tertiary)", marginBottom: "4px", display: "block" };

  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 18px", marginTop: "10px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
        <div>
          <label style={labelStyle}>Strategy</label>
          {strategies.length > 0 ? (
            <select value={strategyName} onChange={(e) => setStrategyName(e.target.value)} style={inputStyle}>
              {strategies.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          ) : (
            <input value={strategyName} onChange={(e) => setStrategyName(e.target.value)} placeholder="Strategy name" style={inputStyle} />
          )}
        </div>
        <div>
          <label style={labelStyle}>Portfolio</label>
          {portfolios.length > 0 ? (
            <select value={portfolioName} onChange={(e) => setPortfolioName(e.target.value)} style={inputStyle}>
              {portfolios.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
          ) : (
            <input value={portfolioName} onChange={(e) => setPortfolioName(e.target.value)} placeholder="Portfolio name" style={inputStyle} />
          )}
        </div>
        <div>
          <label style={labelStyle}>Brokerage</label>
          <input value={brokerage} onChange={(e) => setBrokerage(e.target.value)} placeholder="e.g. Robinhood" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Account (optional)</label>
          <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="e.g. ending 6129" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Days</label>
          <select value={days} onChange={(e) => setDays(e.target.value)} style={inputStyle}>
            {DAY_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Run time</label>
          <input type="time" value={morningTime} onChange={(e) => setMorningTime(e.target.value)} style={inputStyle} />
        </div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "12px", color: "var(--text-secondary)", marginBottom: includeAfternoon ? "8px" : "12px", cursor: "pointer" }}>
        <input type="checkbox" checked={includeAfternoon} onChange={(e) => setIncludeAfternoon(e.target.checked)} />
        Add a second run (e.g. an afternoon check on open positions)
      </label>
      {includeAfternoon && (
        <div style={{ marginBottom: "12px", maxWidth: "160px" }}>
          <label style={labelStyle}>Second run time</label>
          <input type="time" value={afternoonTime} onChange={(e) => setAfternoonTime(e.target.value)} style={inputStyle} />
        </div>
      )}

      <label style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "12px", color: "var(--text-secondary)", marginBottom: "14px", cursor: "pointer" }}>
        <input type="checkbox" checked={requireApproval} onChange={(e) => setRequireApproval(e.target.checked)} />
        Require my approval before the first trade (recommended)
      </label>

      <div style={{ position: "relative" }}>
        <pre style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-primary)", lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap", background: "var(--bg-elevated, rgba(255,255,255,0.04))", border: "1px solid var(--card-border)", borderRadius: "8px", padding: "12px 14px" }}>
          {prompt}
        </pre>
        <button type="button" onClick={copyPrompt} style={{ position: "absolute", top: "8px", right: "8px", fontSize: "11px", fontWeight: 700, padding: "5px 10px", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--bg-surface)", color: "var(--text-primary)", cursor: "pointer", fontFamily: "var(--font-body)" }}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "8px" }}>
        Paste this as the prompt for a recurring scheduled task in Claude (e.g. Claude Desktop&apos;s Cowork).
      </p>
    </div>
  );
}
