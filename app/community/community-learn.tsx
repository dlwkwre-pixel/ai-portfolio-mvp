"use client";

import { useState, useEffect } from "react";

// ── Daily trivia bank ────────────────────────────────────────────────────────
// Static set; today's question is picked by day-of-year so everyone sees the
// same one each day. Streak is tracked client-side (per device) for now.

type Trivia = { q: string; options: string[]; answer: number; why: string };

const TRIVIA: Trivia[] = [
  { q: "What does a company's P/E ratio measure?", options: ["Price relative to earnings", "Total debt", "Dividend yield", "Market share"], answer: 0, why: "P/E (price-to-earnings) compares a stock's price to its earnings per share — a rough gauge of how expensive it is relative to profits." },
  { q: "Diversification primarily helps reduce…", options: ["Taxes", "Unsystematic (company-specific) risk", "Inflation", "Trading fees"], answer: 1, why: "Spreading across many holdings reduces the impact of any single company failing. It can't remove market-wide (systematic) risk." },
  { q: "An ETF is best described as…", options: ["A single company's stock", "A basket of securities traded like a stock", "A type of bond", "A savings account"], answer: 1, why: "ETFs hold many securities (stocks, bonds, etc.) but trade on an exchange like a single stock." },
  { q: "What is dollar-cost averaging?", options: ["Buying only at the lowest price", "Investing a fixed amount on a schedule", "Selling when the market drops", "Timing the market perfectly"], answer: 1, why: "Investing a fixed amount regularly smooths out your average purchase price and removes the pressure of timing." },
  { q: "A 'dividend' is…", options: ["A company's debt", "A share of profits paid to shareholders", "A stock split", "A trading fee"], answer: 1, why: "Dividends are cash (or shares) a company distributes to shareholders from its profits." },
  { q: "Higher potential return generally comes with…", options: ["Lower risk", "Higher risk", "No risk", "Guaranteed gains"], answer: 1, why: "The risk-return tradeoff: assets with higher expected returns typically carry more volatility and risk of loss." },
  { q: "What does 'market cap' mean?", options: ["A price ceiling", "Total value of a company's shares", "Yearly revenue", "Cash on hand"], answer: 1, why: "Market capitalization = share price × shares outstanding — the total market value of the company's equity." },
  { q: "A bear market is generally defined as a decline of at least…", options: ["5%", "10%", "20%", "50%"], answer: 2, why: "A drop of 20% or more from recent highs is the common definition of a bear market; a 10% drop is a 'correction.'" },
  { q: "Compounding refers to…", options: ["Earning returns on your prior returns", "Paying off debt", "Splitting a stock", "A type of order"], answer: 0, why: "Compounding is growth on both your original money and the gains it has already earned — the engine of long-term investing." },
  { q: "An index fund aims to…", options: ["Beat the market", "Match a market index", "Avoid all risk", "Pick winning stocks"], answer: 1, why: "Index funds track a benchmark (like the S&P 500) rather than trying to outperform it, usually at very low cost." },
  { q: "What is a 'limit order'?", options: ["An order with no price set", "An order to buy/sell at a specific price or better", "A guaranteed fill", "An order that never expires"], answer: 1, why: "A limit order only executes at your specified price or better — you control price, but the fill isn't guaranteed." },
  { q: "Which usually has the lowest risk?", options: ["A single small-cap stock", "A broad bond fund", "Crypto", "Options"], answer: 1, why: "Broad bond funds are generally less volatile than individual stocks, crypto, or derivatives — though still not risk-free." },
];

function todaysIndex(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const day = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return day % TRIVIA.length;
}
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Lessons ──────────────────────────────────────────────────────────────────

type Lesson = { track: string; title: string; minutes: number; body: string };

const LESSONS: Lesson[] = [
  { track: "Basics", title: "What actually is a stock?", minutes: 2, body: "A stock is a small ownership share in a company. When the business grows and earns more, your share can become more valuable, and some companies pay out part of their profits as dividends. You make money two ways: the price rising (capital gains) and dividends. You also share the downside if the business struggles." },
  { track: "Basics", title: "Risk vs. reward, in plain terms", minutes: 2, body: "Every investment trades safety for growth. Cash is safe but barely grows. Stocks can grow a lot but swing hard year to year. The goal isn't to avoid risk, it's to take the right amount for your time horizon. Money you need in 1 year should be safer than money you won't touch for 20." },
  { track: "Building a portfolio", title: "Why diversification matters", minutes: 3, body: "Owning one stock means your outcome rides on one company. Owning 20+ across different sectors means a single blow-up barely dents you. Diversification can't remove market-wide risk, but it removes the avoidable, company-specific kind. An index fund is diversification in a single click." },
  { track: "Building a portfolio", title: "Position sizing & cash", minutes: 3, body: "How much you put in one name matters as much as which name. A common guardrail: no single position above 10–20% of the portfolio. Keeping some cash lets you buy when prices drop instead of being forced to sell. Your strategy in BuyTune sets these rules so the AI respects them." },
  { track: "Mindset", title: "Time in the market", minutes: 2, body: "Trying to jump in and out at the perfect moment is a losing game for almost everyone. Missing just a handful of the market's best days each decade dramatically lowers returns, and the best days often come right after the worst ones. Consistency beats timing." },
  { track: "Mindset", title: "Reading an AI recommendation", minutes: 2, body: "BuyTune's AI gives a clear action (BUY, HOLD, TRIM, SELL) with a thesis, conviction, and sizing, based on your strategy and live data. Treat it as a well-researched second opinion, not a command. The 'why' matters more than the label, read the thesis and decide for yourself." },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function CommunityLearn() {
  const idx = todaysIndex();
  const trivia = TRIVIA[idx];
  const [selected, setSelected] = useState<number | null>(null);
  const [answeredToday, setAnsweredToday] = useState(false);
  const [streak, setStreak] = useState(0);
  const [correctTotal, setCorrectTotal] = useState(0);
  const [openLesson, setOpenLesson] = useState<number | null>(null);

  useEffect(() => {
    try {
      const last = localStorage.getItem("bt-trivia-last");
      const s = Number(localStorage.getItem("bt-trivia-streak") ?? 0);
      const c = Number(localStorage.getItem("bt-trivia-correct") ?? 0);
      setStreak(s); setCorrectTotal(c);
      if (last === todayKey()) {
        setAnsweredToday(true);
        const prev = localStorage.getItem("bt-trivia-pick");
        if (prev != null) setSelected(Number(prev));
      }
    } catch { /* no-op */ }
  }, []);

  function answer(i: number) {
    if (answeredToday) return;
    setSelected(i);
    setAnsweredToday(true);
    const correct = i === trivia.answer;
    try {
      const last = localStorage.getItem("bt-trivia-last");
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const prevStreak = Number(localStorage.getItem("bt-trivia-streak") ?? 0);
      const newStreak = correct ? (last === yesterday ? prevStreak + 1 : 1) : 0;
      const newCorrect = correctTotal + (correct ? 1 : 0);
      localStorage.setItem("bt-trivia-last", todayKey());
      localStorage.setItem("bt-trivia-pick", String(i));
      localStorage.setItem("bt-trivia-streak", String(newStreak));
      localStorage.setItem("bt-trivia-correct", String(newCorrect));
      setStreak(newStreak); setCorrectTotal(newCorrect);
    } catch { /* no-op */ }
  }

  const tracks = [...new Set(LESSONS.map(l => l.track))];

  return (
    <div>
      {/* ── Daily trivia ── */}
      <div className="bt-card" style={{ padding: "18px 20px", marginBottom: "16px", background: "var(--violet-bg)", border: "1px solid var(--violet-border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--violet)" }}>📅 Daily trivia</div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>🔥 <strong style={{ color: "var(--text-primary)" }}>{streak}</strong> day streak</span>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>✓ <strong style={{ color: "var(--text-primary)" }}>{correctTotal}</strong> correct</span>
          </div>
        </div>
        <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.45, margin: "0 0 14px" }}>{trivia.q}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {trivia.options.map((opt, i) => {
            const isAnswer = i === trivia.answer;
            const isPicked = selected === i;
            let bg = "var(--bg-base)", border = "var(--card-border)", color = "var(--text-primary)";
            if (answeredToday) {
              if (isAnswer) { bg = "var(--green-bg)"; border = "var(--green-border)"; color = "var(--text-primary)"; }
              else if (isPicked) { bg = "var(--red-bg)"; border = "var(--red-border)"; }
            }
            return (
              <button key={i} type="button" onClick={() => answer(i)} disabled={answeredToday}
                style={{ textAlign: "left", padding: "10px 14px", borderRadius: "10px", cursor: answeredToday ? "default" : "pointer",
                  background: bg, border: `1px solid ${border}`, color, fontSize: "13px", fontWeight: isPicked || (answeredToday && isAnswer) ? 600 : 400,
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", transition: "all 0.15s" }}>
                <span>{opt}</span>
                {answeredToday && isAnswer && <span style={{ color: "var(--green)" }}>✓</span>}
                {answeredToday && isPicked && !isAnswer && <span style={{ color: "var(--red)" }}>✗</span>}
              </button>
            );
          })}
        </div>
        {answeredToday && (
          <div style={{ marginTop: "12px", padding: "10px 12px", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "10px" }}>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
              {selected === trivia.answer ? "Correct! " : ""}{trivia.why}
            </p>
            <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "8px 0 0" }}>Come back tomorrow for a new question.</p>
          </div>
        )}
      </div>

      {/* ── Lessons ── */}
      <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "10px" }}>
        Bite-size lessons
      </div>
      {tracks.map(track => (
        <div key={track} style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-tertiary)", marginBottom: "8px" }}>{track}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {LESSONS.map((l, gi) => l.track === track ? (
              <div key={gi} className="bt-card" style={{ padding: 0, overflow: "hidden" }}>
                <button type="button" onClick={() => setOpenLesson(openLesson === gi ? null : gi)}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "13px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{l.title}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "1px" }}>{l.minutes} min read</div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"
                    style={{ color: "var(--text-muted)", flexShrink: 0, transform: openLesson === gi ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                    <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                  </svg>
                </button>
                <div style={{ display: "grid", gridTemplateRows: openLesson === gi ? "1fr" : "0fr", transition: "grid-template-rows 0.25s ease" }}>
                  <div style={{ overflow: "hidden" }}>
                    <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6, padding: "0 16px 14px", margin: 0 }}>{l.body}</p>
                  </div>
                </div>
              </div>
            ) : null)}
          </div>
        </div>
      ))}
      <p style={{ fontSize: "11px", color: "var(--text-muted)", textAlign: "center", marginTop: "4px" }}>
        Educational content only — not financial advice.
      </p>
    </div>
  );
}
