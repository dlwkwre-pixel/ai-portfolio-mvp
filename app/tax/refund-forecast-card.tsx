"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui-primitives";
import type { RefundSetup } from "./page";
import { saveRefundInputs } from "./tax-actions";
import { forecastRefund, payDateSplit, PAY_PERIODS, type PayFrequency, type PaystubInputs } from "@/lib/tax/refund-forecast";
import type { FilingStatus } from "@/lib/tax/estimator";

// Refund forecast: the latest paystub's YTD numbers + the rest of the year projected, against
// the year's federal tax. Inputs are saved per tax year.

const money = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString()}`;
const FREQ_LABELS: Record<PayFrequency, string> = { weekly: "Weekly", biweekly: "Every 2 weeks", semimonthly: "Twice a month", monthly: "Monthly" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDay = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

const fieldStyle: React.CSSProperties = {
  width: "100%", minHeight: "44px", background: "var(--bg-base)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-md)",
  padding: "8px 10px", fontSize: "var(--text-sm)", color: "var(--text-primary)", fontFamily: "var(--font-body)",
};
const labelStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: "5px", fontSize: "var(--text-2xs)", fontWeight: 700, letterSpacing: "0.06em",
  textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)",
};
const hintStyle: React.CSSProperties = { fontSize: "var(--text-2xs)", fontWeight: 400, letterSpacing: 0, textTransform: "none", color: "var(--text-muted)", lineHeight: 1.4 };

type Draft = Record<"payDate" | "ytdGross" | "ytdFedWithheld" | "ytdPreTax" | "checkGross" | "checkFedWithheld" | "checkPreTax" | "futureGross" | "interest" | "overtimePremium", string>;

const str = (v: number | null | undefined) => (v == null ? "" : String(v));
const parse = (v: string): number | null => {
  const t = v.replace(/[$,\s]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export default function RefundForecastCard({ setup, year, filing, investments }: {
  setup: RefundSetup;
  year: number;
  filing: FilingStatus;
  investments: { shortTerm: number; longTerm: number; dividends: number };
}) {
  const router = useRouter();
  const saved = setup.saved;
  const [editing, setEditing] = useState(!saved);
  const [frequency, setFrequency] = useState<PayFrequency>(saved?.frequency ?? setup.defaultFrequency);
  const [bonusOnStub, setBonusOnStub] = useState(saved?.bonusOnStub ?? false);
  const [draft, setDraft] = useState<Draft>({
    payDate: saved?.payDate ?? "",
    ytdGross: str(saved?.ytdGross), ytdFedWithheld: str(saved?.ytdFedWithheld), ytdPreTax: str(saved?.ytdPreTax),
    checkGross: str(saved?.checkGross), checkFedWithheld: str(saved?.checkFedWithheld), checkPreTax: str(saved?.checkPreTax),
    futureGross: str(saved?.futureGross), interest: str(saved?.interest ?? setup.interestEstimate), overtimePremium: str(saved?.overtimePremium),
  });
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  // Live forecast from whatever is on screen, once the required numbers are in.
  const stub: PaystubInputs | null = (() => {
    const g = parse(draft.ytdGross), f = parse(draft.ytdFedWithheld), p = parse(draft.ytdPreTax);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.payDate) || Number(draft.payDate.slice(0, 4)) !== year || !g || f == null) return null;
    return {
      payDate: draft.payDate, frequency, ytdGross: g, ytdFedWithheld: f, ytdPreTax: p ?? 0,
      checkGross: parse(draft.checkGross), checkFedWithheld: parse(draft.checkFedWithheld), checkPreTax: parse(draft.checkPreTax),
      futureGross: parse(draft.futureGross), interest: parse(draft.interest), overtimePremium: parse(draft.overtimePremium), bonusOnStub,
    };
  })();
  const result = stub ? forecastRefund({ filing, stub, salaryAnnual: setup.salaryAnnual, k401Pct: setup.k401Pct, bonus: setup.bonus, investments }) : null;
  const defaultFuture = setup.salaryAnnual > 0 ? setup.salaryAnnual / PAY_PERIODS[frequency] : null;
  const stubMonth = Number(draft.payDate.slice(5, 7));
  const showBonusToggle = !!setup.bonus && stubMonth === setup.bonus.month;

  function save() {
    if (!stub) { setMsg({ text: `Enter the pay date (in ${year}), YTD gross and YTD federal tax.`, ok: false }); return; }
    setMsg(null);
    startTransition(async () => {
      const res = await saveRefundInputs(year, stub);
      if (res.error) { setMsg({ text: res.error, ok: false }); return; }
      setEditing(false);
      router.refresh();
    });
  }

  const owe = result ? result.refund < 0 : false;
  const ahead = stub ? payDateSplit(stub.payDate, stub.frequency).ahead : [];

  return (
    <div className="tax-card" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px 12px" }}>
        <div aria-hidden style={{ width: "36px", height: "36px", borderRadius: "var(--radius-md)", background: "var(--surface-006)", border: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "17px", flexShrink: 0 }}>🧾</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--text-primary)", margin: 0, fontFamily: "var(--font-display)" }}>{`${year} refund forecast`}</p>
          <p style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)", margin: "1px 0 0" }}>
            {saved && !editing ? `From your ${fmtDay(saved.payDate)} paystub` : "From your latest paystub's year-to-date column"}
          </p>
        </div>
        {saved && !editing && <Button size="sm" onClick={() => setEditing(true)} style={{ minHeight: "44px" }}>Update paystub</Button>}
      </div>

      <div style={{ padding: "0 18px 16px", display: "flex", flexDirection: "column", gap: "14px" }}>
        {result && (
          <div>
            <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>{owe ? "You'd likely owe about" : "You'd likely get back about"}</p>
            <p style={{ margin: "2px 0 0", fontFamily: "var(--font-mono)", fontSize: "28px", fontWeight: 700, color: owe ? "var(--red)" : "var(--green)" }}>{money(result.refund)}</p>
            <div style={{ marginTop: "10px", display: "grid", gap: "4px", fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
              {[
                ["Federal tax withheld so far", money(result.withheldSoFar)],
                [`Still to be withheld (${result.checksLeft} paycheck${result.checksLeft === 1 ? "" : "s"}${result.bonus ? " + bonus" : ""})`, money(result.withheldAhead)],
                [`Your ${year} federal income tax`, `−${money(result.liability)}`],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "4px 0", borderTop: "1px solid var(--border-subtle)" }}>
                  <span>{k}</span><span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)", flexShrink: 0 }}>{v}</span>
                </div>
              ))}
            </div>
            <details style={{ marginTop: "8px" }}>
              <summary style={{ cursor: "pointer", fontSize: "var(--text-xs)", color: "var(--text-tertiary)", minHeight: "32px", display: "flex", alignItems: "center" }}>How this is figured</summary>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.6, display: "grid", gap: "4px", paddingTop: "4px" }}>
                <span>{`Wages for the year (after 401(k) and other pre-tax deductions): `}<b style={{ fontFamily: "var(--font-mono)" }}>{money(result.wages)}</b></span>
                {result.otherIncome !== 0 && <span>{`Interest, dividends and net trading gains: `}<b style={{ fontFamily: "var(--font-mono)" }}>{result.otherIncome < 0 ? "−" : ""}{money(result.otherIncome)}</b></span>}
                <span>{`Standard deduction${parse(draft.overtimePremium) ? " + overtime deduction" : ""}: `}<b style={{ fontFamily: "var(--font-mono)" }}>−{money(result.deductions)}</b>{` → taxable `}<b style={{ fontFamily: "var(--font-mono)" }}>{money(result.taxableIncome)}</b></span>
                {result.checksLeft > 0 && (
                  <span>{`Paychecks left (${ahead.map(fmtDay).join(", ")}): ${money(result.perCheck.gross)} gross, ${money(result.perCheck.preTax)} pre-tax, about ${money(result.perCheck.withheld)} federal withheld each.`}</span>
                )}
                {result.bonus && <span>{`Bonus: ${money(result.bonus.gross)} gross, ${money(result.bonus.withheld)} withheld (flat 22% federal rate on bonuses).`}</span>}
                <span style={{ color: "var(--text-muted)" }}>Federal only, using 2026 brackets. Doesn&apos;t include credits like the child tax credit or education credits, which would add to a refund. Update with each new paystub; it gets more exact as the year closes.</span>
              </div>
            </details>
          </div>
        )}

        {!result && !editing && (
          <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>Your saved paystub is from a different year. Update it to see this year&apos;s forecast.</p>
        )}

        {editing && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.55 }}>
              Use the <b>YTD</b> (year-to-date) column on your most recent paystub.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" }}>
              <label style={labelStyle}>Pay date<input type="date" value={draft.payDate} onChange={set("payDate")} style={fieldStyle} /></label>
              <label style={labelStyle}>
                Paid
                <select value={frequency} onChange={(e) => setFrequency(e.target.value as PayFrequency)} style={fieldStyle}>
                  {(Object.keys(FREQ_LABELS) as PayFrequency[]).map((f) => <option key={f} value={f}>{FREQ_LABELS[f]}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                YTD gross pay
                <input inputMode="decimal" value={draft.ytdGross} onChange={set("ytdGross")} placeholder="0.00" style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }} />
                <span style={hintStyle}>Total before anything comes out</span>
              </label>
              <label style={labelStyle}>
                YTD federal income tax
                <input inputMode="decimal" value={draft.ytdFedWithheld} onChange={set("ytdFedWithheld")} placeholder="0.00" style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }} />
                <span style={hintStyle}>&quot;Federal&quot;, &quot;Fed W/H&quot; or &quot;FIT&quot;, not Social Security or Medicare</span>
              </label>
              <label style={labelStyle}>
                YTD pre-tax deductions
                <input inputMode="decimal" value={draft.ytdPreTax} onChange={set("ytdPreTax")} placeholder="0.00" style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }} />
                <span style={hintStyle}>401(k) + health/dental/vision + HSA/FSA, added together</span>
              </label>
            </div>

            <details>
              <summary style={{ cursor: "pointer", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-secondary)", minHeight: "44px", display: "flex", alignItems: "center" }}>
                Optional: sharpen the estimate
              </summary>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", paddingTop: "4px" }}>
                <label style={labelStyle}>
                  This check: gross
                  <input inputMode="decimal" value={draft.checkGross} onChange={set("checkGross")} placeholder="Current column" style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }} />
                </label>
                <label style={labelStyle}>
                  This check: federal tax
                  <input inputMode="decimal" value={draft.checkFedWithheld} onChange={set("checkFedWithheld")} placeholder="Current column" style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }} />
                </label>
                <label style={labelStyle}>
                  This check: pre-tax deductions
                  <input inputMode="decimal" value={draft.checkPreTax} onChange={set("checkPreTax")} placeholder="Current column" style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }} />
                </label>
                <label style={labelStyle}>
                  Gross per check from here
                  <input inputMode="decimal" value={draft.futureGross} onChange={set("futureGross")} placeholder={defaultFuture ? defaultFuture.toFixed(2) : "Same as now"} style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }} />
                  <span style={hintStyle}>{defaultFuture ? "Defaults to your salary in Planning" : "Defaults to your average check"}</span>
                </label>
                <label style={labelStyle}>
                  Bank interest for {year}
                  <input inputMode="decimal" value={draft.interest} onChange={set("interest")} placeholder="0.00" style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }} />
                  <span style={hintStyle}>{setup.interestEstimate != null ? "Estimated from your linked savings" : "Savings account interest (1099-INT)"}</span>
                </label>
                <label style={labelStyle}>
                  Overtime premium for {year}
                  <input inputMode="decimal" value={draft.overtimePremium} onChange={set("overtimePremium")} placeholder="0.00" style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }} />
                  <span style={hintStyle}>Only the extra &quot;half&quot; of time-and-a-half; deductible up to $12,500</span>
                </label>
              </div>
            </details>

            {showBonusToggle && (
              <label style={{ display: "flex", alignItems: "center", gap: "8px", minHeight: "44px", fontSize: "var(--text-sm)", color: "var(--text-secondary)", cursor: "pointer" }}>
                <input type="checkbox" checked={bonusOnStub} onChange={(e) => setBonusOnStub(e.target.checked)} style={{ width: "18px", height: "18px", accentColor: "var(--brand-blue)" }} />
                My bonus is already included in these YTD numbers
              </label>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <Button variant="primary" onClick={save} disabled={pending} style={{ minHeight: "44px" }}>{pending ? "Saving…" : "Save paystub"}</Button>
              {saved && <Button onClick={() => { setEditing(false); setMsg(null); }} style={{ minHeight: "44px" }}>Cancel</Button>}
              {msg && <span role="status" style={{ fontSize: "var(--text-xs)", color: msg.ok ? "var(--green)" : "var(--red)" }}>{msg.text}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
