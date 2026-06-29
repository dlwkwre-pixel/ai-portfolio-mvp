"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CountUp from "@/app/admin/count-up";
import InfoTooltip from "@/app/components/info-tooltip";
import { addGoal, updateGoal, adjustGoal, deleteGoal, type Goal, type GoalCategory } from "./goals-actions";

const CAT: Record<GoalCategory, { label: string; emoji: string; color: string }> = {
  house:      { label: "Home", emoji: "🏠", color: "#f59e0b" },
  car:        { label: "Car", emoji: "🚗", color: "#fb923c" },
  travel:     { label: "Travel", emoji: "✈️", color: "#38bdf8" },
  education:  { label: "Education", emoji: "🎓", color: "#a78bfa" },
  retirement: { label: "Retirement", emoji: "🌴", color: "#34d399" },
  emergency:  { label: "Emergency", emoji: "🛡️", color: "#ef4444" },
  wedding:    { label: "Wedding", emoji: "💍", color: "#ec4899" },
  fund:       { label: "Fund", emoji: "💰", color: "#2563eb" },
  other:      { label: "Goal", emoji: "🎯", color: "#818cf8" },
};
const fmt = (n: number) => "$" + Math.round(n).toLocaleString();

function monthsUntil(year: number | null): number | null {
  if (!year) return null;
  const now = new Date();
  const m = (year - now.getFullYear()) * 12 - now.getMonth();
  return m;
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", background: "var(--bg-elevated, rgba(255,255,255,0.03))",
  border: "1px solid var(--card-border)", borderRadius: "var(--radius-md)", padding: "9px 11px",
  fontSize: "13px", color: "var(--text-primary)", fontFamily: "var(--font-body)", outline: "none",
};

export default function GoalsClient({ goals }: { goals: Goal[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  // form fields
  const [name, setName] = useState("");
  const [category, setCategory] = useState<GoalCategory>("house");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [targetYear, setTargetYear] = useState("");
  // per-goal contribute
  const [contribId, setContribId] = useState<string | null>(null);
  const [contribAmt, setContribAmt] = useState("");

  const totalTarget = goals.reduce((s, g) => s + Number(g.target_amount), 0);
  const totalSaved = goals.reduce((s, g) => s + Number(g.current_amount), 0);
  const overallPct = totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0;

  function resetForm() { setName(""); setCategory("house"); setTarget(""); setCurrent(""); setTargetYear(""); setError(""); setEditingId(null); setFormOpen(false); }
  function openEdit(g: Goal) {
    setEditingId(g.id); setName(g.name); setCategory(g.category); setTarget(String(g.target_amount));
    setCurrent(String(g.current_amount)); setTargetYear(g.target_year ? String(g.target_year) : ""); setFormOpen(true); setError("");
  }
  function save() {
    if (!name.trim() || !(Number(target) > 0)) { setError("Name and a target amount are required."); return; }
    const fd = new FormData();
    if (editingId) fd.set("id", editingId);
    fd.set("name", name.trim()); fd.set("category", category);
    fd.set("target_amount", target); fd.set("current_amount", current || "0"); fd.set("target_year", targetYear);
    startTransition(async () => {
      const res = await (editingId ? updateGoal(fd) : addGoal(fd));
      if (res?.error) { setError(res.error); return; }
      resetForm(); router.refresh();
    });
  }
  function contribute(id: string, sign: 1 | -1) {
    const amt = Number(contribAmt);
    if (!Number.isFinite(amt) || amt <= 0) return;
    startTransition(async () => { await adjustGoal(id, sign * amt); setContribId(null); setContribAmt(""); router.refresh(); });
  }
  function remove(id: string) { startTransition(async () => { await deleteGoal(id); router.refresh(); }); }

  return (
    <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "24px", maxWidth: "760px", width: "100%", margin: "0 auto" }}>
      <style>{`@keyframes bt-goal-grow{from{width:0}to{}} .bt-goal-bar{transition:width .8s cubic-bezier(0.16,1,0.3,1)}`}</style>

      <div style={{ marginBottom: "6px" }}>
        <Link href="/planning" style={{ fontSize: "12px", color: "var(--text-tertiary)", textDecoration: "none" }}>← Planning</Link>
      </div>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "22px", fontWeight: 800, letterSpacing: "-0.4px", color: "var(--text-primary)", margin: 0, display: "flex", alignItems: "center" }}>
        Goals
        <InfoTooltip align="start" width={250} text="Set savings goals — a house down payment, a trip, an emergency fund — with a target and a date. Each goal tracks its funded % and the monthly pace to reach it on time.">
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "16px", height: "16px", borderRadius: "50%", marginLeft: "7px", cursor: "help", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", color: "var(--accent, #818cf8)", fontSize: "10px", fontWeight: 700 }}>?</span>
        </InfoTooltip>
      </h1>
      <p style={{ fontSize: "13px", color: "var(--text-tertiary)", margin: "2px 0 18px" }}>Track what you&apos;re saving toward and how close you are.</p>

      {/* Summary */}
      {goals.length > 0 && (
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 18px", marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "10px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-tertiary)" }}>All goals</span>
            <span style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
              <span style={{ color: "var(--text-primary)", fontWeight: 700 }}><CountUp value={Math.round(totalSaved)} prefix="$" /></span> of {fmt(totalTarget)}
            </span>
          </div>
          <div style={{ height: "10px", borderRadius: "5px", background: "rgba(148,163,184,0.14)", overflow: "hidden" }}>
            <div className="bt-goal-bar" style={{ width: `${overallPct}%`, height: "100%", background: "linear-gradient(90deg,#2563eb,#7c3aed)" }} />
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "6px", fontFamily: "var(--font-mono)" }}>{overallPct}% funded across {goals.length} goal{goals.length !== 1 ? "s" : ""}</div>
        </div>
      )}

      {/* New goal button / form */}
      {!formOpen ? (
        <button type="button" onClick={() => { resetForm(); setFormOpen(true); }} style={{ marginBottom: "16px", padding: "10px 16px", borderRadius: "var(--radius-md)", border: "1px dashed var(--card-border)", background: "transparent", color: "var(--accent, #818cf8)", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", width: "100%" }}>
          + New goal
        </button>
      ) : (
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 18px", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{editingId ? "Edit goal" : "New goal"}</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Goal name (e.g. House down payment)" maxLength={80} style={inputStyle} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <select value={category} onChange={(e) => setCategory(e.target.value as GoalCategory)} style={inputStyle}>
              {(Object.keys(CAT) as GoalCategory[]).map((c) => <option key={c} value={c}>{CAT[c].emoji} {CAT[c].label}</option>)}
            </select>
            <input value={targetYear} onChange={(e) => setTargetYear(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Target year (optional)" inputMode="numeric" style={inputStyle} />
            <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target $" inputMode="decimal" style={inputStyle} />
            <input value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Saved so far $" inputMode="decimal" style={inputStyle} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button type="button" onClick={save} disabled={pending} style={{ padding: "9px 18px", borderRadius: "var(--radius-md)", border: "none", background: "linear-gradient(135deg,#2563eb,#4f46e5)", color: "#fff", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)" }}>{pending ? "Saving…" : editingId ? "Save changes" : "Add goal"}</button>
            <button type="button" onClick={resetForm} style={{ padding: "9px 16px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", background: "transparent", color: "var(--text-secondary)", fontSize: "13px", cursor: "pointer", fontFamily: "var(--font-body)" }}>Cancel</button>
            {error && <span style={{ fontSize: "12px", color: "var(--red)" }}>{error}</span>}
          </div>
        </div>
      )}

      {/* Goals */}
      {goals.length === 0 && !formOpen ? (
        <p style={{ fontSize: "13px", color: "var(--text-tertiary)", fontStyle: "italic", textAlign: "center", padding: "20px" }}>No goals yet. Add your first one above.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
          {goals.map((g) => {
            const meta = CAT[g.category] ?? CAT.other;
            const pct = Number(g.target_amount) > 0 ? Math.min(100, Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100)) : 0;
            const remaining = Math.max(0, Number(g.target_amount) - Number(g.current_amount));
            const mo = monthsUntil(g.target_year);
            const perMonth = mo != null && mo > 0 && remaining > 0 ? remaining / mo : null;
            const done = pct >= 100;
            return (
              <div key={g.id} style={{ background: "var(--card-bg)", border: `1px solid ${done ? "rgba(52,211,153,0.3)" : "var(--card-border)"}`, borderRadius: "var(--radius-lg)", padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "9px" }}>
                  <span style={{ fontSize: "20px" }}>{meta.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>{meta.label}{g.target_year ? ` · by ${g.target_year}` : ""}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: done ? "var(--green)" : "var(--text-primary)" }}>{fmt(Number(g.current_amount))}</div>
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>of {fmt(Number(g.target_amount))}</div>
                  </div>
                </div>
                <div style={{ height: "9px", borderRadius: "5px", background: "rgba(148,163,184,0.14)", overflow: "hidden", marginBottom: "7px" }}>
                  <div className="bt-goal-bar" style={{ width: `${pct}%`, height: "100%", background: done ? "var(--green)" : `linear-gradient(90deg, ${meta.color}, #7c3aed)` }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" }}>
                  <span style={{ fontSize: "11px", color: done ? "var(--green)" : "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                    {done ? "✓ Funded!" : `${pct}% · ${fmt(remaining)} to go${perMonth != null ? ` · ${fmt(perMonth)}/mo for ${mo}mo` : ""}`}
                  </span>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    {contribId === g.id ? (
                      <span style={{ display: "inline-flex", gap: "5px", alignItems: "center" }}>
                        <input value={contribAmt} onChange={(e) => setContribAmt(e.target.value)} placeholder="$" inputMode="decimal" autoFocus style={{ ...inputStyle, width: "78px", padding: "5px 8px" }} />
                        <button type="button" onClick={() => contribute(g.id, 1)} disabled={pending} style={{ fontSize: "11px", fontWeight: 700, color: "var(--green)", background: "none", border: "none", cursor: "pointer" }}>+ Add</button>
                        <button type="button" onClick={() => contribute(g.id, -1)} disabled={pending} style={{ fontSize: "11px", color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer" }}>− Pull</button>
                        <button type="button" onClick={() => { setContribId(null); setContribAmt(""); }} style={{ fontSize: "11px", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                      </span>
                    ) : (
                      <>
                        <button type="button" onClick={() => { setContribId(g.id); setContribAmt(""); }} style={{ fontSize: "11px", fontWeight: 600, color: "var(--accent, #818cf8)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)" }}>Update</button>
                        <button type="button" onClick={() => openEdit(g)} style={{ fontSize: "11px", color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)" }}>Edit</button>
                        <button type="button" onClick={() => remove(g.id)} style={{ fontSize: "11px", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)" }}>Delete</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
