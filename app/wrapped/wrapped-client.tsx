"use client";

import { useState } from "react";
import Link from "next/link";
import CountUp from "@/app/admin/count-up";
import { BrandGlyph } from "@/app/components/brand-mark";

export type WrappedStats = {
  year: number;
  totalValue: number;
  contributions: number;
  dividends: number;
  trades: number;
  aiRuns: number;
  decisions: number;
  xpThisYear: number;
  level: number;
  badges: number;
  longestStreak: number;
  holdings: number;
  portfolios: number;
  topGainer: { ticker: string; gainPct: number } | null;
  name: string;
};

type Slide = {
  key: string;
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  sub: string;
  emoji: string;
  hero?: boolean; // brand-gradient background
};

export default function WrappedClient({ stats }: { stats: WrappedStats }) {
  const [shared, setShared] = useState(false);

  const slides: Slide[] = [];
  if (stats.totalValue > 0) slides.push({ key: "value", label: "Portfolio value", value: stats.totalValue, prefix: "$", sub: `across ${stats.portfolios} portfolio${stats.portfolios !== 1 ? "s" : ""} · ${stats.holdings} holdings`, emoji: "💼", hero: true });
  if (stats.contributions > 0) slides.push({ key: "contrib", label: `Invested in ${stats.year}`, value: stats.contributions, prefix: "$", sub: "money you put to work this year", emoji: "📈" });
  if (stats.topGainer) slides.push({ key: "winner", label: "Your biggest winner", value: stats.topGainer.gainPct, prefix: "+", suffix: "%", sub: stats.topGainer.ticker, emoji: "🏆", hero: true });
  if (stats.dividends > 0) slides.push({ key: "div", label: "Dividends earned", value: stats.dividends, prefix: "$", sub: "passive income while you slept", emoji: "💸" });
  if (stats.aiRuns > 0) slides.push({ key: "ai", label: "AI analyses run", value: stats.aiRuns, sub: "times you asked Atlas to scan your portfolio", emoji: "🤖" });
  if (stats.decisions > 0) slides.push({ key: "journal", label: "Decisions journaled", value: stats.decisions, sub: "moves where you wrote down your reasoning", emoji: "📓" });
  if (stats.trades > 0) slides.push({ key: "trades", label: "Trades logged", value: stats.trades, sub: "buys and sells tracked", emoji: "🔁" });
  if (stats.xpThisYear > 0) slides.push({ key: "xp", label: `XP earned in ${stats.year}`, value: stats.xpThisYear, sub: `you're Level ${stats.level}`, emoji: "⚡", hero: true });
  if (stats.badges > 0) slides.push({ key: "badges", label: "Badges unlocked", value: stats.badges, sub: "achievements earned this year", emoji: "🎖️" });
  if (stats.longestStreak > 0) slides.push({ key: "streak", label: "Longest streak", value: stats.longestStreak, suffix: " days", sub: "showing up builds wealth", emoji: "🔥" });

  async function share() {
    const lines = [`My ${stats.year} on BuyTune:`];
    if (stats.totalValue > 0) lines.push(`💼 $${stats.totalValue.toLocaleString()} portfolio`);
    if (stats.topGainer) lines.push(`🏆 ${stats.topGainer.ticker} +${stats.topGainer.gainPct}%`);
    if (stats.contributions > 0) lines.push(`📈 $${stats.contributions.toLocaleString()} invested`);
    if (stats.xpThisYear > 0) lines.push(`⚡ Level ${stats.level}`);
    const text = lines.join("\n") + "\n\nTrack yours at buytune.io";
    try {
      if (navigator.share) { await navigator.share({ title: `My ${stats.year} in Review`, text }); return; }
      await navigator.clipboard.writeText(text);
      setShared(true);
      setTimeout(() => setShared(false), 2500);
    } catch { /* user cancelled */ }
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)", fontFamily: "var(--font-body)", padding: "calc(env(safe-area-inset-top) + 28px) 18px 80px" }}>
      <style>{`@keyframes bt-wr-in{from{opacity:0;transform:translateY(18px) scale(0.98)}to{opacity:1;transform:none}} .bt-wr-card{animation:bt-wr-in .55s cubic-bezier(0.16,1,0.3,1) both}`}</style>
      <div style={{ maxWidth: "460px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "14px" }}>

        {/* Header */}
        <div className="bt-wr-card" style={{ textAlign: "center", marginBottom: "4px" }}>
          <div style={{ display: "inline-flex", width: "44px", height: "44px", borderRadius: "13px", background: "var(--brand-gradient)", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
            <BrandGlyph size={26} stroke="#fff" strokeWidth={3.4} />
          </div>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--accent, #5fbf9a)" }}>{stats.year} in Review</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "26px", fontWeight: 800, letterSpacing: "-0.5px", margin: "4px 0 0", textTransform: "capitalize" }}>{stats.name}&apos;s year</h1>
        </div>

        {slides.length === 0 ? (
          <div className="bt-wr-card" style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-tertiary)", fontSize: "14px" }}>
            Not much to recap yet — add holdings, run an analysis, and check in daily. Your {stats.year} story is just getting started.
          </div>
        ) : slides.map((s, i) => (
          <div key={s.key} className="bt-wr-card" style={{
            animationDelay: `${i * 90}ms`,
            borderRadius: "20px", padding: "26px 24px", textAlign: "center",
            background: s.hero ? "linear-gradient(135deg, #0ea5a0 0%, #3fae4a 100%)" : "var(--card-bg)",
            border: s.hero ? "none" : "1px solid var(--card-border)",
            boxShadow: s.hero ? "0 14px 40px rgba(14,165,160,0.3)" : "none",
          }}>
            <div style={{ fontSize: "26px", marginBottom: "8px" }}>{s.emoji}</div>
            <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: s.hero ? "rgba(255,255,255,0.85)" : "var(--text-tertiary)", marginBottom: "8px" }}>{s.label}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "42px", fontWeight: 800, lineHeight: 1, letterSpacing: "-1px", color: s.hero ? "#fff" : "var(--text-primary)" }}>
              <CountUp value={s.value} prefix={s.prefix ?? ""} suffix={s.suffix ?? ""} />
            </div>
            <div style={{ fontSize: "13px", color: s.hero ? "rgba(255,255,255,0.9)" : "var(--text-secondary)", marginTop: "10px", lineHeight: 1.5 }}>{s.sub}</div>
          </div>
        ))}

        {/* Closing + share */}
        <div className="bt-wr-card" style={{ animationDelay: `${slides.length * 90}ms`, textAlign: "center", marginTop: "6px" }}>
          <p style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)", margin: "0 0 14px" }}>Here&apos;s to {stats.year + 1} 🥂</p>
          <button type="button" onClick={share} style={{ width: "100%", padding: "13px", borderRadius: "14px", border: "none", background: "var(--brand-gradient)", color: "#fff", fontSize: "14px", fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)" }}>
            {shared ? "Copied to clipboard ✓" : "Share my year"}
          </button>
          <Link href="/dashboard" style={{ display: "inline-block", marginTop: "14px", fontSize: "12px", color: "var(--text-tertiary)", textDecoration: "none" }}>← Back to dashboard</Link>
        </div>
      </div>
    </main>
  );
}
