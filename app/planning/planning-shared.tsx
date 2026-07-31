"use client";

// Formatters, tax-bucket domain logic, and small reusable UI atoms shared across multiple
// Planning tabs (Overview, Balance Sheet, Cash Flow). Split out of planning-client.tsx so
// tab-specific code (e.g. balance-sheet-tab.tsx) can be dynamically imported without pulling
// in the whole 9,000+ line client component — this module is the shared dependency both sides
// import from, avoiding a circular import back into planning-client.tsx.

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BalanceSheetItem, CashFlowItem, BudgetHistoryEntry } from "./planning-actions";
import { updateBalanceSheetItem, updateCashFlowItem } from "./planning-actions";

// ── Formatters ──────────────────────────────────────────────────────────────

export function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
export function fmtFull(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function fmtPct(n: number) {
  return n.toFixed(1) + "%";
}
const FREQ_TO_MONTHLY: Record<string, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  semimonthly: 2,
  monthly: 1,
  quarterly: 1 / 3,
  annual: 1 / 12,
};
const FREQ_SUFFIX: Record<string, string> = {
  weekly: "wk", biweekly: "2wk", semimonthly: "½mo", monthly: "mo", quarterly: "qtr", annual: "yr",
};
export const FREQ_LABEL: Record<string, string> = {
  weekly: "Weekly", biweekly: "Every 2 weeks", semimonthly: "Twice a month",
  monthly: "Monthly", quarterly: "Quarterly", annual: "Annual",
};
export const FREQ_OPTIONS = ["weekly", "biweekly", "semimonthly", "monthly", "quarterly", "annual"] as const;

export function toMonthly(amount: number, frequency: string) {
  return amount * (FREQ_TO_MONTHLY[frequency] ?? 1);
}
export function freqSuffix(frequency: string): string {
  return FREQ_SUFFIX[frequency] ?? "mo";
}
export function getEffectiveBudget(
  budgetHistory: BudgetHistoryEntry[],
  itemId: string,
  year: number,
  month: number
): number | null {
  const entries = budgetHistory
    .filter(h => h.item_id === itemId &&
      (h.effective_year < year || (h.effective_year === year && h.effective_month <= month)))
    .sort((a, b) => b.effective_year !== a.effective_year ? b.effective_year - a.effective_year : b.effective_month - a.effective_month);
  return entries.length > 0 ? entries[0].amount : null;
}
export function fmtDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
export function fmtDateShort(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

// ── Balance Sheet helpers ─────────────────────────────────────────────────────

export type AssetBucket = { label: string; value: number; color: string };

export function computeAssetBuckets(assets: BalanceSheetItem[], portfolioValue: number): AssetBucket[] {
  const defs: { label: string; cats: string[]; color: string }[] = [
    { label: "Cash",        cats: ["cash"],                                                    color: "oklch(0.72 0.19 145)" },
    { label: "Portfolio",   cats: [],                                                          color: "oklch(0.65 0.18 195)" },
    { label: "Retirement",  cats: ["retirement"],                                              color: "oklch(0.72 0.16 220)" },
    { label: "Real Estate", cats: ["real_estate"],                                             color: "oklch(0.65 0.14 200)" },
    { label: "Other",       cats: ["vehicle", "personal_property", "business", "other_asset"], color: "oklch(0.58 0.06 260)" },
  ];
  return defs.flatMap((d) => {
    const v = d.label === "Portfolio"
      ? portfolioValue
      : assets.filter((a) => d.cats.includes(a.category)).reduce((s, a) => s + a.value, 0);
    return v > 0 ? [{ label: d.label, value: v, color: d.color }] : [];
  });
}

// Effective tax bucket for an asset — explicit tag wins, otherwise inferred from
// category so the breakdown is populated before users tag anything. Illiquid → null.
export function effectiveTaxBucket(a: BalanceSheetItem): "taxable" | "tax_deferred" | "tax_free" | null {
  if (a.tax_treatment === "taxable" || a.tax_treatment === "tax_deferred" || a.tax_treatment === "tax_free") return a.tax_treatment;
  if (a.category === "cash" || a.category === "investment") return "taxable";
  if (a.category === "retirement") return "tax_deferred";
  return null;
}

export const TAX_BUCKET_META: Record<"taxable" | "tax_deferred" | "tax_free", { label: string; color: string; note: string }> = {
  taxable:      { label: "Taxable",      color: "oklch(0.75 0.15 70)",  note: "Brokerage & savings. Gains taxed as you go; flexible, no withdrawal rules." },
  tax_deferred: { label: "Tax-deferred", color: "oklch(0.5 0.14 195)", note: "Traditional 401(k)/IRA. Withdrawals taxed as income; RMDs from age 73." },
  tax_free:     { label: "Tax-free",     color: "oklch(0.70 0.17 150)", note: "Roth & HSA. Qualified withdrawals tax-free; no RMDs on Roth IRA." },
};

// A linked BuyTune portfolio, classified by its account type.
export type PortfolioAccount = { id: string; name: string; account_type: string | null; value: number };

// Map a portfolio's account type to a tax bucket. Roth/HSA → tax-free; 401k/IRA/pension →
// tax-deferred; brokerage/cash/everything else → taxable. (Roth checked first so "Roth IRA"
// doesn't fall through to the generic "ira" → deferred branch.)
export function accountTypeTaxBucket(t: string | null): "taxable" | "tax_deferred" | "tax_free" {
  const s = (t ?? "").toLowerCase();
  if (s.includes("roth") || s.includes("hsa")) return "tax_free";
  if (s.includes("401") || s.includes("403") || s.includes("ira") || s.includes("pension") || s.includes("sep") || s.includes("simple") || s.includes("traditional") || s.includes("retire")) return "tax_deferred";
  return "taxable";
}
export function isRetirementAccountType(t: string | null): boolean {
  const s = (t ?? "").toLowerCase();
  return s.includes("401") || s.includes("403") || s.includes("ira") || s.includes("roth") || s.includes("pension") || s.includes("sep") || s.includes("retire");
}

// Compute the three tax buckets from balance-sheet items + linked portfolios (each
// portfolio bucketed by its own account type, e.g. a Roth IRA portfolio is tax-free).
export function computeTaxBuckets(assets: BalanceSheetItem[], portfolioAccounts: PortfolioAccount[]): { taxable: number; tax_deferred: number; tax_free: number; total: number } {
  let taxable = 0, tax_deferred = 0, tax_free = 0;
  for (const p of portfolioAccounts) {
    if (!(p.value > 0)) continue;
    const b = accountTypeTaxBucket(p.account_type);
    if (b === "tax_free") tax_free += p.value;
    else if (b === "tax_deferred") tax_deferred += p.value;
    else taxable += p.value;
  }
  for (const a of assets) {
    const b = effectiveTaxBucket(a);
    if (b === "taxable") taxable += a.value;
    else if (b === "tax_deferred") tax_deferred += a.value;
    else if (b === "tax_free") tax_free += a.value;
  }
  return { taxable, tax_deferred, tax_free, total: taxable + tax_deferred + tax_free };
}

// One-line read on tax diversification — the planning concept that having money across
// all three buckets gives you levers to control taxable income in retirement.
export function taxDiversificationInsight(b: { taxable: number; tax_deferred: number; tax_free: number; total: number }): string {
  if (b.total <= 0) return "Tag your accounts as taxable, tax-deferred, or tax-free to see your tax diversification.";
  const pct = (v: number) => (v / b.total) * 100;
  const dpct = pct(b.tax_deferred), fpct = pct(b.tax_free), tpct = pct(b.taxable);
  if (fpct < 5 && b.total > 25000) return "Almost no tax-free (Roth) money. Every retirement dollar will be taxed as income or capital gains — Roth space adds flexibility to control your tax bracket later.";
  if (dpct > 80) return "Heavily concentrated in tax-deferred accounts. Withdrawals are taxed as ordinary income and forced by RMDs at 73 — consider building taxable or Roth balances for flexibility.";
  if (tpct > 85 && b.total > 25000) return "Nearly everything is in taxable accounts. Tax-advantaged space (401k, IRA, Roth) could shelter more of your growth from taxes.";
  if (fpct >= 20 && dpct >= 20 && tpct >= 15) return "Well diversified across tax buckets — you'll have levers to manage taxable income in retirement.";
  return "A mix across taxable, tax-deferred, and tax-free accounts gives you the most control over taxes in retirement.";
}

export function computeBalanceFinnInsight(p: {
  liquidAssets: number; totalAssets: number; totalLiabilities: number;
  netWorth: number; portfolioTotalValue: number;
  effectiveExpenses: number; assets: BalanceSheetItem[];
  portfolioAccounts?: PortfolioAccount[];
}): string {
  if (p.totalAssets === 0) return "Add assets and liabilities below to unlock balance sheet intelligence.";
  const debtRatio = p.totalAssets > 0 ? (p.totalLiabilities / p.totalAssets) * 100 : 0;
  const emergencyMonths = p.effectiveExpenses > 0 ? p.liquidAssets / p.effectiveExpenses : 0;
  const cashPct = p.totalAssets > 0 ? (p.liquidAssets / p.totalAssets) * 100 : 0;
  const portfolioPct = p.netWorth > 0 ? (p.portfolioTotalValue / p.netWorth) * 100 : 0;
  // A linked retirement portfolio (Roth/401k/IRA) counts too — not just manual line items.
  const hasRetirement = p.assets.some((a) => a.category === "retirement")
    || (p.portfolioAccounts ?? []).some((pa) => pa.value > 0 && isRetirementAccountType(pa.account_type));
  if (debtRatio > 50) return `Liabilities represent ${debtRatio.toFixed(0)}% of total assets. Debt reduction is the highest-leverage balance sheet move — every dollar eliminated compounds forward as investable capital.`;
  if (p.effectiveExpenses > 0 && emergencyMonths < 1) return "Liquid cash covers less than 1 month of expenses. A single financial shock would force selling investments at a bad time. Building to 3 months is the top balance sheet priority.";
  if (!hasRetirement && p.totalAssets > 10000) return "No retirement account on your balance sheet. Add any 401k, IRA, or Roth IRA balances — Atlas needs these for an accurate long-term picture.";
  if (p.totalAssets > 50000 && cashPct > 30) return `Cash is ${cashPct.toFixed(0)}% of your assets. Moving excess above 6 months of expenses into investments would compound more effectively over time.`;
  if (p.netWorth > 30000 && portfolioPct < 15) return `Investment portfolio represents ${portfolioPct.toFixed(0)}% of net worth. Gradually increasing this allocation is one of the highest-leverage moves for long-term wealth.`;
  if (emergencyMonths >= 3 && debtRatio < 20 && p.netWorth > 0) return "Strong balance sheet — adequate reserves and low debt. Primary focus now is growing investment and retirement assets.";
  return "Build out your balance sheet with all assets and liabilities for the most complete picture.";
}

// ── Small UI atoms ──────────────────────────────────────────────────────────

export function InfoTooltip({ text, align = "center" }: { text: string; align?: "center" | "start" | "end" }) {
  const [visible, setVisible] = useState(false);
  const boxPos =
    align === "start" ? { left: 0, transform: "none" as const }
    : align === "end" ? { right: 0, transform: "none" as const }
    : { left: "50%", transform: "translateX(-50%)" };
  const arrowPos =
    align === "start" ? { left: "14px", transform: "none" as const }
    : align === "end" ? { right: "14px", transform: "none" as const }
    : { left: "50%", transform: "translateX(-50%)" };
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", verticalAlign: "middle" }}>
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={(e) => { e.stopPropagation(); setVisible((v) => !v); }}
        style={{
          background: "none", border: "1px solid var(--text-tertiary)", cursor: "pointer",
          color: "var(--text-tertiary)", padding: 0, margin: "0 3px",
          fontSize: "10px", fontFamily: "var(--font-body)", fontWeight: 600,
          lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: "13px", height: "13px", borderRadius: "50%", flexShrink: 0,
        }}
        aria-label="More info"
      >i</button>
      {visible && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 8px)",
          background: "var(--bg-overlay, #0d1829)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)", padding: "10px 13px",
          fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)",
          lineHeight: 1.55, width: "230px", maxWidth: "70vw", zIndex: 100,
          boxShadow: "0 6px 20px rgba(0,0,0,0.4)", pointerEvents: "none",
          textTransform: "none", letterSpacing: "normal", fontWeight: 400,
          ...boxPos,
        }}>
          {text}
          <div style={{
            position: "absolute", top: "100%",
            width: 0, height: 0,
            borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
            borderTop: "5px solid var(--border)",
            ...arrowPos,
          }} />
        </div>
      )}
    </span>
  );
}

// ── Add/Edit item categories + shared form styles ──────────────────────────────

export const ASSET_CATEGORIES: [string, string][] = [
  ["cash",              "Cash & Bank Accounts"],
  ["investment",        "Investment / Brokerage"],
  ["retirement",        "Retirement Account (401k / IRA / Roth)"],
  ["real_estate",       "Real Estate"],
  ["vehicle",           "Vehicle"],
  ["personal_property", "Personal Property (jewelry, watches, art)"],
  ["business",          "Business Interest"],
  ["other_asset",       "Other Asset"],
];

export const LIABILITY_CATEGORIES: [string, string][] = [
  ["mortgage",      "Mortgage"],
  ["auto_loan",     "Auto Loan"],
  ["student_loan",  "Student Loan"],
  ["credit_card",   "Credit Card Debt"],
  ["personal_loan", "Personal Loan"],
  ["other_liability","Other Debt"],
];

// Tax buckets — shown only for liquid/investable assets, the foundation for
// tax-aware withdrawal modeling (taxable vs Traditional vs Roth).
export const TAX_TREATMENT_OPTIONS: [string, string][] = [
  ["taxable",      "Taxable (brokerage, savings)"],
  ["tax_deferred", "Tax-deferred (Traditional)"],
  ["tax_free",     "Tax-free (Roth / HSA)"],
];
export const LIQUID_ASSET_CATS = new Set(["cash", "investment", "retirement"]);
export function defaultTaxTreatment(cat: string): string {
  if (cat === "retirement") return "tax_deferred";
  return "taxable";
}
export const TAX_TREATMENT_LABEL: Record<string, string> = {
  taxable: "Taxable", tax_deferred: "Tax-deferred", tax_free: "Tax-free",
};

export const inputStyle: React.CSSProperties = {
  flex: 1, minWidth: "140px", padding: "7px 10px",
  borderRadius: "var(--radius-md)", border: "1px solid var(--border)",
  background: "var(--bg-surface)", color: "var(--text-primary)",
  fontSize: "13px", fontFamily: "var(--font-body)", outline: "none",
};
export const selectStyle: React.CSSProperties = {
  padding: "7px 10px", borderRadius: "var(--radius-md)",
  border: "1px solid var(--border)", background: "var(--bg-surface)",
  color: "var(--text-primary)", fontSize: "13px", fontFamily: "var(--font-body)",
  cursor: "pointer",
};
export const btnPrimaryStyle: React.CSSProperties = {
  padding: "7px 14px", borderRadius: "var(--radius-md)",
  background: "var(--brand-gradient)", color: "#fff",
  border: "none", fontSize: "12px", fontWeight: 600,
  fontFamily: "var(--font-body)", cursor: "pointer",
};
export const btnSecondaryStyle: React.CSSProperties = {
  padding: "7px 12px", borderRadius: "var(--radius-md)",
  border: "1px solid var(--border)", background: "transparent",
  color: "var(--text-secondary)", fontSize: "12px",
  fontFamily: "var(--font-body)", cursor: "pointer",
};
export const iconBtnStyle: React.CSSProperties = {
  padding: "4px", background: "none", border: "none",
  color: "var(--text-tertiary)", cursor: "pointer", lineHeight: 1,
};

export function AddItemRow({
  type, onAdd, placeholder, sectionType = "asset",
}: {
  type: "balance" | "cashflow";
  onAdd: (fd: FormData) => void;
  placeholder?: string;
  sectionType?: "asset" | "liability";
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [cat, setCat] = useState(sectionType === "liability" ? "mortgage" : "cash");
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await onAdd(fd);
      formRef.current?.reset();
      setCat(sectionType === "liability" ? "mortgage" : "cash");
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: "6px",
          padding: "7px 12px", borderRadius: "var(--radius-md)",
          border: "1px dashed var(--border)", background: "transparent",
          color: "var(--text-tertiary)", fontSize: "12px",
          fontFamily: "var(--font-body)", cursor: "pointer",
          transition: "color 0.15s, border-color 0.15s",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-strong)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-tertiary)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        Add item
      </button>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "flex-end" }}>
      <input name="label" required placeholder={placeholder ?? "Label"} autoFocus
        style={inputStyle} />

      {type === "balance" ? (
        <>
          <select name="category" style={selectStyle} value={cat} onChange={(e) => setCat(e.target.value)}>
            {(sectionType === "liability" ? LIABILITY_CATEGORIES : ASSET_CATEGORIES).map(([val, lbl]) => (
              <option key={val} value={val}>{lbl}</option>
            ))}
          </select>
          <input aria-label="Value ($)" name="value" type="number" min="0" step="0.01" placeholder="Value ($)" required style={{ ...inputStyle, width: "120px" }} />
          {sectionType !== "liability" && LIQUID_ASSET_CATS.has(cat) && (
            <select key={cat} name="tax_treatment" style={selectStyle} defaultValue={defaultTaxTreatment(cat)} title="How this account is taxed — used for tax-aware retirement modeling">
              {TAX_TREATMENT_OPTIONS.map(([val, lbl]) => (
                <option key={val} value={val}>{lbl}</option>
              ))}
            </select>
          )}
        </>
      ) : (
        <>
          <select name="type" style={selectStyle} defaultValue="income">
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          <select name="frequency" style={selectStyle} defaultValue="monthly">
            {FREQ_OPTIONS.map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
          </select>
          <input aria-label="Amount" name="amount" type="number" min="0" step="0.01" placeholder="Amount" required style={{ ...inputStyle, width: "120px" }} />
        </>
      )}

      <button type="submit" disabled={pending} style={btnPrimaryStyle}>{pending ? "Adding…" : "Add"}</button>
      <button type="button" onClick={() => setOpen(false)} style={btnSecondaryStyle}>Cancel</button>
    </form>
  );
}

export function LineItemRow({
  item, type, onDelete, isPrivate = false, editTitle,
}: {
  item: BalanceSheetItem | CashFlowItem;
  type: "balance" | "cashflow";
  onDelete: (id: string) => void;
  isPrivate?: boolean;
  editTitle?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  const isBalance = type === "balance";
  const bal = item as BalanceSheetItem;
  const cf = item as CashFlowItem;
  const [isVar, setIsVar] = useState(!!(cf as CashFlowItem).is_variable);
  const [editCat, setEditCat] = useState(isBalance ? bal.category : "");

  const displayValue = isPrivate
    ? "••••••"
    : isBalance
      ? fmtFull(bal.value)
      : fmtFull(cf.amount) + " / " + (freqSuffix(cf.frequency));

  const accentColor = isBalance
    ? (bal.is_liability ? "var(--red)" : "var(--green)")
    : (cf.type === "income" ? "var(--green)" : "var(--red)");

  function handleDelete() {
    if (!confirm(`Remove "${item.label}"?`)) return;
    startTransition(async () => { await onDelete(item.id); router.refresh(); });
  }

  function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("id", item.id);
    startTransition(async () => {
      if (isBalance) await updateBalanceSheetItem(fd);
      else await updateCashFlowItem(fd);
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <form onSubmit={handleUpdate} style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "flex-end", padding: "8px 0" }}>
        <input name="label" defaultValue={item.label} required style={inputStyle} />
        {isBalance ? (
          <>
            <select name="category" value={editCat} onChange={(e) => setEditCat(e.target.value)} style={selectStyle}>
              {(bal.is_liability ? LIABILITY_CATEGORIES : ASSET_CATEGORIES).map(([val, lbl]) => (
                <option key={val} value={val}>{lbl}</option>
              ))}
            </select>
            <input name="value" type="number" min="0" step="0.01" defaultValue={bal.value} style={{ ...inputStyle, width: "120px" }} />
            {!bal.is_liability && LIQUID_ASSET_CATS.has(editCat) && (
              <select key={editCat} name="tax_treatment" style={selectStyle}
                defaultValue={bal.tax_treatment ?? defaultTaxTreatment(editCat)}
                title="How this account is taxed — used for tax-aware retirement modeling">
                {TAX_TREATMENT_OPTIONS.map(([val, lbl]) => (
                  <option key={val} value={val}>{lbl}</option>
                ))}
              </select>
            )}
          </>
        ) : (
          <>
            <select name="type" defaultValue={cf.type} style={selectStyle}>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
            <select name="frequency" defaultValue={cf.frequency} style={selectStyle}>
              {FREQ_OPTIONS.map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
            </select>
            <input name="amount" type="number" min="0" step="0.01" defaultValue={cf.amount} style={{ ...inputStyle, width: "120px" }} />
            <input aria-label="Due day (1–31)" name="due_day" type="number" min="1" max="31" defaultValue={cf.due_day ?? ""} placeholder="Due day (1–31)" style={{ ...inputStyle, width: "140px" }} />
            {cf.type === "income" && (
              <>
                <input type="hidden" name="is_variable" value={isVar ? "1" : "0"} />
                <button type="button" onClick={() => setIsVar((v) => !v)} title="Income that fluctuates month to month"
                  style={{ display: "flex", alignItems: "center", gap: "6px", padding: "0 10px", height: "34px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontFamily: "var(--font-body)", border: `1px solid ${isVar ? "var(--brand-blue)" : "var(--border-subtle)"}`, background: isVar ? "rgba(14,165,160,0.1)" : "var(--bg-base)", color: isVar ? "var(--brand-blue)" : "var(--text-secondary)" }}>
                  <span style={{ width: "14px", height: "14px", borderRadius: "4px", border: `1.5px solid ${isVar ? "var(--brand-blue)" : "var(--border-default)"}`, background: isVar ? "var(--brand-blue)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {isVar && <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </span>
                  Variable
                </button>
              </>
            )}
          </>
        )}
        <button type="submit" disabled={pending} style={btnPrimaryStyle}>{pending ? "Saving…" : "Save"}</button>
        <button type="button" onClick={() => setEditing(false)} style={btnSecondaryStyle}>Cancel</button>
      </form>
    );
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "12px",
      padding: "10px 0", borderBottom: "1px solid var(--border-subtle)",
    }}>
      <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: accentColor, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: "13px", color: "var(--text-primary)", fontFamily: "var(--font-body)", display: "flex", alignItems: "center", gap: "7px", minWidth: 0 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
        {!isBalance && (cf as CashFlowItem).is_variable && (
          <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--brand-blue)", background: "rgba(14,165,160,0.1)", border: "1px solid rgba(14,165,160,0.25)", padding: "1px 6px", borderRadius: "var(--radius-full, 999px)", flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>~ Variable</span>
        )}
        {isBalance && !bal.is_liability && bal.category !== "cash" && (() => {
          const b = effectiveTaxBucket(bal);
          if (!b) return null;
          const meta = TAX_BUCKET_META[b];
          return (
            <span title={meta.note} style={{ fontSize: "10px", fontWeight: 600, color: meta.color, background: `color-mix(in oklch, ${meta.color} 14%, transparent)`, border: `1px solid color-mix(in oklch, ${meta.color} 35%, transparent)`, padding: "1px 6px", borderRadius: "var(--radius-full, 999px)", flexShrink: 0, whiteSpace: "nowrap" }}>{meta.label}</span>
          );
        })()}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: accentColor, fontWeight: 500 }}>{displayValue}</span>
      {item.id.startsWith("linked:") ? (
        // Synced from a connected/manual account — the source of truth lives on the
        // Connections page, so it can't be edited or deleted here.
        <span title="This balance syncs from your Connections page — update or unlink it there." style={{ fontSize: "10px", fontWeight: 600, color: "#5fbf9a", background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.3)", padding: "2px 7px", borderRadius: "var(--radius-full, 999px)", flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.04em", cursor: "help" }}>
          Synced
        </span>
      ) : (
        <>
          <button type="button" onClick={() => setEditing(true)} style={iconBtnStyle} title={editTitle ?? "Edit"}>
            <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
            <span className="bt-sr-only">Edit {item.label}</span>
          </button>
          <button type="button" onClick={handleDelete} disabled={pending} style={{ ...iconBtnStyle, color: "var(--red)" }} title="Delete">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
            <span className="bt-sr-only">Delete {item.label}</span>
          </button>
        </>
      )}
    </div>
  );
}
