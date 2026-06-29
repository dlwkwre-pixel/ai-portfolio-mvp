"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import InfoTooltip from "@/app/components/info-tooltip";
import { addJournalEntry, reviewJournalEntry, deleteJournalEntry, type JournalEntry, type JournalAction } from "./journal-actions";

const ACTION_META: Record<JournalAction, { label: string; color: string }> = {
  buy:   { label: "Buy",   color: "var(--green)" },
  add:   { label: "Add",   color: "var(--green)" },
  sell:  { label: "Sell",  color: "var(--red)" },
  trim:  { label: "Trim",  color: "var(--red)" },
  hold:  { label: "Hold",  color: "var(--violet)" },
  watch: { label: "Watch", color: "var(--accent, #818cf8)" },
};
const CONVICTIONS = ["low", "medium", "high"] as const;
const EMOTIONS = ["confident", "cautious", "fearful", "fomo", "neutral"] as const;

type SecondOpinion = {
  headline: string;
  bearPoints: { title: string; detail: string }[];
  risks: string[];
  questions: string[];
  thesisGap: string | null;
};
type OpinionResult = { ticker: string; hadThesis: boolean; opinion: SecondOpinion };

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// Was the directional call right, given the price move since the decision?
function callVerdict(action: JournalAction, deltaPct: number): { label: string; color: string } | null {
  if (action === "hold" || action === "watch") return null;
  const bullish = action === "buy" || action === "add";
  const good = bullish ? deltaPct > 1 : deltaPct < -1;
  const bad = bullish ? deltaPct < -1 : deltaPct > 1;
  if (good) return { label: bullish ? "Looking right" : "Dodged a drop", color: "var(--green)" };
  if (bad) return { label: bullish ? "Underwater" : "Left upside", color: "var(--red)" };
  return { label: "Flat", color: "var(--text-tertiary)" };
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", background: "var(--bg-elevated, rgba(255,255,255,0.03))",
  border: "1px solid var(--card-border)", borderRadius: "var(--radius-md)", padding: "8px 10px",
  fontSize: "13px", color: "var(--text-primary)", fontFamily: "var(--font-body)", outline: "none",
};

export default function JournalTab({ entries, quotes, portfolioId }: {
  entries: JournalEntry[]; quotes: Record<string, number>; portfolioId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [ticker, setTicker] = useState("");
  const [action, setAction] = useState<JournalAction>("buy");
  const [conviction, setConviction] = useState<string>("medium");
  const [emotion, setEmotion] = useState<string>("");
  const [thesis, setThesis] = useState("");
  const [error, setError] = useState("");
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [reviewText, setReviewText] = useState("");
  const [opinions, setOpinions] = useState<Record<string, OpinionResult>>({});
  const [opinionLoading, setOpinionLoading] = useState<string | null>(null);
  const [opinionErr, setOpinionErr] = useState<Record<string, string>>({});

  async function getOpinion(entryId: string, tkr: string) {
    if (opinionLoading) return;
    setOpinionErr((p) => ({ ...p, [entryId]: "" }));
    setOpinionLoading(entryId);
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}/second-opinion`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: tkr }),
      });
      const d = await res.json();
      if (!res.ok) { setOpinionErr((p) => ({ ...p, [entryId]: d?.error ?? "Couldn't generate a second opinion." })); return; }
      setOpinions((p) => ({ ...p, [entryId]: d as OpinionResult }));
    } catch {
      setOpinionErr((p) => ({ ...p, [entryId]: "Network error. Try again." }));
    } finally {
      setOpinionLoading(null);
    }
  }

  function save() {
    if (!ticker.trim() || !thesis.trim() || pending) { setError("Ticker and reasoning are required."); return; }
    setError("");
    const fd = new FormData();
    fd.set("ticker", ticker.trim());
    fd.set("action", action);
    fd.set("conviction", conviction);
    fd.set("emotion", emotion);
    fd.set("thesis", thesis.trim());
    fd.set("portfolio_id", portfolioId);
    startTransition(async () => {
      const res = await addJournalEntry(fd);
      if (res?.error) { setError(res.error); return; }
      setTicker(""); setThesis(""); setEmotion(""); setAction("buy"); setConviction("medium");
      router.refresh();
    });
  }

  function submitReview(id: string) {
    startTransition(async () => {
      await reviewJournalEntry(id, reviewText, portfolioId);
      setReviewing(null); setReviewText("");
      router.refresh();
    });
  }
  function remove(id: string) {
    startTransition(async () => { await deleteJournalEntry(id, portfolioId); router.refresh(); });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <style>{`@keyframes bt-jrnl-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>

      {/* Intro */}
      <div>
        <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)", margin: 0, display: "flex", alignItems: "center" }}>
          Decision Journal
          <InfoTooltip align="start" width={250} text="Write down WHY before you act. Later, BuyTune resurfaces your reasoning and scores the call against what actually happened — so you learn from your process, not just the price.">
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "15px", height: "15px", borderRadius: "50%", marginLeft: "6px", cursor: "help", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", color: "var(--accent, #818cf8)", fontSize: "10px", fontWeight: 700 }}>?</span>
          </InfoTooltip>
        </h2>
        <p style={{ fontSize: "12px", color: "var(--text-tertiary)", margin: "2px 0 0" }}>
          Log the thinking behind a move. We snapshot the price now so you can grade your reasoning later. Actionable AI calls from your analyses are auto-logged here (tagged <span style={{ color: "var(--accent, #818cf8)", fontWeight: 600 }}>AI call</span>) — run the devil&apos;s advocate on them.
        </p>
      </div>

      {/* Add form */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "8px" }}>
          <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="Ticker" maxLength={12} style={inputStyle} />
          <select value={action} onChange={(e) => setAction(e.target.value as JournalAction)} style={inputStyle}>
            {(Object.keys(ACTION_META) as JournalAction[]).map((a) => <option key={a} value={a}>{ACTION_META[a].label}</option>)}
          </select>
          <select value={conviction} onChange={(e) => setConviction(e.target.value)} style={inputStyle}>
            {CONVICTIONS.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)} conviction</option>)}
          </select>
          <select value={emotion} onChange={(e) => setEmotion(e.target.value)} style={inputStyle}>
            <option value="">Mood (optional)</option>
            {EMOTIONS.map((e2) => <option key={e2} value={e2}>{e2[0].toUpperCase() + e2.slice(1)}</option>)}
          </select>
        </div>
        <textarea value={thesis} onChange={(e) => setThesis(e.target.value)} rows={3} maxLength={2000}
          placeholder="Why are you making this move? What has to be true for it to work? What would make you wrong?"
          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button type="button" onClick={save} disabled={pending || !ticker.trim() || !thesis.trim()}
            style={{ padding: "9px 18px", borderRadius: "var(--radius-md)", border: "none", fontSize: "13px", fontWeight: 700, cursor: pending ? "wait" : "pointer", fontFamily: "var(--font-body)",
              background: pending || !ticker.trim() || !thesis.trim() ? "var(--bg-elevated, #1e293b)" : "linear-gradient(135deg,#2563eb,#4f46e5)", color: "#fff" }}>
            {pending ? "Saving…" : "Log decision"}
          </button>
          {error && <span style={{ fontSize: "12px", color: "var(--red)" }}>{error}</span>}
        </div>
      </div>

      {/* Entries */}
      {entries.length === 0 ? (
        <p style={{ fontSize: "13px", color: "var(--text-tertiary)", fontStyle: "italic", textAlign: "center", padding: "20px" }}>
          No entries yet. Log your next buy or sell to start building your decision history.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {entries.map((e, i) => {
            const meta = ACTION_META[e.action] ?? ACTION_META.hold;
            const cur = quotes[e.ticker];
            const deltaPct = e.price_at_decision && e.price_at_decision > 0 && cur ? ((cur - e.price_at_decision) / e.price_at_decision) * 100 : null;
            const verdict = deltaPct != null ? callVerdict(e.action, deltaPct) : null;
            const old = !e.reviewed_at && daysSince(e.created_at) >= 30;
            return (
              <div key={e.id} style={{ background: "var(--card-bg)", border: `1px solid ${old ? "rgba(245,158,11,0.3)" : "var(--card-border)"}`, borderRadius: "var(--radius-lg)", padding: "14px 16px", animation: "bt-jrnl-in 0.35s ease both", animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "7px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: meta.color, background: `color-mix(in srgb, ${meta.color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${meta.color} 30%, transparent)`, padding: "2px 8px", borderRadius: "999px" }}>{meta.label}</span>
                  {e.source === "ai" && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--accent, #818cf8)", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", padding: "2px 7px", borderRadius: "999px" }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.8L20 9l-4.5 3.8L17 19l-5-3.4L7 19l1.5-6.2L4 9l6.1-.2z" /></svg>
                      AI call
                    </span>
                  )}
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "14px", color: "var(--text-primary)" }}>{e.ticker}</span>
                  {e.conviction && <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>{e.conviction} conviction</span>}
                  {e.emotion && <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>· {e.emotion}</span>}
                  <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{fmtDate(e.created_at)}</span>
                </div>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.55, margin: "0 0 8px", whiteSpace: "pre-wrap" }}>{e.thesis}</p>

                {/* Outcome */}
                {deltaPct != null && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11.5px", fontFamily: "var(--font-mono)", marginBottom: e.outcome_note || old ? "8px" : 0 }}>
                    <span style={{ color: "var(--text-tertiary)" }}>Since: </span>
                    <span style={{ color: deltaPct >= 0 ? "var(--green)" : "var(--red)", fontWeight: 700 }}>{deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%</span>
                    {verdict && <span style={{ color: verdict.color, fontWeight: 700, fontFamily: "var(--font-body)" }}>· {verdict.label}</span>}
                    {e.price_at_decision && <span style={{ color: "var(--text-muted)" }}>(${e.price_at_decision.toFixed(2)} → ${cur.toFixed(2)})</span>}
                  </div>
                )}

                {e.outcome_note && (
                  <div style={{ padding: "8px 11px", background: "var(--bg-elevated, rgba(255,255,255,0.02))", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 600, color: "var(--text-tertiary)" }}>Reflection: </span>{e.outcome_note}
                  </div>
                )}

                {/* Review prompt for old, unreviewed entries */}
                {old && !e.outcome_note && reviewing !== e.id && (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "2px" }}>
                    <span style={{ fontSize: "11px", color: "#f59e0b" }}>Logged {daysSince(e.created_at)} days ago — how did it play out?</span>
                    <button type="button" onClick={() => { setReviewing(e.id); setReviewText(""); }} style={{ fontSize: "11px", fontWeight: 600, color: "var(--accent, #818cf8)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", padding: 0 }}>Reflect →</button>
                  </div>
                )}
                {reviewing === e.id && (
                  <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "7px" }}>
                    <textarea value={reviewText} onChange={(ev) => setReviewText(ev.target.value)} rows={2} maxLength={2000}
                      placeholder="Did your thesis hold up? What did you learn?" style={{ ...inputStyle, resize: "vertical" }} />
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button type="button" onClick={() => submitReview(e.id)} disabled={pending} style={{ padding: "6px 14px", borderRadius: "var(--radius-md)", border: "none", background: "linear-gradient(135deg,#2563eb,#4f46e5)", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>Save reflection</button>
                      <button type="button" onClick={() => setReviewing(null)} style={{ padding: "6px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", background: "transparent", color: "var(--text-secondary)", fontSize: "12px", cursor: "pointer", fontFamily: "var(--font-body)" }}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* AI second opinion (devil's advocate) */}
                {opinions[e.id] && (
                  <div style={{ marginTop: "10px", padding: "12px 14px", background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.22)", borderRadius: "var(--radius-md)", animation: "bt-jrnl-in 0.3s ease both" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "8px" }}>
                      <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#f59e0b" }}>Devil&apos;s advocate</span>
                      {!opinions[e.id].hadThesis && <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>· no thesis on file, general bear case</span>}
                    </div>
                    <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.5, margin: "0 0 10px" }}>{opinions[e.id].opinion.headline}</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {opinions[e.id].opinion.bearPoints.map((bp, bi) => (
                        <div key={bi}>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#f59e0b" }}>{bp.title}</div>
                          <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{bp.detail}</div>
                        </div>
                      ))}
                    </div>
                    {opinions[e.id].opinion.risks.length > 0 && (
                      <div style={{ marginTop: "10px" }}>
                        <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)", marginBottom: "4px" }}>Key risks</div>
                        <ul style={{ margin: 0, paddingLeft: "16px", display: "flex", flexDirection: "column", gap: "3px" }}>
                          {opinions[e.id].opinion.risks.map((r, ri) => (
                            <li key={ri} style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.45 }}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {opinions[e.id].opinion.thesisGap && (
                      <div style={{ marginTop: "10px", padding: "8px 11px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "var(--radius-md)", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                        <span style={{ fontWeight: 700, color: "var(--red)" }}>Blind spot: </span>{opinions[e.id].opinion.thesisGap}
                      </div>
                    )}
                    {opinions[e.id].opinion.questions.length > 0 && (
                      <div style={{ marginTop: "10px" }}>
                        <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)", marginBottom: "4px" }}>Questions to sit with</div>
                        {opinions[e.id].opinion.questions.map((q, qi) => (
                          <p key={qi} style={{ fontSize: "12px", color: "var(--text-secondary)", fontStyle: "italic", lineHeight: 1.45, margin: "0 0 3px" }}>“{q}”</p>
                        ))}
                      </div>
                    )}
                    <p style={{ fontSize: "9.5px", color: "var(--text-muted)", marginTop: "10px" }}>AI-generated counterpoint, not advice. It argues one side on purpose.</p>
                  </div>
                )}

                <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "12px" }}>
                  <button type="button" onClick={() => getOpinion(e.id, e.ticker)} disabled={opinionLoading === e.id}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: 600, color: opinionLoading === e.id ? "var(--text-muted)" : "#f59e0b", background: "none", border: "none", cursor: opinionLoading === e.id ? "wait" : "pointer", fontFamily: "var(--font-body)", padding: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2z" /><line x1="9" y1="21" x2="15" y2="21" /></svg>
                    {opinionLoading === e.id ? "Thinking…" : opinions[e.id] ? "Re-run devil's advocate" : "Get a second opinion"}
                  </button>
                  {opinionErr[e.id] && <span style={{ fontSize: "11px", color: "var(--red)" }}>{opinionErr[e.id]}</span>}
                  <button type="button" onClick={() => remove(e.id)} disabled={pending} style={{ marginLeft: "auto", fontSize: "10px", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)" }}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
