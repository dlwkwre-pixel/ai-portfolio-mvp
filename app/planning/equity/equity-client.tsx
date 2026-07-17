"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Equity compensation planner. Track RSU / ISO / NSO / ESPP grants, value them at
// the live public price (or a manual price for a private company), see what's
// vested vs still golden-handcuffed, when the rest vests, a rough ordinary-income
// tax hit, and how concentrated your net worth is in one stock. Clearly an
// estimate: real equity tax (AMT, LTCG holding periods, 83b) needs an advisor.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveEquityGrant, deleteEquityGrant, type EquityGrant, type EquityGrantType, type EquityGrantInput } from "./equity-actions";

const TYPE_META: Record<EquityGrantType, { label: string; hasStrike: boolean; strikeLabel: string }> = {
  rsu: { label: "RSU", hasStrike: false, strikeLabel: "" },
  iso: { label: "ISO options", hasStrike: true, strikeLabel: "Strike price" },
  nso: { label: "NSO options", hasStrike: true, strikeLabel: "Strike price" },
  espp: { label: "ESPP", hasStrike: true, strikeLabel: "Purchase price" },
};

function fmt(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1_000_000) return `${s}$${(a / 1_000_000).toFixed(2)}M`;
  if (a >= 1_000) return `${s}$${(a / 1_000).toFixed(1)}k`;
  return `${s}$${Math.round(a)}`;
}
function fmtFull(n: number): string { return `$${Math.round(n).toLocaleString()}`; }
function monthsBetween(fromISO: string, to: Date): number {
  const f = new Date(fromISO + (fromISO.length <= 10 ? "T00:00:00" : ""));
  return (to.getFullYear() - f.getFullYear()) * 12 + (to.getMonth() - f.getMonth()) + (to.getDate() >= f.getDate() ? 0 : -1);
}
function addMonths(fromISO: string, months: number): Date {
  const f = new Date(fromISO + (fromISO.length <= 10 ? "T00:00:00" : ""));
  return new Date(f.getFullYear(), f.getMonth() + months, f.getDate());
}
function fmtDate(d: Date): string { return d.toLocaleDateString(undefined, { month: "short", year: "numeric" }); }

// Per-share value in the market: RSU/ESPP = full price (you own the share); options = in-the-money spread.
function unitValue(g: EquityGrant, price: number): number {
  if (g.grant_type === "iso" || g.grant_type === "nso") return Math.max(0, price - Number(g.strike_price ?? 0));
  return price;
}
// Ordinary income recognized per share at vest/exercise.
function unitTaxable(g: EquityGrant, price: number): number {
  if (g.grant_type === "rsu") return price;                                  // full FMV is ordinary income at vest
  if (g.grant_type === "nso") return Math.max(0, price - Number(g.strike_price ?? 0)); // spread ordinary at exercise
  if (g.grant_type === "espp") return Math.max(0, price - Number(g.strike_price ?? 0)); // discount ordinary (simplified)
  return 0;                                                                   // ISO: no ordinary at exercise (AMT applies)
}
function vestedShares(g: EquityGrant, now: Date): number {
  const total = Number(g.total_shares ?? 0);
  if (!g.vest_start_date || g.vest_months <= 0) return total; // no schedule → treat as vested
  const elapsed = monthsBetween(g.vest_start_date, now);
  if (elapsed < (g.cliff_months ?? 0)) return 0;
  const frac = Math.min(1, Math.max(0, elapsed / g.vest_months));
  return Math.round(total * frac);
}
function nextVestDate(g: EquityGrant, now: Date): Date | null {
  if (!g.vest_start_date || g.vest_months <= 0) return null;
  const elapsed = monthsBetween(g.vest_start_date, now);
  if (elapsed >= g.vest_months) return null;
  const nextMonth = Math.max(g.cliff_months ?? 0, elapsed + 1);
  if (nextMonth > g.vest_months) return null;
  return addMonths(g.vest_start_date, nextMonth);
}

const BLANK: EquityGrantInput = {
  label: "", ticker: "", company_name: "", grant_type: "rsu", total_shares: 0,
  strike_price: null, current_price_manual: null, grant_date: null, vest_start_date: null,
  vest_months: 48, cliff_months: 12, notes: null,
};

export default function EquityClient({
  grants, priceByTicker, otherNetWorth,
}: { grants: EquityGrant[]; priceByTicker: Record<string, number>; otherNetWorth: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(grants.length === 0);
  const [form, setForm] = useState<EquityGrantInput>(BLANK);
  const [ratePct, setRatePct] = useState(32);
  const [err, setErr] = useState("");

  const now = new Date();
  const priceFor = (g: EquityGrant) =>
    (g.ticker && priceByTicker[g.ticker]) || Number(g.current_price_manual ?? 0) || Number(g.strike_price ?? 0);

  const rows = useMemo(() => grants.map((g) => {
    const price = priceFor(g);
    const uVal = unitValue(g, price);
    const vShares = vestedShares(g, now);
    const total = Number(g.total_shares ?? 0);
    return {
      g, price, priceKnown: price > 0,
      grossValue: total * uVal,
      vestedValue: vShares * uVal,
      vestedShares: vShares, total,
      taxAtFull: total * unitTaxable(g, price) * (ratePct / 100),
      next: nextVestDate(g, now),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [grants, priceByTicker, ratePct]);

  const totalValue = rows.reduce((s, r) => s + r.grossValue, 0);
  const vestedValue = rows.reduce((s, r) => s + r.vestedValue, 0);
  const unvestedValue = Math.max(0, totalValue - vestedValue);
  const estTax = rows.reduce((s, r) => s + r.taxAtFull, 0);
  const concentration = totalValue + otherNetWorth > 0 ? (totalValue / (totalValue + otherNetWorth)) * 100 : null;
  const soonest = rows.map((r) => r.next).filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0] ?? null;

  function startNew() { setForm(BLANK); setEditingId(null); setShowForm(true); setErr(""); }
  function startEdit(g: EquityGrant) {
    setForm({
      label: g.label ?? "", ticker: g.ticker ?? "", company_name: g.company_name ?? "", grant_type: g.grant_type,
      total_shares: Number(g.total_shares ?? 0), strike_price: g.strike_price, current_price_manual: g.current_price_manual,
      grant_date: g.grant_date, vest_start_date: g.vest_start_date, vest_months: g.vest_months, cliff_months: g.cliff_months, notes: g.notes,
    });
    setEditingId(g.id); setShowForm(true); setErr("");
  }
  function save() {
    if (!form.total_shares || form.total_shares <= 0) { setErr("Enter the number of shares."); return; }
    setErr("");
    startTransition(async () => {
      const res = await saveEquityGrant(form, editingId ?? undefined);
      if (res.error) { setErr(res.error.includes("equity_grants") ? "Run supabase/equity-grants.sql first." : res.error); return; }
      setShowForm(false); setEditingId(null); setForm(BLANK); router.refresh();
    });
  }
  function remove(id: string) {
    startTransition(async () => { await deleteEquityGrant(id); router.refresh(); });
  }

  const meta = TYPE_META[form.grant_type];
  const input: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", fontSize: "13px", fontFamily: "var(--font-body)" };
  const lbl: React.CSSProperties = { fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", marginBottom: "4px", display: "block" };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px", maxWidth: "1000px", width: "100%", margin: "0 auto" }} className="bt-mobile-nav-pad">
      <div style={{ marginBottom: "20px" }}>
        <a href="/planning" style={{ fontSize: "12px", color: "var(--text-tertiary)", textDecoration: "none" }}>← Planning</a>
        <h1 style={{ fontSize: "24px", fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--text-primary)", margin: "8px 0 4px" }}>Equity compensation</h1>
        <p style={{ fontSize: "13px", color: "var(--text-tertiary)", maxWidth: "70ch" }}>
          Track RSUs, options, and ESPP at the live price. See what&apos;s vested, when the rest vests, the rough tax when it does, and how much of your net worth rides on one stock. Estimates only, real equity tax needs an advisor.
        </p>
      </div>

      {/* Summary */}
      {grants.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px", marginBottom: "18px" }}>
          {[
            { label: "Total equity value", value: fmt(totalValue), tone: "var(--text-primary)" },
            { label: "Vested (accessible)", value: fmt(vestedValue), tone: "#00d395" },
            { label: "Unvested (locked)", value: fmt(unvestedValue), tone: "#f59e0b" },
            { label: `Est. tax at vest (${ratePct}%)`, value: fmt(estTax), tone: "var(--text-secondary)" },
          ].map((c) => (
            <div key={c.label} style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "12px", padding: "12px 14px" }}>
              <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)", marginBottom: "4px" }}>{c.label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "20px", color: c.tone }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Concentration + next vest */}
      {grants.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "18px" }}>
          {concentration != null && (
            <div style={{ flex: "1 1 240px", background: concentration >= 20 ? "rgba(245,158,11,0.06)" : "var(--card-bg)", border: `1px solid ${concentration >= 20 ? "rgba(245,158,11,0.3)" : "var(--card-border)"}`, borderRadius: "12px", padding: "12px 14px" }}>
              <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                <strong style={{ fontFamily: "var(--font-mono)", color: concentration >= 20 ? "#f59e0b" : "var(--text-primary)", fontSize: "15px" }}>{concentration.toFixed(0)}%</strong> of your net worth is in company equity
                {concentration >= 20 && <span style={{ color: "#f59e0b" }}> — heavy concentration. Vested shares are the easiest to diversify.</span>}
              </div>
            </div>
          )}
          {soonest && (
            <div style={{ flex: "1 1 200px", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "12px", padding: "12px 14px" }}>
              <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Next shares vest <strong style={{ color: "var(--text-primary)" }}>{fmtDate(soonest)}</strong></div>
            </div>
          )}
          <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "8px", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "12px", padding: "8px 12px" }}>
            <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>Marginal rate</span>
            <input type="number" value={ratePct} min={0} max={60} onChange={(e) => setRatePct(Math.max(0, Math.min(60, Number(e.target.value) || 0)))}
              style={{ width: "52px", padding: "5px 7px", borderRadius: "7px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", fontSize: "12px", fontFamily: "var(--font-mono)" }} />
            <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>%</span>
          </div>
        </div>
      )}

      {/* Grant list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
        {rows.map((r) => (
          <div key={r.g.id} style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "12px", padding: "13px 15px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--text-primary)" }}>{r.g.label || r.g.ticker || r.g.company_name || "Grant"}</span>
              <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", color: "var(--accent, #818cf8)", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: "6px", padding: "2px 6px" }}>{TYPE_META[r.g.grant_type].label}</span>
              {r.g.ticker && <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>{r.g.ticker}{r.priceKnown ? ` · ${fmtFull(r.price)}` : ""}</span>}
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "15px", color: "var(--text-primary)" }}>{r.priceKnown ? fmt(r.grossValue) : "—"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", marginTop: "7px", fontSize: "11.5px", color: "var(--text-tertiary)" }}>
              <span><span style={{ fontFamily: "var(--font-mono)", color: "var(--green)" }}>{r.vestedShares.toLocaleString()}</span> / {r.total.toLocaleString()} vested</span>
              {r.priceKnown && <span>Vested value <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{fmt(r.vestedValue)}</span></span>}
              {r.next && <span>Next vest {fmtDate(r.next)}</span>}
              {!r.priceKnown && <span style={{ color: "#f59e0b" }}>Add a ticker or current price to value this</span>}
              <span style={{ marginLeft: "auto", display: "flex", gap: "10px" }}>
                <button onClick={() => startEdit(r.g)} disabled={pending} style={{ background: "none", border: "none", color: "var(--accent, #818cf8)", fontSize: "11px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>Edit</button>
                <button onClick={() => remove(r.g.id)} disabled={pending} style={{ background: "none", border: "none", color: "var(--text-tertiary)", fontSize: "11px", cursor: "pointer", fontFamily: "var(--font-body)" }}>Delete</button>
              </span>
            </div>
          </div>
        ))}
      </div>

      {!showForm && (
        <button onClick={startNew} style={{ padding: "10px 16px", borderRadius: "10px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>+ Add a grant</button>
      )}

      {/* Form */}
      {showForm && (
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "14px", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>{editingId ? "Edit grant" : "New grant"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
            <div><label style={lbl}>Label</label><input style={input} value={form.label ?? ""} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="2025 refresh" /></div>
            <div><label style={lbl}>Ticker (public)</label><input style={input} value={form.ticker ?? ""} onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })} placeholder="AAPL" /></div>
            <div><label style={lbl}>Type</label>
              <select style={input} value={form.grant_type} onChange={(e) => setForm({ ...form, grant_type: e.target.value as EquityGrantType })}>
                {(Object.keys(TYPE_META) as EquityGrantType[]).map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Total shares</label><input style={input} type="number" value={form.total_shares || ""} onChange={(e) => setForm({ ...form, total_shares: Number(e.target.value) })} /></div>
            {meta.hasStrike && <div><label style={lbl}>{meta.strikeLabel}</label><input style={input} type="number" value={form.strike_price ?? ""} onChange={(e) => setForm({ ...form, strike_price: e.target.value === "" ? null : Number(e.target.value) })} /></div>}
            <div><label style={lbl}>Current price {form.ticker ? "(auto if blank)" : "(manual)"}</label><input style={input} type="number" value={form.current_price_manual ?? ""} onChange={(e) => setForm({ ...form, current_price_manual: e.target.value === "" ? null : Number(e.target.value) })} placeholder={form.ticker ? "live" : "e.g. 42"} /></div>
            <div><label style={lbl}>Vesting start</label><input style={input} type="date" value={form.vest_start_date ?? ""} onChange={(e) => setForm({ ...form, vest_start_date: e.target.value || null })} /></div>
            <div><label style={lbl}>Vest months</label><input style={input} type="number" value={form.vest_months || ""} onChange={(e) => setForm({ ...form, vest_months: Number(e.target.value) })} placeholder="48" /></div>
            <div><label style={lbl}>Cliff months</label><input style={input} type="number" value={form.cliff_months || ""} onChange={(e) => setForm({ ...form, cliff_months: Number(e.target.value) })} placeholder="12" /></div>
          </div>
          {err && <div style={{ fontSize: "12px", color: "#f59e0b" }}>{err}</div>}
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={save} disabled={pending} style={{ padding: "9px 16px", borderRadius: "9px", border: "none", background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "#fff", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)", opacity: pending ? 0.6 : 1 }}>{pending ? "Saving…" : "Save grant"}</button>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} disabled={pending} style={{ padding: "9px 16px", borderRadius: "9px", border: "1px solid var(--card-border)", background: "none", color: "var(--text-secondary)", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
