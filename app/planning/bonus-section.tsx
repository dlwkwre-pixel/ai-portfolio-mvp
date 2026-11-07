"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui-primitives";
import { upsertBonusSettings } from "./planning-actions";
import { bonusTakeHome } from "@/lib/tax/bonus";
import { estimateTax, type FilingStatus, type IncomeType } from "@/lib/tax/estimator";
import { MONTH_NAMES } from "./planning-shared";

// Annual bonus as part of pay: a % of salary paid out in one month. Cash Flow expects it
// (after tax) only in that month, so it never inflates an ordinary month.

type Profile = {
  gross_monthly_income: number | null;
  filing_status: string | null;
  income_type: string | null;
  state_code: string | null;
  pre_tax_deductions_annual: number | null;
  k401_contribution_pct?: number | null;
  k401_is_roth?: boolean;
  has_401k?: boolean;
  bonus_pct?: number | null;
  bonus_month?: number | null;
  bonus_start?: string | null;
  bonus_includes_401k?: boolean | null;
};

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fieldStyle: React.CSSProperties = {
  width: "100%", minHeight: "40px", background: "var(--bg-base)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-md)",
  padding: "8px 10px", fontSize: "var(--text-sm)", color: "var(--text-primary)", fontFamily: "var(--font-body)",
};
const labelStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: "6px", fontSize: "var(--text-2xs)", fontWeight: 700, letterSpacing: "0.06em",
  textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)",
};

export default function BonusSection({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [pct, setPct] = useState(String(profile.bonus_pct ?? 0));
  const [month, setMonth] = useState(profile.bonus_month ?? 12);
  const [start, setStart] = useState((profile.bonus_start ?? "").slice(0, 7));
  const [with401k, setWith401k] = useState(profile.bonus_includes_401k ?? true);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const grossAnnual = (profile.gross_monthly_income ?? 0) * 12;
  const pctNum = Math.max(0, Number(pct) || 0);
  const stateRate = grossAnnual > 0
    ? estimateTax(grossAnnual / 12, (profile.filing_status as FilingStatus) || "single", (profile.income_type as IncomeType) || "w2", profile.state_code ?? "", profile.pre_tax_deductions_annual ?? 0).stateEffectiveRate / 100
    : 0;
  const est = bonusTakeHome({
    grossBonus: grossAnnual * pctNum / 100,
    k401Pct: profile.has_401k ? profile.k401_contribution_pct ?? 0 : 0,
    includes401k: with401k,
    isRoth: profile.k401_is_roth ?? false,
    stateRate: Number.isFinite(stateRate) ? stateRate : 0,
  });

  function save() {
    setMsg(null);
    const fd = new FormData();
    fd.set("bonus_pct", String(pctNum));
    fd.set("bonus_month", String(month));
    fd.set("bonus_start", start ? `${start}-01` : "");
    fd.set("bonus_includes_401k", String(with401k));
    startTransition(async () => {
      const res = await upsertBonusSettings(fd);
      setMsg(res.error ? { text: res.error, ok: false } : { text: "Saved. Cash Flow will expect it in its payout month.", ok: true });
      router.refresh();
    });
  }

  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
      <div>
        <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>Annual bonus</div>
        <p style={{ margin: "4px 0 0", fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
          A percent of your salary paid once a year. Cash Flow expects it only in its payout month, after taxes.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
        <label style={labelStyle}>
          % of salary
          <input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} style={{ ...fieldStyle, fontFamily: "var(--font-mono)" }} />
        </label>
        <label style={labelStyle}>
          Paid in
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={fieldStyle}>
            {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </label>
        <label style={labelStyle}>
          Starting
          <input type="month" value={start} onChange={(e) => setStart(e.target.value)} style={fieldStyle} />
        </label>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", minHeight: "44px", fontSize: "var(--text-sm)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", cursor: "pointer" }}>
        <input type="checkbox" checked={with401k} onChange={(e) => setWith401k(e.target.checked)} style={{ width: "18px", height: "18px", accentColor: "var(--brand-blue)" }} />
        My 401(k) contribution also comes out of the bonus
      </label>
      {pctNum > 0 && grossAnnual > 0 && (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.6 }}>
          {"About "}<strong style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{money(est.takeHome)}</strong>
          {` take-home from a ${money(est.gross)} bonus in ${MONTH_NAMES[month - 1]}`}
          {est.k401 > 0 ? ` (${money(est.k401)} to your 401(k), ${money(est.taxes)} withheld)` : ` (${money(est.taxes)} withheld)`}
          {". Employers withhold bonuses at a flat 22% federal rate, so your tax refund may differ."}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <Button variant="primary" onClick={save} disabled={pending} style={{ minHeight: "44px" }}>{pending ? "Saving…" : "Save bonus"}</Button>
        {msg && <span role="status" style={{ fontSize: "var(--text-xs)", color: msg.ok ? "var(--green)" : "var(--red)", fontFamily: "var(--font-body)" }}>{msg.text}</span>}
      </div>
    </div>
  );
}
