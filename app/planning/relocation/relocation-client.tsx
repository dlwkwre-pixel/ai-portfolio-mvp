"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RelocationScenario } from "./relocation-actions";
import { saveRelocationScenario, deleteRelocationScenario } from "./relocation-actions";
import AddToPlanButton from "@/app/planning/add-to-plan-button";
import InfoTooltip from "@/app/components/info-tooltip";
import { US_STATES, retirementStateTax } from "@/lib/tax/estimator";

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function HintDot({ text }: { text: string }) {
  return (
    <InfoTooltip text={text} align="start" width={230}>
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "14px", height: "14px", borderRadius: "50%", marginLeft: "5px", cursor: "help", background: "rgba(63,174,74,0.12)", border: "1px solid rgba(63,174,74,0.3)", color: "var(--accent, #5fbf9a)", fontSize: "10px", fontWeight: 700 }}>?</span>
    </InfoTooltip>
  );
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: "8px", border: "1px solid var(--border-subtle)", background: "var(--bg-base)", color: "var(--text-primary)", fontSize: "14px", fontFamily: "var(--font-body)", outline: "none", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "6px" };
const cardStyle: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg, 14px)", padding: "16px 18px" };

export default function RelocationClient({
  scenarios, prefillIncome, prefillExpenses,
}: {
  scenarios: RelocationScenario[]; prefillIncome: number; prefillExpenses: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = scenarios[0] ?? null;

  const [name, setName] = useState(active?.name ?? "New city");
  const [currentCity, setCurrentCity] = useState(active?.current_city ?? "");
  const [newCity, setNewCity] = useState(active?.new_city ?? "");
  const [isRemote, setIsRemote] = useState(active?.is_remote ?? false);
  const [currentIncome, setCurrentIncome] = useState<number>(active?.current_income_monthly || prefillIncome);
  const [newIncome, setNewIncome] = useState<number>(active?.new_income_monthly || prefillIncome);
  const [currentExpenses, setCurrentExpenses] = useState<number>(active?.current_expenses_monthly || prefillExpenses);
  const [colDelta, setColDelta] = useState<number>(active?.col_delta_pct ?? 0);
  const [movingCost, setMovingCost] = useState<number>(active?.moving_cost ?? 0);
  const [currentState, setCurrentState] = useState<string>("");
  const [newState, setNewState] = useState<string>("");
  const [investRate, setInvestRate] = useState<number>(7);
  const [horizonYears, setHorizonYears] = useState<number>(10);
  const [saved, setSaved] = useState(false);

  const effNewIncome = isRemote ? currentIncome : newIncome;

  const calc = useMemo(() => {
    const newExpenses = currentExpenses * (1 + colDelta / 100);
    // State income-tax swing — where you LIVE determines it. Often the biggest hidden
    // difference between two cities (e.g. TX/FL have none, CA/NY are high). Rough estimate.
    const stCur = currentState ? retirementStateTax(currentIncome * 12, currentState, "single") : 0;
    const stNew = newState ? retirementStateTax(effNewIncome * 12, newState, "single") : 0;
    const stateTaxDeltaAnnual = stNew - stCur; // + = you pay MORE state tax after the move
    const stateTaxDeltaMo = stateTaxDeltaAnnual / 12;
    const savingsNow = currentIncome - currentExpenses;
    const savingsAfter = effNewIncome - newExpenses - stateTaxDeltaMo;
    const delta = savingsAfter - savingsNow;
    const breakEvenIncome = currentIncome + (newExpenses - currentExpenses) + stateTaxDeltaMo;
    const paybackMonths = delta > 0 && movingCost > 0 ? movingCost / delta : null;
    // Buying power: what your current income is "worth" in the new city's cost basis.
    const buyingPower = colDelta !== -100 ? currentIncome / (1 + colDelta / 100) : currentIncome;
    return { newExpenses, savingsNow, savingsAfter, delta, breakEvenIncome, paybackMonths, stateTaxDeltaAnnual, buyingPower };
  }, [currentIncome, currentExpenses, effNewIncome, colDelta, movingCost, currentState, newState]);

  // Long-run net-worth impact: the recurring savings delta invested over the horizon,
  // net of the upfront move cost (also compounded as opportunity cost).
  const longRun = useMemo(() => {
    const rm = investRate / 100 / 12;
    const months = Math.max(1, horizonYears) * 12;
    const annuityFV = rm > 0 ? calc.delta * ((Math.pow(1 + rm, months) - 1) / rm) : calc.delta * months;
    const upfrontFV = -movingCost * Math.pow(1 + investRate / 100, horizonYears);
    return annuityFV + upfrontFV;
  }, [calc.delta, movingCost, investRate, horizonYears]);

  function handleSave() {
    startTransition(async () => {
      const res = await saveRelocationScenario(
        { name: name.trim() || "New city", current_city: currentCity || null, new_city: newCity || null, is_remote: isRemote, current_income_monthly: currentIncome, new_income_monthly: effNewIncome, current_expenses_monthly: currentExpenses, col_delta_pct: colDelta, moving_cost: movingCost, notes: null },
        active?.id
      );
      if (!res.error) { setSaved(true); router.refresh(); }
    });
  }
  function handleDelete() {
    if (!active || !confirm("Delete this relocation plan?")) return;
    startTransition(async () => { await deleteRelocationScenario(active.id); router.refresh(); });
  }

  const better = calc.delta >= 0;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      {/* Header */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-base)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "3px" }}>
          <Link href="/planning?tab=events" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Planning
          </Link>
          <span style={{ color: "var(--border)" }}>/</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Relocation</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <span style={{ fontSize: "16px", fontWeight: 700 }}>Relocation Planner</span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Salary vs. cost-of-living — what a move really nets you</span>
        </div>
      </div>

      {/* Body */}
      <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px 80px", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "1000px", width: "100%", margin: "0 auto" }}>

        {/* Verdict hero */}
        <div style={{ ...cardStyle, background: `linear-gradient(135deg, color-mix(in srgb, ${better ? "var(--green)" : "var(--red)"} 8%, var(--bg-card)), var(--bg-card))`, border: `1px solid color-mix(in srgb, ${better ? "var(--green)" : "var(--red)"} 26%, transparent)` }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: better ? "var(--green)" : "var(--red)" }}>{better ? "Move comes out ahead" : "Move costs you"}</div>
              <div style={{ fontSize: "26px", fontWeight: 800, fontFamily: "var(--font-display)", letterSpacing: "-1px", color: better ? "var(--green)" : "var(--red)", lineHeight: 1.1, marginTop: "2px" }}>
                {calc.delta >= 0 ? "+" : "−"}{fmt(Math.abs(Math.round(calc.delta)))}<span style={{ fontSize: "14px", color: "var(--text-tertiary)", fontWeight: 600 }}>/mo to savings</span>
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>{currentCity || "current city"} → {newCity || "new city"}{isRemote ? " · remote" : ""}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{horizonYears}-yr net-worth impact</div>
              <div style={{ fontSize: "22px", fontWeight: 800, fontFamily: "var(--font-mono)", color: longRun >= 0 ? "var(--green)" : "var(--red)" }}>{longRun >= 0 ? "+" : "−"}{fmt(Math.abs(Math.round(longRun)))}</div>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>delta invested @ {investRate}%</div>
            </div>
          </div>
        </div>

        {/* Cities + remote */}
        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div><label style={labelStyle}>Current city</label><input style={inputStyle} value={currentCity} onChange={(e) => { setCurrentCity(e.target.value); setSaved(false); }} placeholder="e.g. Austin, TX" /></div>
            <div><label style={labelStyle}>New city</label><input style={inputStyle} value={newCity} onChange={(e) => { setNewCity(e.target.value); setSaved(false); }} placeholder="e.g. Denver, CO" /></div>
            <div><label style={labelStyle}>Current state (tax)</label>
              <select style={inputStyle} value={currentState} onChange={(e) => { setCurrentState(e.target.value); setSaved(false); }}>
                <option value="">— optional —</option>
                {US_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </div>
            <div><label style={labelStyle}>New state (tax)</label>
              <select style={inputStyle} value={newState} onChange={(e) => { setNewState(e.target.value); setSaved(false); }}>
                <option value="">— optional —</option>
                {US_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <button type="button" onClick={() => { setIsRemote((v) => !v); setSaved(false); }}
            style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "14px", padding: "8px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontFamily: "var(--font-body)", border: `1px solid ${isRemote ? "var(--brand-blue, #0ea5a0)" : "var(--border-subtle)"}`, background: isRemote ? "rgba(14,165,160,0.1)" : "var(--bg-base)", color: isRemote ? "var(--brand-blue, #0ea5a0)" : "var(--text-secondary)" }}>
            <span style={{ width: "15px", height: "15px", borderRadius: "4px", border: `1.5px solid ${isRemote ? "var(--brand-blue, #0ea5a0)" : "var(--border-default, rgba(255,255,255,0.2))"}`, background: isRemote ? "var(--brand-blue, #0ea5a0)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {isRemote && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </span>
            Staying remote — keeping my current salary
          </button>
        </div>

        {/* Numbers */}
        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "14px" }}>
            <div><label style={labelStyle}>Income / mo (now)</label><input style={inputStyle} type="number" min="0" value={currentIncome || ""} onChange={(e) => { setCurrentIncome(Number(e.target.value)); setSaved(false); }} /></div>
            {!isRemote && <div><label style={labelStyle}>New income / mo</label><input style={inputStyle} type="number" min="0" value={newIncome || ""} onChange={(e) => { setNewIncome(Number(e.target.value)); setSaved(false); }} /></div>}
            <div><label style={labelStyle}>Expenses / mo (now)</label><input style={inputStyle} type="number" min="0" value={currentExpenses || ""} onChange={(e) => { setCurrentExpenses(Number(e.target.value)); setSaved(false); }} /></div>
            <div><label style={labelStyle}>Cost-of-living change</label>
              <div style={{ position: "relative" }}>
                <input style={{ ...inputStyle, paddingRight: "26px" }} type="number" value={colDelta || ""} onChange={(e) => { setColDelta(Number(e.target.value)); setSaved(false); }} placeholder="e.g. -12" />
                <span style={{ position: "absolute", right: "11px", top: "50%", transform: "translateY(-50%)", fontSize: "13px", color: "var(--text-tertiary)" }}>%</span>
              </div>
            </div>
            <div><label style={labelStyle}>One-time moving cost</label><input style={inputStyle} type="number" min="0" value={movingCost || ""} onChange={(e) => { setMovingCost(Number(e.target.value)); setSaved(false); }} /></div>
          </div>
          <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "12px", lineHeight: 1.5 }}>
            Cost-of-living change = how much more (+) or less (−) {newCity || "the new city"} costs vs {currentCity || "your current city"}. Look it up on Numbeo or BestPlaces and enter the difference.
          </p>
        </div>

        {/* Verdict */}
        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px 10px" }}>
            <Metric label="New expenses / mo" value={fmt(Math.round(calc.newExpenses))} sub={`${colDelta >= 0 ? "+" : ""}${colDelta}% COL`} />
            <Metric label="Monthly savings change" value={`${calc.delta >= 0 ? "+" : ""}${fmt(Math.round(calc.delta))}`} sub="after the move" accent={better ? "var(--green)" : "var(--red)"} />
            <Metric label="Break-even salary" value={fmt(Math.round(calc.breakEvenIncome))} sub="to match today" />
          </div>

          <div style={{ marginTop: "14px", padding: "10px 12px", borderRadius: "10px",
            background: better ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${better ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)"}`,
            fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.55 }}>
            {better
              ? `This move leaves you ${fmt(Math.round(calc.delta))}/mo better off (${fmt(Math.round(calc.delta * 12))}/yr).`
              : `This move costs you ${fmt(Math.abs(Math.round(calc.delta)))}/mo (${fmt(Math.abs(Math.round(calc.delta * 12)))}/yr).`}
            {isRemote
              ? ` Since you're staying remote, it's purely a cost-of-living play${colDelta < 0 ? " — a cheaper city is an instant raise to your savings." : "."}`
              : ` To keep today's lifestyle you'd need at least ${fmt(Math.round(calc.breakEvenIncome))}/mo${effNewIncome >= calc.breakEvenIncome ? " — the offer clears that bar." : " — the offer falls short."}`}
            {calc.paybackMonths != null && ` The ${fmt(movingCost)} move pays for itself in ${Math.ceil(calc.paybackMonths)} month${Math.ceil(calc.paybackMonths) === 1 ? "" : "s"}.`}
            {(currentState && newState && Math.abs(calc.stateTaxDeltaAnnual) > 200) && (
              <> State income tax {calc.stateTaxDeltaAnnual < 0 ? "drops" : "rises"} ~<strong style={{ color: calc.stateTaxDeltaAnnual < 0 ? "var(--green)" : "var(--amber)", fontFamily: "var(--font-mono)" }}>{fmt(Math.abs(Math.round(calc.stateTaxDeltaAnnual)))}/yr</strong> ({currentState}→{newState})
                {calc.stateTaxDeltaAnnual < 0 ? " — a quiet raise most movers overlook." : ", already folded into the numbers above."}</>
            )}
          </div>
        </div>

        {/* Long-run impact */}
        <div style={cardStyle}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, display: "flex", alignItems: "center", marginBottom: "12px" }}>
            The move, compounded<HintDot text="A monthly savings difference is small — until it's invested for years. This projects the recurring delta (minus the upfront move cost) growing at your assumed return." />
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", alignItems: "flex-end", marginBottom: "14px" }}>
            <div style={{ flex: "0 1 150px" }}><label style={labelStyle}>Invest savings at (%)</label><input style={inputStyle} type="number" min="0" step="0.5" value={investRate || ""} onChange={(e) => setInvestRate(Number(e.target.value) || 0)} /></div>
            <div style={{ flex: "0 1 150px" }}><label style={labelStyle}>Over (years)</label><input style={inputStyle} type="number" min="1" max="40" value={horizonYears || ""} onChange={(e) => setHorizonYears(Number(e.target.value) || 0)} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "14px 10px" }}>
            <Metric label={`${horizonYears}-yr impact`} value={`${longRun >= 0 ? "+" : "−"}${fmt(Math.abs(Math.round(longRun)))}`} sub="net worth vs staying" accent={longRun >= 0 ? "var(--green)" : "var(--red)"} />
            <Metric label="Buying power there" value={fmt(Math.round(calc.buyingPower))} sub={`your ${fmt(Math.round(currentIncome))} adjusted`} />
            {calc.paybackMonths != null && <Metric label="Move pays for itself" value={`${Math.ceil(calc.paybackMonths)} mo`} sub={`on ${fmt(movingCost)} cost`} accent="var(--green)" />}
          </div>
        </div>

        {/* Add to plan — one-time move cost + the ongoing savings change */}
        {(movingCost > 0 || calc.delta !== 0) && (
          <div style={cardStyle}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "10px" }}>Add to your plan</span>
            <AddToPlanButton
              label={`Move to ${newCity || "new city"}`}
              category="relocation"
              amountImpact={-movingCost}
              recurringAnnual={Math.round(calc.delta * 12)}
              note={`Models the ${fmt(movingCost)} move${calc.delta !== 0 ? ` and the ${calc.delta >= 0 ? "+" : ""}${fmt(Math.round(calc.delta * 12))}/yr change in savings` : ""} from that year, so your forecast reflects the move.`}
            />
          </div>
        )}

        {/* Save row */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <input style={{ ...inputStyle, width: "200px" }} value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} placeholder="Plan name" />
          <button type="button" onClick={handleSave} disabled={pending} style={{ padding: "9px 18px", borderRadius: "8px", border: "none", background: pending ? "rgba(14,165,160,0.5)" : "var(--brand-blue, #0ea5a0)", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: pending ? "not-allowed" : "pointer", fontFamily: "var(--font-body)" }}>
            {pending ? "Saving…" : active ? "Update plan" : "Save plan"}
          </button>
          {active && (
            <button type="button" onClick={handleDelete} disabled={pending} style={{ padding: "9px 14px", borderRadius: "8px", border: "1px solid var(--border-subtle)", background: "var(--bg-card)", color: "var(--text-secondary)", fontSize: "13px", fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-body)" }}>
              Delete
            </button>
          )}
          {saved && <span style={{ fontSize: "12px", color: "var(--green)" }}>Saved</span>}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "5px" }}>{label}</div>
      <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: "var(--font-display)", letterSpacing: "-0.5px", color: accent ?? "var(--text-primary)", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "5px" }}>{sub}</div>}
    </div>
  );
}
