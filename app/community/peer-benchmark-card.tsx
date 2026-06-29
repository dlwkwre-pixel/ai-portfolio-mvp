"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import InfoTooltip from "@/app/components/info-tooltip";

type Stat = { you: number; median: number; percentile: number };
type Benchmark = {
  available: boolean;
  hasData?: boolean;
  userCount: number;
  positions?: Stat;
  cash?: Stat;
  overlap?: { ticker: string; pct: number }[];
  notHeld?: { ticker: string; pct: number }[];
};

function ordinal(pct: number): string {
  if (pct >= 90) return "top 10%";
  if (pct >= 75) return "top 25%";
  if (pct >= 50) return "above the median";
  if (pct >= 25) return "below the median";
  return "bottom 25%";
}

function PercentileBar({ label, stat, unit, hint, higherWord, lowerWord }: {
  label: string; stat: Stat; unit: string; hint: string; higherWord: string; lowerWord: string;
}) {
  const desc = stat.percentile >= 50 ? higherWord : lowerWord;
  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid var(--border-subtle)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <span style={{ fontSize: "12px", color: "var(--text-secondary)", display: "flex", alignItems: "center" }}>
          {label}
          <InfoTooltip text={hint} align="start" width={240}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "14px", height: "14px", borderRadius: "50%", marginLeft: "5px", cursor: "help", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", color: "var(--accent, #818cf8)", fontSize: "9px", fontWeight: 700 }}>?</span>
          </InfoTooltip>
        </span>
        <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-primary)", fontWeight: 700 }}>
          {stat.you}{unit} <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>· typ. {stat.median}{unit}</span>
        </span>
      </div>
      <div style={{ position: "relative", height: "7px", borderRadius: "4px", background: "rgba(148,163,184,0.14)", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.max(2, Math.min(100, stat.percentile))}%`, background: "linear-gradient(90deg,#2563eb,#7c3aed)", borderRadius: "4px", transition: "width .6s cubic-bezier(0.16,1,0.3,1)" }} />
        {/* median marker */}
        <div style={{ position: "absolute", left: "50%", top: "-2px", bottom: "-2px", width: "1.5px", background: "rgba(255,255,255,0.35)" }} />
      </div>
      <div style={{ fontSize: "10.5px", color: "var(--text-tertiary)", marginTop: "5px" }}>
        You&apos;re {ordinal(stat.percentile)} — {desc}
      </div>
    </div>
  );
}

export default function PeerBenchmarkCard() {
  const [data, setData] = useState<Benchmark | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/peer-benchmark")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Benchmark) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="bt-card" style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: "10px", color: "var(--text-muted)", fontSize: "12px" }}>
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--brand-blue)", opacity: 0.7, animation: "bt-pulse 1.4s ease-in-out infinite" }} />
        Comparing you to the community…
      </div>
    );
  }
  if (!data || !data.available || !data.hasData || !data.positions || !data.cash) return null;

  return (
    <div className="bt-card" style={{ padding: "16px 18px" }}>
      <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "2px", display: "flex", alignItems: "center" }}>
        🪞 How you compare
        <InfoTooltip text="Anonymized comparison against other BuyTune investors. We only ever use aggregate numbers — never anyone's identity, balances, or dollar amounts." align="start" width={250}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "14px", height: "14px", borderRadius: "50%", marginLeft: "6px", cursor: "help", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", color: "var(--accent, #818cf8)", fontSize: "9px", fontWeight: 700 }}>?</span>
        </InfoTooltip>
      </div>
      <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "8px" }}>Against {data.userCount.toLocaleString()} investors · anonymized, no balances</div>

      <PercentileBar
        label="Positions held"
        stat={data.positions}
        unit=""
        higherWord="more diversified than most"
        lowerWord="more concentrated than most"
        hint="How many holdings you own vs the community. More positions generally means more diversification (to a point)."
      />
      <PercentileBar
        label="Cash allocation"
        stat={data.cash}
        unit="%"
        higherWord="holding more cash than most"
        lowerWord="more fully invested than most"
        hint="Your cash as a % of invested cost basis + cash, vs the community. Higher means more dry powder; lower means more fully invested. Uses cost basis, not live value."
      />

      {(data.overlap?.length || data.notHeld?.length) ? (
        <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {data.overlap && data.overlap.length > 0 && (
            <div style={{ fontSize: "11.5px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              You hold{" "}
              {data.overlap.map((t, i) => (
                <span key={t.ticker}>
                  <Link href={`/research?ticker=${encodeURIComponent(t.ticker)}`} style={{ color: "var(--brand-blue)", fontFamily: "var(--font-mono)", fontWeight: 700, textDecoration: "none" }}>${t.ticker}</Link>
                  <span style={{ color: "var(--text-muted)" }}> ({t.pct}%)</span>
                  {i < data.overlap!.length - 1 ? ", " : ""}
                </span>
              ))}
              {" "}— widely-held community favorites.
            </div>
          )}
          {data.notHeld && data.notHeld.length > 0 && (
            <div style={{ fontSize: "11.5px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Popular names you don&apos;t own:{" "}
              {data.notHeld.map((t, i) => (
                <span key={t.ticker}>
                  <Link href={`/research?ticker=${encodeURIComponent(t.ticker)}`} style={{ color: "var(--accent, #818cf8)", fontFamily: "var(--font-mono)", fontWeight: 700, textDecoration: "none" }}>${t.ticker}</Link>
                  <span style={{ color: "var(--text-muted)" }}> ({t.pct}%)</span>
                  {i < data.notHeld!.length - 1 ? ", " : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "12px" }}>
        Comparison is a mirror, not a recommendation. Different goals call for different portfolios.
      </p>
    </div>
  );
}
