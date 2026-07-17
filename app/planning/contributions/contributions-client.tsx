"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import InfoTooltip from "@/app/components/info-tooltip";
import {
  addContribution, updateContribution, toggleContribution, deleteContribution,
  type ContributionSchedule,
} from "./contributions-actions";
import { CADENCES, WEEKDAYS, cadenceLabel, annualizedAmount, type Cadence } from "@/lib/planning/contributions";

const fmt = (n: number) => "$" + Math.round(n).toLocaleString();
function fmtDue(iso: string) {
  const d = new Date(iso + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (days <= 0) return { text: `Due now · ${date}`, soon: true };
  if (days === 1) return { text: `Tomorrow · ${date}`, soon: true };
  if (days <= 7) return { text: `In ${days} days · ${date}`, soon: true };
  return { text: date, soon: false };
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", background: "var(--bg-elevated, rgba(255,255,255,0.03))",
  border: "1px solid var(--card-border)", borderRadius: "var(--radius-md)", padding: "9px 11px",
  fontSize: "13px", color: "var(--text-primary)", fontFamily: "var(--font-body)", outline: "none",
};
const monoInput: React.CSSProperties = { ...inputStyle, fontFamily: "var(--font-mono)" };

type Portfolio = { id: string; name: string };

export default function ContributionsClient({ schedules, portfolios }: {
  schedules: ContributionSchedule[]; portfolios: Portfolio[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  // form state
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState<Cadence>("monthly");
  const [anchorDay, setAnchorDay] = useState("1");
  const [portfolioId, setPortfolioId] = useState("");

  const active = schedules.filter((s) => s.active);
  const monthlyPace = active.reduce((s, sc) => s + annualizedAmount(sc.cadence, sc.amount) / 12, 0);
  const annualPace = active.reduce((s, sc) => s + annualizedAmount(sc.cadence, sc.amount), 0);

  function resetForm() {
    setLabel(""); setAmount(""); setCadence("monthly"); setAnchorDay("1"); setPortfolioId(""); setEditing(null); setError("");
  }
  function openEdit(s: ContributionSchedule) {
    setEditing(s.id); setShowForm(true);
    setLabel(s.label); setAmount(String(s.amount)); setCadence(s.cadence);
    setAnchorDay(String(s.anchor_day)); setPortfolioId(s.portfolio_id ?? ""); setError("");
  }

  function submit() {
    if (!label.trim()) { setError("Give this contribution a name."); return; }
    if (!Number(amount) || Number(amount) <= 0) { setError("Set an amount greater than 0."); return; }
    setError("");
    const fd = new FormData();
    if (editing) fd.set("id", editing);
    fd.set("label", label.trim());
    fd.set("amount", amount);
    fd.set("cadence", cadence);
    fd.set("anchor_day", anchorDay);
    fd.set("portfolio_id", portfolioId);
    startTransition(async () => {
      const res = editing ? await updateContribution(fd) : await addContribution(fd);
      if (res?.error) { setError(res.error); return; }
      resetForm(); setShowForm(false); router.refresh();
    });
  }
  function toggle(id: string, next: boolean) {
    startTransition(async () => { await toggleContribution(id, next); router.refresh(); });
  }
  function remove(id: string) {
    startTransition(async () => { await deleteContribution(id); router.refresh(); });
  }

  return (
    <div className="bt-page-content" style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ maxWidth: "720px", margin: "0 auto", padding: "20px 24px 80px" }}>
        {/* Header */}
        <div style={{ marginBottom: "18px" }}>
          <Link href="/planning" style={{ fontSize: "12px", color: "var(--text-tertiary)", textDecoration: "none" }}>← Planning</Link>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.4px", margin: "8px 0 2px", display: "flex", alignItems: "center" }}>
            Auto-Invest Plan
            <InfoTooltip align="start" width={250} text="Schedule recurring contributions (dollar-cost averaging). BuyTune sends an in-app reminder on each due date so you invest consistently — the single biggest driver of long-term returns.">
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "16px", height: "16px", borderRadius: "50%", marginLeft: "8px", cursor: "help", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", color: "var(--accent, #818cf8)", fontSize: "10px", fontWeight: 700 }}>?</span>
            </InfoTooltip>
          </h1>
          <p style={{ fontSize: "13px", color: "var(--text-tertiary)", margin: 0 }}>
            Set a DCA cadence and we&apos;ll remind you to invest, every time.
          </p>
        </div>

        {/* Pace summary */}
        {active.length > 0 && (
          <div style={{ display: "flex", gap: "10px", marginBottom: "18px", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: "150px", padding: "14px 16px", background: "linear-gradient(135deg, rgba(37,99,235,0.08), rgba(124,58,237,0.06))", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "var(--radius-lg)" }}>
              <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Monthly pace</div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--text-primary)", fontFamily: "var(--font-mono)", marginTop: "3px" }}>{fmt(monthlyPace)}</div>
            </div>
            <div style={{ flex: 1, minWidth: "150px", padding: "14px 16px", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)" }}>
              <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Annual pace</div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--text-primary)", fontFamily: "var(--font-mono)", marginTop: "3px" }}>{fmt(annualPace)}</div>
            </div>
          </div>
        )}

        {/* Add button / form */}
        {!showForm ? (
          <button type="button" onClick={() => { resetForm(); setShowForm(true); }}
            style={{ width: "100%", padding: "12px", borderRadius: "var(--radius-lg)", border: "1px dashed var(--card-border)", background: "transparent", color: "var(--accent, #818cf8)", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", marginBottom: "18px" }}>
            + New contribution
          </button>
        ) : (
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 18px", marginBottom: "18px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{editing ? "Edit contribution" : "New contribution"}</div>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name (e.g. Roth IRA, S&P 500 DCA)" maxLength={80} style={inputStyle} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div>
                <label style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "4px" }}>Amount</label>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" placeholder="500" style={monoInput} />
              </div>
              <div>
                <label style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "4px" }}>Cadence</label>
                <select value={cadence} onChange={(e) => { const c = e.target.value as Cadence; setCadence(c); setAnchorDay(c === "monthly" ? "1" : "1"); }} style={inputStyle}>
                  {CADENCES.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div>
                <label style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "4px" }}>{cadence === "monthly" ? "Day of month" : "Day of week"}</label>
                {cadence === "monthly" ? (
                  <select value={anchorDay} onChange={(e) => setAnchorDay(e.target.value)} style={inputStyle}>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                ) : (
                  <select value={anchorDay} onChange={(e) => setAnchorDay(e.target.value)} style={inputStyle}>
                    {WEEKDAYS.map((w, i) => <option key={w} value={i}>{w}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "4px" }}>Account (optional)</label>
                <select value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)} style={inputStyle}>
                  <option value="">Any / unspecified</option>
                  {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button type="button" onClick={submit} disabled={pending}
                style={{ padding: "9px 18px", borderRadius: "var(--radius-md)", border: "none", fontSize: "13px", fontWeight: 700, cursor: pending ? "wait" : "pointer", fontFamily: "var(--font-body)", background: "linear-gradient(135deg,#2563eb,#4f46e5)", color: "#fff" }}>
                {pending ? "Saving…" : editing ? "Save changes" : "Schedule it"}
              </button>
              <button type="button" onClick={() => { resetForm(); setShowForm(false); }} style={{ fontSize: "12px", color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)" }}>Cancel</button>
              {error && <span style={{ fontSize: "12px", color: "var(--red)" }}>{error}</span>}
            </div>
          </div>
        )}

        {/* List */}
        {schedules.length === 0 ? (
          <p style={{ fontSize: "13px", color: "var(--text-tertiary)", fontStyle: "italic", textAlign: "center", padding: "30px" }}>
            No contributions scheduled yet. Add one and BuyTune will nudge you to invest on schedule.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {schedules.map((s) => {
              const due = fmtDue(s.next_due);
              const pName = portfolios.find((p) => p.id === s.portfolio_id)?.name;
              return (
                <div key={s.id} style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "14px 16px", opacity: s.active ? 1 : 0.55 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: "160px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>{s.label}</span>
                        {!s.active && <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", border: "1px solid var(--border-subtle)", borderRadius: "999px", padding: "1px 7px" }}>Paused</span>}
                      </div>
                      <div style={{ fontSize: "11.5px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                        {cadenceLabel(s.cadence, s.anchor_day)}{pName ? ` · ${pName}` : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "16px", fontWeight: 800, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{fmt(s.amount)}</div>
                      <div style={{ fontSize: "10.5px", color: due.soon && s.active ? "var(--accent, #818cf8)" : "var(--text-muted)", fontWeight: due.soon ? 700 : 400 }}>{s.active ? due.text : "—"}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "10px", paddingTop: "10px", borderTop: "1px solid var(--border-subtle)" }}>
                    <button type="button" onClick={() => toggle(s.id, !s.active)} disabled={pending} style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", padding: 0 }}>
                      {s.active ? "Pause" : "Resume"}
                    </button>
                    <button type="button" onClick={() => openEdit(s)} disabled={pending} style={{ fontSize: "11px", fontWeight: 600, color: "var(--accent, #818cf8)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", padding: 0 }}>Edit</button>
                    <button type="button" onClick={() => remove(s.id)} disabled={pending} style={{ marginLeft: "auto", fontSize: "10px", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)" }}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "18px", textAlign: "center" }}>
          Reminders arrive in your notification bell. BuyTune doesn&apos;t move money — it nudges you to invest on your own schedule.
        </p>
      </div>
    </div>
  );
}
