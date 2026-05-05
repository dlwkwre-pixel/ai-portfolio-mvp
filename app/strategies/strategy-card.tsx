"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { StrategyCard } from "./types";
import { updateStrategy, duplicateStrategy, deleteStrategy } from "./actions";
import StrategyPublicToggle from "./strategy-public-toggle";

const STRATEGY_STYLES = ["Growth","Value","Blend","Dividend / Income","Quality","Index / Passive","Sector / Thematic","Momentum","Swing","Mean Reversion","Defensive","Balanced","Speculative","Options / Derivatives","Custom"];
const RISK_LEVELS = ["Conservative", "Moderate", "Aggressive"];
const TURNOVER_PREFERENCES = ["Low", "Moderate", "High"];
const HOLDING_PERIOD_BIASES = ["Short-term","Swing","Medium-term","Long-term","Very Long-term","Flexible"];

const inp = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
const sel = "w-full rounded-xl border border-white/10 bg-[#07090f] px-3 py-2 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
const lbl = "mb-1 block text-[10px] font-medium uppercase tracking-widest text-slate-500";

function riskStyle(value: string | null) {
  const map: Record<string, string> = { low: "Conservative", moderate: "Moderate", high: "Aggressive", conservative: "Conservative", aggressive: "Aggressive" };
  const level = map[value?.toLowerCase() ?? ""] ?? value ?? "Moderate";
  if (level === "Conservative") return { bg: "var(--green-bg)", border: "var(--green-border)", color: "var(--green)", label: "Conservative" };
  if (level === "Aggressive") return { bg: "var(--red-bg)", border: "var(--red-border)", color: "var(--red)", label: "Aggressive" };
  return { bg: "var(--amber-bg)", border: "var(--amber-border)", color: "var(--amber)", label: "Moderate" };
}

function deriveChips(v: StrategyCard["latest_version"]): string[] {
  if (!v) return [];
  const chips: string[] = [];
  if (v.turnover_preference === "Low") chips.push("Low trading");
  else if (v.turnover_preference === "High") chips.push("Active trading");
  if (v.holding_period_bias === "Long-term" || v.holding_period_bias === "Very Long-term") chips.push("Buy & hold");
  else if (v.holding_period_bias === "Short-term" || v.holding_period_bias === "Swing") chips.push("Short-term");
  if (v.cash_min_pct !== null && v.cash_min_pct >= 10) chips.push("Cash buffer");
  if (v.max_position_pct !== null && v.max_position_pct <= 10) chips.push("Diversified");
  else if (v.max_position_pct !== null && v.max_position_pct >= 25) chips.push("Concentrated");
  return chips;
}

type CardMode = "collapsed" | "expanded" | "editing";

export default function StrategyCardItem({ card, isNew }: { card: StrategyCard; isNew?: boolean }) {
  const router = useRouter();
  const rs = riskStyle(card.risk_level);
  const chips = deriveChips(card.latest_version);
  const [mode, setMode] = useState<CardMode>("collapsed");
  const [isEditPending, startEdit] = useTransition();
  const [isDupPending, startDup] = useTransition();
  const [isDeletePending, startDelete] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editError, setEditError] = useState("");

  const v = card.latest_version;
  const [editForm, setEditForm] = useState({
    name: card.name,
    description: card.description ?? "",
    style: card.style ?? "Growth",
    risk_level: card.risk_level ?? "Moderate",
    prompt_text: v?.prompt_text ?? "",
    max_position_pct: v?.max_position_pct?.toString() ?? "",
    min_position_pct: v?.min_position_pct?.toString() ?? "",
    turnover_preference: v?.turnover_preference ?? "Moderate",
    holding_period_bias: v?.holding_period_bias ?? "Long-term",
    cash_min_pct: v?.cash_min_pct?.toString() ?? "",
    cash_max_pct: v?.cash_max_pct?.toString() ?? "",
  });

  function handleEditSubmit() {
    setEditError("");
    startEdit(async () => {
      try {
        const fd = new FormData();
        fd.set("strategy_id", card.id);
        Object.entries(editForm).forEach(([k, val]) => fd.set(k, val));
        await updateStrategy(fd);
        router.refresh();
        setMode("expanded");
      } catch (err) {
        setEditError(err instanceof Error ? err.message : "Failed to save.");
      }
    });
  }

  function handleDuplicate() {
    startDup(async () => {
      await duplicateStrategy(card.id);
      router.refresh();
    });
  }

  function handleDelete() {
    startDelete(async () => {
      await deleteStrategy(card.id);
      router.refresh();
    });
  }

  const isExpanded = mode !== "collapsed";

  return (
    <>
      <style>{`
        @keyframes newCardGlow {
          0%   { box-shadow: 0 0 0 0 rgba(37,99,235,0); }
          25%  { box-shadow: 0 0 0 3px rgba(37,99,235,0.25), 0 0 20px rgba(37,99,235,0.12); }
          100% { box-shadow: 0 0 0 0 rgba(37,99,235,0); }
        }
      `}</style>
      <div
        className="bt-card"
        style={{
          overflow: "hidden",
          transition: "box-shadow 0.2s",
          animation: isNew ? "newCardGlow 1.4s cubic-bezier(0.16,1,0.3,1) forwards" : undefined,
        }}
      >
        {/* Header — always visible */}
        <button
          type="button"
          onClick={() => setMode(mode === "collapsed" ? "expanded" : "collapsed")}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", marginBottom: chips.length ? "5px" : "0" }}>
              <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)", whiteSpace: "nowrap" }}>
                {card.name}
              </span>
              <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "2px 7px", borderRadius: "var(--radius-full)", background: rs.bg, border: `1px solid ${rs.border}`, color: rs.color, flexShrink: 0 }}>
                {rs.label}
              </span>
              {card.style && (
                <span style={{ fontSize: "9px", color: "var(--text-tertiary)", background: "var(--card-bg)", border: "1px solid var(--card-border)", padding: "2px 7px", borderRadius: "var(--radius-full)", flexShrink: 0 }}>
                  {card.style}
                </span>
              )}
            </div>
            {chips.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                {chips.map((chip) => (
                  <span key={chip} style={{ fontSize: "9px", color: "var(--text-muted)", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", padding: "2px 7px", borderRadius: "var(--radius-full)" }}>
                    {chip}
                  </span>
                ))}
              </div>
            )}
          </div>
          <svg
            width="14" height="14" viewBox="0 0 20 20" fill="currentColor"
            style={{ color: "var(--text-muted)", flexShrink: 0, transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.28s cubic-bezier(0.16,1,0.3,1)" }}
          >
            <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Expandable body */}
        <div style={{ display: "grid", gridTemplateRows: isExpanded ? "1fr" : "0fr", transition: "grid-template-rows 0.32s cubic-bezier(0.16,1,0.3,1)" }}>
          <div style={{ overflow: "hidden" }}>
            <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "14px 16px" }}>

              {mode === "editing" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <p style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--brand-blue)" }}>Edit Strategy</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "10px" }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label className={lbl}>Name</label>
                      <input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} className={inp} />
                    </div>
                    <div>
                      <label className={lbl}>Style</label>
                      <select value={editForm.style} onChange={e => setEditForm(p => ({ ...p, style: e.target.value }))} className={sel}>
                        {STRATEGY_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Risk level</label>
                      <select value={editForm.risk_level} onChange={e => setEditForm(p => ({ ...p, risk_level: e.target.value }))} className={sel}>
                        {RISK_LEVELS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Trading frequency</label>
                      <select value={editForm.turnover_preference} onChange={e => setEditForm(p => ({ ...p, turnover_preference: e.target.value }))} className={sel}>
                        {TURNOVER_PREFERENCES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Time horizon</label>
                      <select value={editForm.holding_period_bias} onChange={e => setEditForm(p => ({ ...p, holding_period_bias: e.target.value }))} className={sel}>
                        {HOLDING_PERIOD_BIASES.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Max single holding %</label>
                      <input type="number" value={editForm.max_position_pct} onChange={e => setEditForm(p => ({ ...p, max_position_pct: e.target.value }))} className={inp} placeholder="15" />
                    </div>
                    <div>
                      <label className={lbl}>Min single holding %</label>
                      <input type="number" value={editForm.min_position_pct} onChange={e => setEditForm(p => ({ ...p, min_position_pct: e.target.value }))} className={inp} placeholder="2" />
                    </div>
                    <div>
                      <label className={lbl}>Keep in cash (min) %</label>
                      <input type="number" value={editForm.cash_min_pct} onChange={e => setEditForm(p => ({ ...p, cash_min_pct: e.target.value }))} className={inp} placeholder="5" />
                    </div>
                    <div>
                      <label className={lbl}>Keep in cash (max) %</label>
                      <input type="number" value={editForm.cash_max_pct} onChange={e => setEditForm(p => ({ ...p, cash_max_pct: e.target.value }))} className={inp} placeholder="20" />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label className={lbl}>Description</label>
                      <textarea value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} className={`${inp} min-h-[60px]`} />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label className={lbl}>AI instructions</label>
                      <textarea value={editForm.prompt_text} onChange={e => setEditForm(p => ({ ...p, prompt_text: e.target.value }))} className={`${inp} min-h-[80px]`} />
                    </div>
                  </div>
                  {editError && (
                    <div style={{ fontSize: "12px", color: "var(--red)", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: "var(--radius-md)", padding: "8px 12px" }}>
                      {editError}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button type="button" onClick={handleEditSubmit} disabled={isEditPending}
                      style={{ padding: "7px 16px", borderRadius: "var(--radius-xl)", fontSize: "12px", fontWeight: 600, color: "#fff", background: "linear-gradient(135deg,#2563eb,#4f46e5)", opacity: isEditPending ? 0.6 : 1, border: "none", cursor: "pointer" }}>
                      {isEditPending ? "Saving..." : "Save changes"}
                    </button>
                    <button type="button" onClick={() => setMode("expanded")}
                      style={{ padding: "7px 14px", borderRadius: "var(--radius-xl)", fontSize: "12px", color: "var(--text-tertiary)", background: "var(--card-bg)", border: "1px solid var(--card-border)", cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {card.description && (
                    <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.65 }}>{card.description}</p>
                  )}

                  {v && (
                    <div>
                      <p style={{ fontSize: "9px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "7px" }}>Parameters</p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "5px" }}>
                        {[
                          ["Max single holding", v.max_position_pct !== null ? `${v.max_position_pct}%` : "—"],
                          ["Min single holding", v.min_position_pct !== null ? `${v.min_position_pct}%` : "—"],
                          ["Cash range", v.cash_min_pct !== null && v.cash_max_pct !== null ? `${v.cash_min_pct}–${v.cash_max_pct}%` : "—"],
                          ["Trading frequency", v.turnover_preference ?? "—"],
                          ["Time horizon", v.holding_period_bias ?? "—"],
                          ["Version", `v${v.version_number}`],
                        ].map(([label, value]) => (
                          <div key={String(label)} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "7px 10px" }}>
                            <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3px" }}>{label}</div>
                            <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {v?.prompt_text && (
                    <div style={{ background: "rgba(37,99,235,0.05)", border: "1px solid rgba(37,99,235,0.12)", borderRadius: "var(--radius-md)", padding: "10px 14px" }}>
                      <p style={{ fontSize: "9px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(96,165,250,0.8)", marginBottom: "5px" }}>AI instructions</p>
                      <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{v.prompt_text}</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                    <button type="button" onClick={() => setMode("editing")}
                      style={{ padding: "5px 12px", borderRadius: "var(--radius-xl)", fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", background: "var(--card-bg)", border: "1px solid var(--card-border)", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>
                      <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"><path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" /></svg>
                      Edit
                    </button>
                    <button type="button" onClick={handleDuplicate} disabled={isDupPending}
                      style={{ padding: "5px 12px", borderRadius: "var(--radius-xl)", fontSize: "12px", fontWeight: 500, color: "var(--text-tertiary)", background: "var(--card-bg)", border: "1px solid var(--card-border)", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px", opacity: isDupPending ? 0.5 : 1 }}>
                      <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" /><path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" /></svg>
                      {isDupPending ? "Duplicating..." : "Duplicate"}
                    </button>

                    {/* Delete with confirmation */}
                    {confirmDelete ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "5px", marginLeft: "auto" }}>
                        <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Delete?</span>
                        <button type="button" onClick={handleDelete} disabled={isDeletePending}
                          style={{ padding: "4px 10px", borderRadius: "var(--radius-xl)", fontSize: "11px", fontWeight: 600, color: "var(--red)", background: "var(--red-bg)", border: "1px solid var(--red-border)", cursor: "pointer", opacity: isDeletePending ? 0.5 : 1 }}>
                          {isDeletePending ? "Deleting..." : "Yes, delete"}
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(false)}
                          style={{ padding: "4px 10px", borderRadius: "var(--radius-xl)", fontSize: "11px", color: "var(--text-muted)", background: "var(--card-bg)", border: "1px solid var(--card-border)", cursor: "pointer" }}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setConfirmDelete(true)}
                        style={{ padding: "5px 12px", borderRadius: "var(--radius-xl)", fontSize: "12px", color: "var(--text-muted)", background: "transparent", border: "1px solid transparent", cursor: "pointer", marginLeft: "auto", display: "flex", alignItems: "center", gap: "5px" }}
                        className="hover:border-red-500/20 hover:text-red-400 transition-colors"
                      >
                        <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" /></svg>
                        Delete
                      </button>
                    )}

                    <div style={{ ...(confirmDelete ? {} : { marginLeft: "0" }) }}>
                      <StrategyPublicToggle strategyId={card.id} isPublic={card.is_public ?? false} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
