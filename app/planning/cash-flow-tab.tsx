"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { CashFlowItem, ExpenseActual, BudgetHistoryEntry } from "./planning-actions";
import {
  addCashFlowItem, updateCashFlowItem, deleteCashFlowItem, setCashFlowItemCategory,
  logExpenseActual, moveMerchantActual, syncForecastToActuals,
  markCashFlowItemPaid, clearCashFlowItemPaid, updateSurplusAllocation,
} from "./planning-actions";
import type { ImportedItem } from "@/app/api/planning/import/route";
import {
  fmt, fmtFull, toMonthly, getEffectiveBudget,
  LineItemRow, AddItemRow, sectionHeadStyle,
  MONTH_NAMES, normLabel, categoryOf, EXPENSE_CATEGORIES, getCategoryForExpense,
  StatementImportPanel,
} from "./planning-shared";
import { computeAvailableToInvest, nextOccurrenceOnOrAfter, toDateOnly } from "@/lib/planning/cash-flow-forecast";

// ── Budget grouping (statement → budget-line preview) ──────────────────────

type BudgetGroupRow = {
  id: string;              // unique key: category or "sub:<normLabel>"
  label: string;           // display label (editable)
  category: string;        // bucket name
  amount: number;          // editable monthly total
  merchants: { label: string; amount: number }[];
  isSubscription: boolean;
  selected: boolean;
  existingId: string | null;      // matching existing budget item id
  existingAmount: number | null;
  existingLabel: string | null;
  // Only set for rows sourced from groupForBudgetFromActuals — undefined for
  // statement-parsed rows, which don't have a logging-history concept.
  monthsElapsed?: number;
  monthsWithData?: number;
};

function groupForBudget(items: ImportedItem[], existingItems: CashFlowItem[]): BudgetGroupRow[] {
  const catMap = new Map<string, { amount: number; merchants: { label: string; amount: number }[] }>();
  const subMap = new Map<string, { amount: number; origLabel: string }>();

  for (const item of items) {
    if (item.type === "income") continue;
    const monthly = toMonthly(item.amount, item.frequency);
    const cat = categoryOf(item);
    if (cat === "Subscriptions") {
      const norm = normLabel(item.label);
      const prev = subMap.get(norm);
      subMap.set(norm, { amount: (prev?.amount ?? 0) + monthly, origLabel: prev?.origLabel ?? item.label });
    } else {
      const g = catMap.get(cat) ?? { amount: 0, merchants: [] };
      g.amount += monthly;
      g.merchants.push({ label: item.label, amount: monthly });
      catMap.set(cat, g);
    }
  }

  function findExisting(cat: string, label?: string): CashFlowItem | undefined {
    if (label) {
      const n = normLabel(label);
      const byLabel = existingItems.find((i) => normLabel(i.label) === n);
      if (byLabel) return byLabel;
    }
    return existingItems.find((i) => categoryOf(i) === cat);
  }

  const catRows: BudgetGroupRow[] = Array.from(catMap.entries()).map(([cat, { amount, merchants }]) => {
    const ex = findExisting(cat);
    return {
      id: cat,
      label: cat,
      category: cat,
      amount: Math.round(amount),
      merchants,
      isSubscription: false,
      selected: !ex,
      existingId: ex?.id ?? null,
      existingAmount: ex ? toMonthly(ex.amount, ex.frequency) : null,
      existingLabel: ex?.label ?? null,
    };
  });

  const subRows: BudgetGroupRow[] = Array.from(subMap.entries()).map(([norm, { amount, origLabel }]) => {
    const ex = existingItems.find((i) => normLabel(i.label) === norm);
    return {
      id: `sub:${norm}`,
      label: origLabel,
      category: "Subscriptions",
      amount: Math.round(amount * 100) / 100,
      merchants: [],
      isSubscription: true,
      selected: !ex,
      existingId: ex?.id ?? null,
      existingAmount: ex ? toMonthly(ex.amount, ex.frequency) : null,
      existingLabel: ex?.label ?? null,
    };
  });

  return [...catRows, ...subRows].sort((a, b) => {
    if (a.isSubscription !== b.isSubscription) return a.isSubscription ? 1 : -1;
    return a.label.localeCompare(b.label);
  });
}

// Builds budget-line suggestions from already-logged expense_actuals instead of a
// freshly parsed statement — every actuals row already belongs to an existing
// cash_flow_item (StatementImportPanel only ever logs against a matched item), so
// this is strictly a refresh of existing items' amounts, not new-category discovery.
function groupForBudgetFromActuals(
  actuals: ExpenseActual[],
  existingItems: CashFlowItem[],
  windowMonths: number = 12
): BudgetGroupRow[] {
  const relevant = actuals.filter((a) => a.cash_flow_item_id !== null);
  const byItem = new Map<string, ExpenseActual[]>();
  for (const a of relevant) {
    const list = byItem.get(a.cash_flow_item_id!) ?? [];
    list.push(a);
    byItem.set(a.cash_flow_item_id!, list);
  }

  const rows: BudgetGroupRow[] = [];

  for (const [itemId, itemActuals] of byItem) {
    const item = existingItems.find((i) => i.id === itemId);
    if (!item) continue; // item since deleted, actuals orphaned

    // Per-item window — NOT computed globally across all items. A user who's logged
    // Rent for 12 months and just added "Coffee" this month must not have Coffee's
    // one month divided by Rent's 12-month history (would understate it ~12x).
    //
    // The window spans this item's own first-to-last LOGGED occurrence — it does NOT
    // extend to today. A user who logged Rent every month Jan-Mar and hasn't logged
    // it since must not have Apr-today silently counted as "$0 spent" (they're
    // "not logged yet," not "confirmed zero") — that's what was previously dragging
    // a consistent $1,309/mo down toward $1,000 whenever recent months were unlogged.
    // total-spent-over-the-observed-span / span is still the right monthly-equivalent
    // for a genuinely irregular expense (a semi-annual insurance payment logged twice,
    // 6 months apart, naturally produces a 6-month span) without needing to detect or
    // model cadence — it just no longer invents phantom months past the last real entry.
    const periods = itemActuals.map((a) => a.period_year * 12 + (a.period_month - 1)).sort((a, b) => a - b);
    const earliest = periods[0];
    const latest = periods[periods.length - 1];
    const monthsElapsed = Math.max(1, Math.min(windowMonths, latest - earliest + 1));
    const cutoff = latest - monthsElapsed + 1;
    const inWindow = itemActuals.filter((a) => a.period_year * 12 + (a.period_month - 1) >= cutoff);
    const total = inWindow.reduce((s, a) => s + a.actual_amount, 0);
    const average = Math.round((total / monthsElapsed) * 100) / 100;

    rows.push({
      id: itemId, label: item.label, category: categoryOf(item), amount: average,
      merchants: [], isSubscription: categoryOf(item) === "Subscriptions",
      selected: true, // opt-OUT — every row is an existing item by construction; the review table's delta + coverage badges are what make that safe
      existingId: item.id, existingAmount: toMonthly(item.amount, item.frequency), existingLabel: item.label,
      monthsElapsed, monthsWithData: inWindow.length,
    });
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label));
}

// ── Shared budget review table ──────────────────────────────────────────────
// Used by both AiImportPanel (statement paste) and ActualsRefreshPanel (already-
// logged actuals) — kept as one presentational component parameterized by copy so
// neither flow's very different data-entry mechanics (paste+parse vs. synchronous
// DB aggregation) leak into the other's state machine.

type BudgetReviewTableProps = {
  rows: BudgetGroupRow[];
  onUpdateRow: (idx: number, patch: Partial<BudgetGroupRow>) => void;
  onSubmit: () => void;
  submitting: boolean;
  submitLabel: (selectedCount: number) => string;
  existingBannerText?: (existingCount: number) => string;
  secondaryAction?: { label: string; onClick: () => void };
};

function BudgetReviewTable({ rows, onUpdateRow, onSubmit, submitting, submitLabel, existingBannerText, secondaryAction }: BudgetReviewTableProps) {
  const selectedCount = rows.filter((r) => r.selected).length;
  const existingCount = rows.filter((r) => r.existingId).length;

  return (
    <>
      {existingCount > 0 && existingBannerText && (
        <div style={{ padding: "8px 12px", borderRadius: "var(--radius-md)", background: "rgba(63,174,74,0.06)", border: "1px solid rgba(63,174,74,0.18)", fontSize: "11px", color: "oklch(0.65 0.18 195)", fontFamily: "var(--font-body)" }}>
          {existingBannerText(existingCount)}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 100px", padding: "4px 6px", borderBottom: "1px solid var(--border-subtle)" }}>
          {["", "Category / Item", "Monthly ($)"].map((h, i) => (
            <span key={i} style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: i === 2 ? "right" : "left" }}>{h}</span>
          ))}
        </div>

        {rows.map((row, idx) => {
          // A caution, not a block — total/monthsElapsed can't tell "genuinely
          // biannual expense" from "normally-monthly, just under-logged," so flag
          // sparse coverage and let the user judge whether to trust the average.
          const lowCoverage = row.monthsElapsed !== undefined && row.monthsWithData !== undefined
            && row.monthsElapsed > 0 && row.monthsWithData / row.monthsElapsed < 0.5;
          const delta = row.existingAmount != null ? row.amount - row.existingAmount : null;
          // Only worth calling out the matched item's own name when it differs from
          // this row's label (paste flow: category "Food & Dining" -> item "Groceries").
          // Actuals-flow rows always have label === existingLabel, so this naturally
          // stays quiet there — the delta line below already says what changed.
          const showExistingNote = row.existingId && row.existingLabel && row.label !== row.existingLabel;
          return (
            <div key={row.id} style={{
              borderBottom: "1px solid var(--border-subtle)",
              opacity: row.selected ? 1 : 0.45,
              background: row.existingId ? "rgba(63,174,74,0.03)" : "transparent",
            }}>
              <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 100px", alignItems: "center", padding: "7px 6px", gap: "8px" }}>
                <input type="checkbox" checked={row.selected} onChange={() => onUpdateRow(idx, { selected: !row.selected })}
                  style={{ accentColor: "var(--brand-blue)", cursor: "pointer" }} />
                <div style={{ minWidth: 0 }}>
                  <input
                    value={row.label}
                    onChange={(e) => onUpdateRow(idx, { label: e.target.value })}
                    style={{ background: "transparent", border: "1px solid transparent", borderRadius: "4px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 500, padding: "2px 4px", width: "100%", outline: "none", boxSizing: "border-box" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand-blue)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "transparent")}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                    {row.isSubscription ? (
                      <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>Subscription</span>
                    ) : row.merchants.length > 0 ? (
                      <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                        {row.merchants.slice(0, 3).map((m) => m.label).join(", ")}{row.merchants.length > 3 ? ` +${row.merchants.length - 3} more` : ""}
                      </span>
                    ) : null}
                    {showExistingNote && (
                      <span style={{ fontSize: "10px", color: "oklch(0.65 0.18 195)", fontFamily: "var(--font-body)" }}>
                        · exists: {row.existingLabel} ${row.existingAmount?.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo
                      </span>
                    )}
                    {lowCoverage && (
                      <span title="This average may reflect sparse or inconsistent logging, not a real recurring cadence" style={{ fontSize: "9px", fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "999px", padding: "1px 6px" }}>
                        {row.monthsWithData} of {row.monthsElapsed} mo logged
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <input
                    type="number" min={0} step={0.01}
                    value={row.amount}
                    onChange={(e) => onUpdateRow(idx, { amount: Number(e.target.value) })}
                    style={{ background: "transparent", border: "1px solid transparent", borderRadius: "4px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "12px", padding: "2px 4px", width: "100%", textAlign: "right", outline: "none", boxSizing: "border-box" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand-blue)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "transparent")}
                  />
                  {delta !== null && Math.round(delta) !== 0 && (
                    <div style={{ fontSize: "9px", fontFamily: "var(--font-mono)", textAlign: "right", marginTop: "2px", color: delta > 0 ? "oklch(0.65 0.18 25)" : "oklch(0.72 0.19 145)" }}>
                      was {fmt(row.existingAmount!)} ({delta > 0 ? "+" : "−"}{fmt(Math.abs(delta))})
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={onSubmit} disabled={submitting || selectedCount === 0}
          style={{ padding: "7px 16px", borderRadius: "var(--radius-md)", border: "none", background: selectedCount === 0 ? "var(--border-subtle)" : "var(--brand-blue)", color: selectedCount === 0 ? "var(--text-tertiary)" : "#fff", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 600, cursor: selectedCount === 0 ? "default" : "pointer" }}>
          {submitting ? "Saving…" : submitLabel(selectedCount)}
        </button>
        {secondaryAction && (
          <button type="button" onClick={secondaryAction.onClick}
            style={{ padding: "7px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", background: "transparent", color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "12px", cursor: "pointer" }}>
            {secondaryAction.label}
          </button>
        )}
        <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginLeft: "auto" }}>
          {selectedCount} of {rows.length} selected
        </span>
      </div>
    </>
  );
}

// ── AI Import Panel (paste a statement) ─────────────────────────────────────

type AiImportPanelProps = {
  existingItems: CashFlowItem[];
  onAdd: (rows: BudgetGroupRow[]) => Promise<void>;
};

function AiImportPanel({ existingItems, onAdd }: AiImportPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"paste" | "review" | "done">("paste");
  const [rawText, setRawText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [allParsed, setAllParsed] = useState<ImportedItem[]>([]);
  const [preview, setPreview] = useState<BudgetGroupRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [addedCount, setAddedCount] = useState<number | null>(null);

  async function handleParse() {
    if (!rawText.trim()) return;
    setParsing(true);
    setParseError(null);
    try {
      const res = await fetch("/api/planning/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText, mode: "statement" }),
      });
      const data = await res.json() as { items?: ImportedItem[]; error?: string };
      if (!res.ok || data.error) { setParseError(data.error ?? "Something went wrong."); return; }
      if (!data.items || data.items.length === 0) {
        setParseError("No expense items detected. Try pasting more of your statement.");
        return;
      }
      const merged = [...allParsed, ...data.items];
      setAllParsed(merged);
      setPreview(groupForBudget(merged, existingItems));
      setRawText("");
      setStep("review");
    } catch {
      setParseError("Network error — please try again.");
    } finally {
      setParsing(false);
    }
  }

  async function handleAdd() {
    const selected = preview.filter((r) => r.selected);
    if (selected.length === 0) return;
    setAdding(true);
    try {
      await onAdd(selected);
      setAddedCount(selected.length);
      setStep("done");
      router.refresh();
    } finally {
      setAdding(false);
    }
  }

  function reset() {
    setOpen(false); setStep("paste"); setRawText(""); setAllParsed([]);
    setPreview([]); setParseError(null); setAddedCount(null);
  }

  function updateRow(idx: number, patch: Partial<BudgetGroupRow>) {
    setPreview((prev) => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); setStep("paste"); setAddedCount(null); }}
        style={{
          display: "flex", alignItems: "center", gap: "6px",
          padding: "7px 14px", borderRadius: "var(--radius-md)",
          border: "1px dashed var(--border-subtle)", background: "transparent",
          color: "var(--text-tertiary)", fontFamily: "var(--font-body)",
          fontSize: "12px", cursor: "pointer", width: "100%", justifyContent: "center",
          transition: "border-color 0.15s, color 0.15s",
        }}
        onMouseEnter={(e) => { const b = e.currentTarget; b.style.color = "var(--text-secondary)"; b.style.borderColor = "var(--text-tertiary)"; }}
        onMouseLeave={(e) => { const b = e.currentTarget; b.style.color = "var(--text-tertiary)"; b.style.borderColor = "var(--border-subtle)"; }}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M8 2v8M5 7l3 3 3-3M2 11v1.5A1.5 1.5 0 003.5 14h9a1.5 1.5 0 001.5-1.5V11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Build budget from last month&apos;s statement
      </button>
    );
  }

  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Budget Setup from Statement</span>
          <p style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: "2px 0 0" }}>
            {step === "paste"
              ? "Atlas groups spending by category and estimates monthly targets. Existing budget items won't be touched."
              : `${allParsed.length} transactions analyzed across ${allParsed.length > 0 ? "your statement(s)" : "0 statements"}.`}
          </p>
        </div>
        <button type="button" onClick={reset}
          style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: "2px", fontSize: "18px", lineHeight: 1, flexShrink: 0 }}>
          ×
        </button>
      </div>

      {/* Done state */}
      {step === "done" && (
        <div style={{ textAlign: "center", padding: "12px 0" }}>
          <div style={{ fontSize: "20px", marginBottom: "6px", color: "var(--green)" }}>✓</div>
          <p style={{ fontSize: "13px", color: "var(--green)", fontFamily: "var(--font-body)", margin: 0, fontWeight: 600 }}>
            {addedCount} budget item{addedCount !== 1 ? "s" : ""} added
          </p>
          <button type="button" onClick={reset}
            style={{ marginTop: "10px", fontSize: "11px", color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "var(--font-body)" }}>
            Done
          </button>
        </div>
      )}

      {/* Review step */}
      {step === "review" && (
        <BudgetReviewTable
          rows={preview}
          onUpdateRow={updateRow}
          onSubmit={handleAdd}
          submitting={adding}
          submitLabel={(n) => `Add ${n} to Budget`}
          existingBannerText={(n) => `${n} categor${n !== 1 ? "ies" : "y"} already in your budget — pre-deselected. Re-check to update its amount instead of adding a duplicate.`}
          secondaryAction={{ label: "+ Add Another Statement", onClick: () => setStep("paste") }}
        />
      )}

      {/* Paste step */}
      {step === "paste" && (
        <>
          {allParsed.length > 0 && (
            <div style={{ padding: "6px 10px", borderRadius: "var(--radius-md)", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.18)", fontSize: "11px", color: "var(--green)", fontFamily: "var(--font-body)" }}>
              {allParsed.length} transactions already loaded — paste another statement to add to the mix.
            </div>
          )}
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={"Paste a credit card or bank statement — CSV export, copied transactions, or plain text. Atlas groups charges by category automatically."}
            rows={6}
            style={{ width: "100%", boxSizing: "border-box", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: "12px", padding: "10px 12px", resize: "vertical", outline: "none", lineHeight: 1.6 }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand-blue)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
          />
          {parseError && <p style={{ fontSize: "12px", color: "var(--red)", fontFamily: "var(--font-body)", margin: 0 }}>{parseError}</p>}
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button type="button" onClick={handleParse} disabled={parsing || !rawText.trim()}
              style={{ padding: "7px 16px", borderRadius: "var(--radius-md)", border: "none", background: !rawText.trim() || parsing ? "var(--border-subtle)" : "var(--brand-blue)", color: !rawText.trim() || parsing ? "var(--text-tertiary)" : "#fff", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 600, cursor: !rawText.trim() || parsing ? "default" : "pointer" }}>
              {parsing ? "Analyzing…" : "Analyze with Atlas"}
            </button>
            {allParsed.length > 0 && (
              <button type="button" onClick={() => setStep("review")}
                style={{ padding: "7px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", background: "transparent", color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "12px", cursor: "pointer" }}>
                Back to Review
              </button>
            )}
            <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
              {rawText.length > 0 ? `${rawText.length} chars` : "Max 8,000 characters"}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Actuals Refresh Panel (refresh from what's already logged) ─────────────

type ActualsRefreshPanelProps = {
  existingItems: CashFlowItem[];
  expenseActuals: ExpenseActual[];
  onAdd: (rows: BudgetGroupRow[]) => Promise<void>;
};

function ActualsRefreshPanel({ existingItems, expenseActuals, onAdd }: ActualsRefreshPanelProps) {
  const router = useRouter();
  const [preview, setPreview] = useState<BudgetGroupRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [addedCount, setAddedCount] = useState<number | null>(null);
  const [emptyNote, setEmptyNote] = useState(false);

  function open() {
    const rows = groupForBudgetFromActuals(expenseActuals, existingItems);
    if (rows.length === 0) { setEmptyNote(true); return; }
    setEmptyNote(false);
    setAddedCount(null);
    setPreview(rows);
  }

  function updateRow(idx: number, patch: Partial<BudgetGroupRow>) {
    setPreview((prev) => prev ? prev.map((r, i) => i === idx ? { ...r, ...patch } : r) : prev);
  }

  async function handleApply() {
    if (!preview) return;
    const selected = preview.filter((r) => r.selected);
    if (selected.length === 0) return;
    setAdding(true);
    try {
      await onAdd(selected);
      setAddedCount(selected.length);
      setPreview(null);
      router.refresh();
    } finally {
      setAdding(false);
    }
  }

  if (preview === null) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <button
          type="button"
          onClick={open}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "7px 14px", borderRadius: "var(--radius-md)",
            border: "1px dashed var(--border-subtle)", background: "transparent",
            color: "var(--text-tertiary)", fontFamily: "var(--font-body)",
            fontSize: "12px", cursor: "pointer", width: "100%", justifyContent: "center",
            transition: "border-color 0.15s, color 0.15s",
          }}
          onMouseEnter={(e) => { const b = e.currentTarget; b.style.color = "var(--text-secondary)"; b.style.borderColor = "var(--text-tertiary)"; }}
          onMouseLeave={(e) => { const b = e.currentTarget; b.style.color = "var(--text-tertiary)"; b.style.borderColor = "var(--border-subtle)"; }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M2 8a6 6 0 0110.5-4M14 8a6 6 0 01-10.5 4M12 2v3h-3M4 14v-3h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Refresh budget from your logged actuals
        </button>
        {emptyNote && (
          <p style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: 0, textAlign: "center" }}>
            No logged actuals yet — log some via &ldquo;Log from Statement&rdquo; first, or build from a pasted statement instead.
          </p>
        )}
        {addedCount !== null && (
          <p style={{ fontSize: "11px", color: "var(--green)", fontFamily: "var(--font-body)", margin: 0, textAlign: "center", fontWeight: 600 }}>
            ✓ {addedCount} budget item{addedCount !== 1 ? "s" : ""} updated
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Refresh Budget from Logged Actuals</span>
          <p style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: "2px 0 0" }}>
            Averaged from what you&apos;ve already logged via &ldquo;Log from Statement.&rdquo; This only updates items you already have — it can&apos;t discover categories you haven&apos;t budgeted for yet.
          </p>
        </div>
        <button type="button" onClick={() => setPreview(null)}
          style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: "2px", fontSize: "18px", lineHeight: 1, flexShrink: 0 }}>
          ×
        </button>
      </div>
      <BudgetReviewTable
        rows={preview}
        onUpdateRow={updateRow}
        onSubmit={handleApply}
        submitting={adding}
        submitLabel={(n) => `Update ${n} Budget Item${n !== 1 ? "s" : ""}`}
      />
    </div>
  );
}

// ── 50/30/20 framework ──────────────────────────────────────────────────────
// Maps each expense category into Needs vs Wants. Savings is the residual
// (income − needs − wants). Heuristic by design — Food & Dining leans grocery
// (a need); "Other" is treated as discretionary.
type SpendBucket = "needs" | "wants";
const CATEGORY_BUCKET: Record<string, SpendBucket> = {
  Housing: "needs",
  Transportation: "needs",
  "Food & Dining": "needs",
  Healthcare: "needs",
  Insurance: "needs",
  Utilities: "needs",
  Childcare: "needs",
  Entertainment: "wants",
  Travel: "wants",
  Fitness: "wants",
  Subscriptions: "wants",
  Other: "wants",
};
function bucketForCategory(category: string): SpendBucket {
  return CATEGORY_BUCKET[category] ?? "wants";
}

// ── Cash Flow OS ─────────────────────────────────────────────────────────────

const CF_CAT_COLORS: Record<string, string> = {
  "Housing":        "oklch(0.5 0.16 195)",
  "Transportation": "oklch(0.62 0.20 306)",
  "Food & Dining":  "oklch(0.74 0.19 56)",
  "Healthcare":     "oklch(0.68 0.18 163)",
  "Fitness":        "oklch(0.65 0.21 143)",
  "Insurance":      "oklch(0.60 0.14 219)",
  "Utilities":      "oklch(0.74 0.17 97)",
  "Entertainment":  "oklch(0.62 0.24 328)",
  "Travel":         "oklch(0.70 0.18 198)",
  "Subscriptions":  "oklch(0.62 0.19 270)",
  "Childcare":      "oklch(0.72 0.17 42)",
  "Other":          "oklch(0.55 0.05 258)",
};

function cfPolarToCart(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function cfArcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const gap = 2.0;
  const s = startDeg + gap / 2;
  const e = Math.min(endDeg - gap / 2, startDeg + 359.4);
  if (e <= s + 0.1) return "";
  const start = cfPolarToCart(cx, cy, r, s);
  const end   = cfPolarToCart(cx, cy, r, e);
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${e - s > 180 ? 1 : 0} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function BillCalendar({ cashFlowItems, year, month }: { cashFlowItems: CashFlowItem[]; year: number; month: number }) {
  const [tip, setTip] = useState<string | null>(null);
  const itemsWithDay = cashFlowItems.filter(i => i.due_day != null || i.due_day_2 != null);
  if (itemsWithDay.length === 0) return (
    <p style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-body)", margin: 0 }}>
      Set a due day on any income or expense item to see it here.
    </p>
  );
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay();
  const dayMap = new Map<number, CashFlowItem[]>();
  // Clamp into the real month (e.g. due_day=31 lands on the 28th/29th/30th in a
  // shorter month) instead of silently dropping the day entirely.
  const addOnDay = (rawDay: number, item: CashFlowItem) => {
    const d = Math.min(rawDay, daysInMonth);
    if (!dayMap.has(d)) dayMap.set(d, []);
    dayMap.get(d)!.push(item);
  };
  for (const item of itemsWithDay) {
    if (item.due_day != null) addOnDay(item.due_day, item);
    if (item.frequency === "semimonthly" && item.due_day_2 != null) addOnDay(item.due_day_2, item);
  }
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const today = new Date();
  const isNow = today.getFullYear() === year && today.getMonth() + 1 === month;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "3px", marginBottom: "2px" }}>
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: "10px", fontWeight: 700, color: "var(--text-muted)", fontFamily: "var(--font-body)", paddingBottom: "2px" }}>{d}</div>
        ))}
        {cells.map((day, i) => {
          const items = day ? (dayMap.get(day) ?? []) : [];
          const isToday = isNow && day === today.getDate();
          return (
            <div key={i}
              onMouseEnter={() => items.length > 0 && setTip(items.map(it => `${it.label}: ${fmtFull(it.frequency === "annual" ? it.amount / 12 : it.amount)}/mo`).join(" · "))}
              onMouseLeave={() => setTip(null)}
              style={{
                minHeight: "26px", borderRadius: "4px", padding: "2px 1px",
                background: isToday ? "rgba(63,174,74,0.1)" : items.length > 0 ? "rgba(255,255,255,0.03)" : "transparent",
                border: isToday ? "1px solid rgba(63,174,74,0.3)" : "1px solid transparent",
                cursor: items.length > 0 ? "default" : "default",
              }}>
              {day && (
                <>
                  <div style={{ textAlign: "center", fontSize: "10px", fontFamily: "var(--font-mono)", color: isToday ? "oklch(0.65 0.18 195)" : "var(--text-tertiary)" }}>{day}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1px", marginTop: "1px" }}>
                    {items.map((it, j) => (
                      <div key={j} style={{ height: "3px", borderRadius: "2px", background: it.type === "income" ? "oklch(0.72 0.19 145)" : "oklch(0.65 0.18 25)" }} />
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      {tip && (
        <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", padding: "6px 10px", background: "var(--surface-004)", borderRadius: "6px" }}>{tip}</div>
      )}
      <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
          <span style={{ width: "8px", height: "3px", borderRadius: "2px", display: "inline-block", background: "oklch(0.72 0.19 145)" }} /> Income
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
          <span style={{ width: "8px", height: "3px", borderRadius: "2px", display: "inline-block", background: "oklch(0.65 0.18 25)" }} /> Expense
        </span>
      </div>
    </div>
  );
}

function FiftyThirtyTwenty({
  needsMonthly, wantsMonthly, incomeMonthly, isPrivate,
}: {
  needsMonthly: number; wantsMonthly: number; incomeMonthly: number; isPrivate: boolean;
}) {
  const ph = (v: string) => (isPrivate ? "••••" : v);
  const savingsMonthly = incomeMonthly - needsMonthly - wantsMonthly;
  const pctOf = (v: number) => (incomeMonthly > 0 ? (v / incomeMonthly) * 100 : 0);

  const rows = [
    {
      key: "needs", label: "Needs", target: 50, value: needsMonthly, pct: pctOf(needsMonthly),
      good: (p: number) => p <= 52, warn: (p: number) => p <= 60,
      hint: "Housing, food, transport, insurance, utilities, healthcare, childcare",
    },
    {
      key: "wants", label: "Wants", target: 30, value: wantsMonthly, pct: pctOf(wantsMonthly),
      good: (p: number) => p <= 32, warn: (p: number) => p <= 40,
      hint: "Entertainment, travel, fitness, subscriptions, other discretionary",
    },
    {
      key: "savings", label: "Savings", target: 20, value: savingsMonthly, pct: pctOf(savingsMonthly),
      good: (p: number) => p >= 20, warn: (p: number) => p >= 10,
      hint: "What's left after needs and wants — invest it or pay down debt",
    },
  ];

  function statusColor(r: typeof rows[number]): string {
    if (r.good(r.pct)) return "oklch(0.72 0.19 145)";   // green
    if (r.warn(r.pct)) return "oklch(0.75 0.18 70)";    // amber
    return "oklch(0.65 0.18 25)";                        // red
  }

  if (incomeMonthly <= 0) return null;

  const onTrack = rows.filter((r) => r.good(r.pct)).length;
  const verdict = onTrack === 3
    ? "Textbook balance — you're hitting all three targets."
    : onTrack === 0
    ? "Your split is off the 50/30/20 guide on every front. Start with the largest gap."
    : `${onTrack} of 3 on target. ${rows.find((r) => !r.good(r.pct))?.label} is the one to work on.`;

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg, 14px)", padding: "16px 18px", marginBottom: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>50 / 30 / 20 Balance</span>
        </div>
        <span style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>% of income</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "13px" }}>
        {rows.map((r) => {
          const color = statusColor(r);
          const barPct = Math.min(100, Math.max(0, r.pct));
          const targetMarker = Math.min(100, r.target);
          return (
            <div key={r.key}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "5px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{r.label}</span>
                  <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>target {r.target}%</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color }}>{ph(`${r.pct.toFixed(0)}%`)}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)" }}>{ph(fmt(Math.round(r.value)))}/mo</span>
                </div>
              </div>
              {/* Bar with target marker */}
              <div style={{ position: "relative", height: "7px", background: "var(--bg-elevated, rgba(255,255,255,0.05))", borderRadius: "4px", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, width: `${barPct}%`, background: color, borderRadius: "4px", transition: "width 0.4s ease" }} />
              </div>
              <div style={{ position: "relative", height: "0" }}>
                <div style={{ position: "absolute", top: "-9px", left: `calc(${targetMarker}% - 1px)`, width: "2px", height: "11px", background: "var(--text-secondary)", opacity: 0.55 }} title={`Target ${r.target}%`} />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: "13px", paddingTop: "11px", borderTop: "1px solid var(--border-subtle)", fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
        {verdict}
      </div>
    </div>
  );
}

// ── Cash-flow Sankey ───────────────────────────────────────────────────────────
// The classic budget flow: one income source fanning out to every spending category
// plus savings, with ribbon thickness = dollars. Colored by 50/30/20 bucket.
const SANKEY_BUCKET_COLOR: Record<string, string> = {
  needs: "oklch(0.62 0.15 250)", wants: "oklch(0.66 0.16 300)", savings: "oklch(0.72 0.18 150)",
};
function CashFlowSankey({ income, leaves, isPrivate }: {
  income: number;
  leaves: { label: string; amount: number; bucket: "needs" | "wants" | "savings"; color?: string }[];
  isPrivate: boolean;
}) {
  const ph = (v: string) => (isPrivate ? "••••" : v);
  const fmtMo = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  const positive = leaves.filter((l) => l.amount > 0).sort((a, b) => (a.bucket === b.bucket ? b.amount - a.amount : a.bucket === "savings" ? 1 : b.bucket === "savings" ? -1 : 0));
  const total = positive.reduce((s, l) => s + l.amount, 0);
  if (total <= 0 || positive.length === 0) return null;

  const VB_W = 1000, padY = 8, rowGap = 8, MIN_BAND = 18;
  const n = positive.length;
  const sxRight = 230;            // income node right edge
  const txLeft = 660;            // leaf node left edge
  const nodeW = 16;
  const midx = (sxRight + txLeft) / 2;

  // Each band is proportional to its dollars, but floored to MIN_BAND so tiny categories
  // (e.g. Insurance $15) are still a visible band and their labels don't collide. The income
  // node grows to match the summed bands; the % shown in each label stays the true share.
  const baseH = Math.max(240, n * 30);
  const bandH = positive.map((l) => Math.max(MIN_BAND, (l.amount / total) * baseH));
  const usableH = bandH.reduce((s, h) => s + h, 0) + rowGap * (n - 1);
  const VB_H = usableH + padY * 2;

  // Each category is one horizontal band flowing from the income node to its leaf node.
  let cursor = padY;
  const segs = positive.map((l, i) => {
    const h = bandH[i];
    const ty0 = cursor, ty1 = cursor + h;
    const sy0 = cursor, sy1 = cursor + h;
    cursor += h + rowGap;
    return { ...l, ty0, ty1, sy0, sy1, h };
  });
  const incTop = padY, incBot = segs[segs.length - 1].sy1;

  // De-collide labels: tiny flows (e.g. Insurance $15) sit only a few px apart and their
  // text overlaps. Nudge each label down so neighbors are at least MIN_LABEL_GAP apart,
  // while the ribbon + node stay at their true proportional positions.
  const MIN_LABEL_GAP = 15;
  let lastLabelY = -Infinity;
  const labeled = segs.map((s) => {
    let labelY = (s.ty0 + s.ty1) / 2;
    if (labelY - lastLabelY < MIN_LABEL_GAP) labelY = lastLabelY + MIN_LABEL_GAP;
    lastLabelY = labelY;
    return { ...s, labelY };
  });

  return (
    <div className="cfo-zone" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "16px 18px", marginBottom: "10px", animationDelay: "70ms" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>Where your money flows</span>
        <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>{ph(fmtMo(income))}/mo in</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ display: "block", overflow: "visible" }} preserveAspectRatio="xMidYMid meet">
        {/* Income node */}
        <rect x={sxRight - nodeW} y={incTop} width={nodeW} height={Math.max(1, incBot - incTop)} rx="3" fill="var(--text-secondary)" opacity="0.85" />
        <text x={sxRight - nodeW - 8} y={(incTop + incBot) / 2} textAnchor="end" dominantBaseline="middle" style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "13px", fill: "var(--text-primary)" }}>Income</text>
        {/* Links + leaf nodes + labels */}
        {labeled.map((s, i) => {
          const color = s.color ?? SANKEY_BUCKET_COLOR[s.bucket];
          const path = `M${sxRight},${s.sy0.toFixed(1)} C${midx},${s.sy0.toFixed(1)} ${midx},${s.ty0.toFixed(1)} ${txLeft},${s.ty0.toFixed(1)} L${txLeft},${s.ty1.toFixed(1)} C${midx},${s.ty1.toFixed(1)} ${midx},${s.sy1.toFixed(1)} ${sxRight},${s.sy1.toFixed(1)} Z`;
          return (
            <g key={i}>
              <path d={path} fill={color} opacity="0.26" />
              <rect x={txLeft} y={s.ty0} width={nodeW} height={Math.max(1, s.h)} rx="3" fill={color} />
              <text x={txLeft + nodeW + 8} y={s.labelY} dominantBaseline="middle" style={{ fontFamily: "var(--font-body)", fontSize: "12px", fill: "var(--text-secondary)" }}>
                {s.label}
                <tspan style={{ fontFamily: "var(--font-mono)", fill: "var(--text-tertiary)", fontSize: "11px" }}> · {ph(fmtMo(s.amount))} ({Math.round((s.amount / total) * 100)}%)</tspan>
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function CashFlowOS({
  cashFlowItems, expenseActuals, budgetHistory, effectiveIncome, monthlyExpenses,
  monthlySavings, savingsRate, cashFlowFinnInsight, isPrivate, guided = false,
  liquidAssets, emergencyFundMonths, surplusToInvestPct, emergencyFundExpenseBasis,
}: {
  cashFlowItems: CashFlowItem[]; expenseActuals: ExpenseActual[];
  budgetHistory: BudgetHistoryEntry[];
  effectiveIncome: number; monthlyExpenses: number; monthlySavings: number;
  savingsRate: number; cashFlowFinnInsight: string; isPrivate: boolean; guided?: boolean;
  liquidAssets: number;
  emergencyFundMonths: number;    // 6 | 9 | 12, shared with plan-401k-section.tsx
  surplusToInvestPct: number;     // 0-100, see updateSurplusAllocation
  emergencyFundExpenseBasis: number; // effectiveExpenses — matches Plan401kSection's basis, NOT the narrower monthlyExpenses prop above
}) {
  const [cfExpanded, setCfExpanded] = useState(false);
  const cfAdvanced = !guided || cfExpanded;
  const router = useRouter();
  const now = new Date();
  const [selYear, setSelYear] = useState(now.getFullYear());
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [highlightedCat, setHighlightedCat] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importSuccess, setImportSuccess] = useState<number | null>(null);
  const [expandedBreakdown, setExpandedBreakdown] = useState<Set<string>>(new Set());
  const [movingKey, setMovingKey] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [viewMode, setViewMode] = useState<"monthly" | "annual" | "ytd" | "average">("monthly");
  const [showCal, setShowCal] = useState(false);

  const ytdMonths = selYear < now.getFullYear() ? 12 : now.getMonth() + 1;
  const mult = viewMode === "annual" ? 12 : viewMode === "ytd" ? ytdMonths : 1;
  const ph = (v: string) => isPrivate ? "••••" : v;
  const expenseItems = cashFlowItems.filter(i => i.type === "expense");
  const incomeItems  = cashFlowItems.filter(i => i.type === "income");
  const yearOptions  = [now.getFullYear(), now.getFullYear() - 1];

  function getActual(itemId: string) {
    return expenseActuals.find(
      a => a.cash_flow_item_id === itemId && a.period_year === selYear && a.period_month === selMonth
    );
  }
  function getHistory(itemId: string) {
    return expenseActuals
      .filter(a => a.cash_flow_item_id === itemId)
      .sort((a, b) => b.period_year !== a.period_year ? b.period_year - a.period_year : b.period_month - a.period_month)
      .slice(0, 6);
  }
  function forecastedMonthly(item: CashFlowItem) {
    return toMonthly(item.amount, item.frequency);
  }

  const isCurrentMonth = selYear === now.getFullYear() && selMonth === (now.getMonth() + 1);
  const daysInSelMonth = new Date(selYear, selMonth, 0).getDate();
  const pacingRatio = isCurrentMonth ? Math.max(0.01, now.getDate() / daysInSelMonth) : 1;

  // Pre-indexed actual lookups by item+period — used by both the single-period actuals
  // blend below and the (intentionally uncapped) multi-month Average view, which would
  // otherwise re-scan the full expenseActuals array per item per month.
  const actualsIndex = useMemo(() => {
    const idx = new Map<string, number>();
    for (const a of expenseActuals) {
      if (a.cash_flow_item_id) idx.set(`${a.cash_flow_item_id}|${a.period_year}|${a.period_month}`, a.actual_amount);
    }
    return idx;
  }, [expenseActuals]);

  const catData = useMemo(() => {
    return EXPENSE_CATEGORIES.map(cat => {
      const items = expenseItems.filter(i => categoryOf(i) === cat.label);
      const budgeted = items.reduce((s, i) => {
        const hist = getEffectiveBudget(budgetHistory, i.id, selYear, selMonth);
        return s + toMonthly(hist ?? i.amount, i.frequency);
      }, 0);
      const actualItems = expenseActuals.filter(a =>
        items.some(ei => ei.id === a.cash_flow_item_id) && a.period_year === selYear && a.period_month === selMonth
      );
      const actual = actualItems.reduce((s, a) => s + a.actual_amount, 0);
      return { ...cat, items, budgeted, actual };
    }).filter(c => c.budgeted > 0).sort((a, b) => b.budgeted - a.budgeted);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashFlowItems, expenseActuals, budgetHistory, selYear, selMonth]);

  const totalBudgeted = catData.reduce((s, c) => s + c.budgeted, 0);

  // Whole-month budget-vs-actual for the KPI strip — mirrors the per-category variance
  // badge below, gated on something actually being logged (else every unlogged item would
  // read as "under budget" simply by omission, which is misleading, not informative).
  const totalActualLogged = catData.reduce((s, c) => s + c.actual, 0);
  const expenseVariance = totalActualLogged > 0 ? totalActualLogged - totalBudgeted : null;
  const expenseVarianceBadge = expenseVariance === null ? null : {
    text: Math.round(expenseVariance) === 0 ? "on budget" : `${fmt(Math.abs(expenseVariance))} ${expenseVariance > 0 ? "over" : "under"}`,
    over: expenseVariance > 0,
  };

  // Monthly Savings / Savings Rate answer "how did I actually do," not "what did I
  // plan" — the Budgeted Expenses tile right next to them keeps showing pure
  // totalBudgeted (+ its own actual-vs-budget badge) for that. Blended per item,
  // actual-if-logged else budgeted, same approach as Available to Invest's
  // monthlyPerf — but scoped to the SELECTED period (selYear/selMonth), not pinned
  // to "now", matching how totalBudgeted/catData already follow the period picker.
  const effectiveMonthlySpendSelected = expenseItems.reduce((s, item) => {
    const actual = actualsIndex.get(`${item.id}|${selYear}|${selMonth}`);
    if (actual !== undefined) return s + actual;
    const hist = getEffectiveBudget(budgetHistory, item.id, selYear, selMonth);
    return s + toMonthly(hist ?? item.amount, item.frequency);
  }, 0);
  const effectiveMonthlySavings = effectiveIncome - effectiveMonthlySpendSelected;
  const effectiveSavingsRate = effectiveIncome > 0 ? (effectiveMonthlySavings / effectiveIncome) * 100 : 0;

  // "Average" view — income/expenses/savings averaged across every fully-elapsed month
  // (excludes the current, still-in-progress month) from the earliest logged actual
  // through last month. Rate-of-totals (sum everything, then divide) rather than
  // averaging each month's own rate, so one unusually low-income month can't skew the
  // result as much as a normal one.
  //
  // Income uses the current effectiveIncome prop for every month, NOT a per-month
  // getEffectiveBudget reconstruction from incomeItems — effectiveIncome already nets
  // out the 401(k) employee deferral (via profile/retirement settings this component
  // has no access to), and reconstructing gross income per-item per-month would
  // silently disagree with every other income figure on this tab. The tradeoff:
  // a genuine mid-range raise won't be reflected in earlier months' income, matching
  // the same known limitation already accepted for monthlyPerf above.
  //
  // Known limitation: getEffectiveBudget (used for expenses) seeds every item with a
  // year-2000 sentinel row, so it always resolves for any past month — including ones
  // before an item actually existed. A newly added expense gets backfilled across the
  // whole range. There's no item creation-date to gate on; the coverage sublabel below
  // is the mitigation.
  const avgMonthly = useMemo(() => {
    if (expenseActuals.length === 0) return null; // nothing to anchor a range to
    const current = now.getFullYear() * 12 + now.getMonth();
    const periods = expenseActuals.map(a => a.period_year * 12 + (a.period_month - 1));
    const earliest = Math.min(...periods);
    const lastCompleted = current - 1;
    if (earliest > lastCompleted) return null; // only current-month data exists so far

    let totalIncome = 0, totalSpend = 0, fullyLoggedMonths = 0;
    const monthCount = lastCompleted - earliest + 1;
    for (let p = earliest; p <= lastCompleted; p++) {
      const y = Math.floor(p / 12);
      const m = (p % 12) + 1;
      let loggedCount = 0;
      const spend = expenseItems.reduce((s, item) => {
        const actual = actualsIndex.get(`${item.id}|${y}|${m}`);
        if (actual !== undefined) { loggedCount++; return s + actual; }
        const hist = getEffectiveBudget(budgetHistory, item.id, y, m);
        return s + toMonthly(hist ?? item.amount, item.frequency);
      }, 0);
      if (expenseItems.length > 0 && loggedCount === expenseItems.length) fullyLoggedMonths++;
      totalIncome += effectiveIncome;
      totalSpend += spend;
    }
    const totalSavings = totalIncome - totalSpend;
    return {
      monthCount, fullyLoggedMonths,
      avgIncome: totalIncome / monthCount,
      avgExpenses: totalSpend / monthCount,
      avgSavings: totalSavings / monthCount,
      avgRate: totalIncome > 0 ? (totalSavings / totalIncome) * 100 : 0,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseActuals, actualsIndex, effectiveIncome, expenseItems, budgetHistory]);

  // 50/30/20 buckets — monthly needs vs wants from the categorized budget
  const needsMonthly = catData.filter((c) => bucketForCategory(c.label) === "needs").reduce((s, c) => s + c.budgeted, 0);
  const wantsMonthly = catData.filter((c) => bucketForCategory(c.label) === "wants").reduce((s, c) => s + c.budgeted, 0);

  const donutSegments = useMemo(() => {
    let deg = 0;
    return catData.map(cat => {
      const pct = totalBudgeted > 0 ? cat.budgeted / totalBudgeted : 0;
      const start = deg;
      const end = deg + pct * 360;
      deg = end;
      return { ...cat, startDeg: start, endDeg: end };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catData, totalBudgeted]);

  // Monthly view uses the actuals-blended rate above; Average uses avgMonthly's
  // rate-of-totals (0 when there's no completed month yet — the empty state hides
  // the tiles/bar entirely in that case, so this fallback is never actually shown).
  // Annual/YTD keep the prop-based rate (mirrors the same viewMode split already used
  // for the "Budgeted Expenses" tile — there's no per-period budgetHistory equivalent
  // for those views).
  const displaySavingsRate = viewMode === "monthly" ? effectiveSavingsRate
    : viewMode === "average" ? (avgMonthly?.avgRate ?? 0)
    : savingsRate;
  const srColor = displaySavingsRate >= 20 ? "oklch(0.72 0.19 145)"
    : displaySavingsRate >= 10 ? "oklch(0.75 0.18 70)"
    : displaySavingsRate > 0  ? "oklch(0.65 0.18 25)"
    : "var(--text-muted)";
  const srBarPct = Math.min(100, Math.max(0, (displaySavingsRate / 30) * 100));

  const pacingAlerts = isCurrentMonth ? catData
    .filter(cat => cat.actual > 0 && cat.budgeted > 0)
    .map(cat => {
      const projected = cat.actual / pacingRatio;
      const overage = projected - cat.budgeted;
      return { label: cat.label, overage, pct: overage / cat.budgeted };
    })
    .filter(c => c.overage > 30 && c.pct > 0.08)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 2) : [];

  const daysLeft = isCurrentMonth ? daysInSelMonth - now.getDate() : 0;

  async function handleSync(itemId: string) {
    setSyncingId(itemId);
    const result = await syncForecastToActuals(itemId);
    if (result.error) {
      setSyncMsg(m => ({ ...m, [itemId]: result.error! }));
    } else {
      setSyncMsg(m => ({ ...m, [itemId]: `Updated to ${fmt(result.newAmount ?? 0)}/mo` }));
    }
    setSyncingId(null);
  }

  // Shared by AiImportPanel (statement paste) and ActualsRefreshPanel (logged
  // actuals) — creates rows with no existingId, updates rows that already have
  // one. updateCashFlowItem unconditionally rewrites due_day/due_day_2 from
  // FormData (unlike category/is_variable, which are formData.has()-guarded), so
  // an existing item's due date must be carried through explicitly or it gets
  // silently nulled out on every "refresh."
  async function applyBudgetRows(rows: BudgetGroupRow[]) {
    for (const row of rows) {
      const fd = new FormData();
      fd.set("label", row.label);
      fd.set("amount", String(row.amount));
      fd.set("frequency", "monthly");
      fd.set("type", "expense");
      if (row.category) fd.set("category", row.category);
      if (row.existingId) {
        const existing = expenseItems.find(i => i.id === row.existingId);
        fd.set("id", row.existingId);
        if (existing?.due_day != null) fd.set("due_day", String(existing.due_day));
        if (existing?.due_day_2 != null) fd.set("due_day_2", String(existing.due_day_2));
        await updateCashFlowItem(fd);
      } else {
        await addCashFlowItem(fd);
      }
    }
  }

  // Emergency-fund split — local editable copies of the saved settings so the
  // slider/button-group give live preview feedback before the user hits Save,
  // mirroring plan-401k-section.tsx's pattern for its own %-controls.
  const [efMonthsEdit, setEfMonthsEdit] = useState<number>(emergencyFundMonths);
  const [investPctEdit, setInvestPctEdit] = useState<number>(surplusToInvestPct);
  const [efSaved, setEfSaved] = useState(false);
  const emergencyFundTarget = efMonthsEdit * emergencyFundExpenseBasis;

  function saveEfSettings(nextEfMonths: number, nextInvestPct: number) {
    setEfSaved(false);
    const fd = new FormData();
    fd.set("emergency_fund_months", String(nextEfMonths));
    fd.set("surplus_to_invest_pct", String(nextInvestPct));
    startTransition(async () => {
      await updateSurplusAllocation(fd);
      setEfSaved(true);
      router.refresh();
      setTimeout(() => setEfSaved(false), 2500);
    });
  }

  // "Available to Invest" is driven by how a month actually went, not by a
  // point-in-time balance-sheet snapshot — and it follows the SAME selYear/selMonth
  // period picker as the Budget vs Actual box below, not "today." Users close out a
  // month in arrears (log August's actuals on Sept 1), so pinning to the real
  // calendar month would always show the not-yet-logged current month instead of
  // the month they actually just finished — the opposite of useful. Emergency-fund
  // adequacy, cash on hand, and "still owed" intentionally stay pinned to right now
  // (computeAvailableToInvest's `today` param, unchanged below) — those are present-
  // tense questions regardless of which month's performance you're reviewing, so
  // this card deliberately mixes tenses: performance for the SELECTED month,
  // liquidity/EF for TODAY.
  //
  // Known limitation: effectiveIncome (prop, from planning-client.tsx) isn't
  // budgetHistory-aware — it always reflects today's income setup. If income changed
  // since the selected month (e.g. a raise), that month's figure will be slightly
  // off. Not fixed here to avoid widening this change into effectiveIncome's global
  // computation, which many other parts of the page depend on.
  //
  // Blend actual-if-logged with budgeted-as-fallback, per item — not per catData
  // category, which drops categories with $0 budgeted and would silently lose an
  // ad-hoc unbudgeted expense that only has an actual logged against it. Tracked as
  // two separate portions (not just a combined total) so the UI can be honest about
  // what's real vs. what's an unconfirmed placeholder — collapsing them into one
  // number labeled "spent" reads as a lie for a month nothing's been logged for yet.
  const monthlyPerf = useMemo(() => {
    let actualPortion = 0;
    let budgetedPortion = 0;
    let loggedCount = 0;
    for (const item of expenseItems) {
      const actual = expenseActuals.find(a =>
        a.cash_flow_item_id === item.id && a.period_year === selYear && a.period_month === selMonth
      );
      if (actual) {
        actualPortion += actual.actual_amount;
        loggedCount++;
      } else {
        const hist = getEffectiveBudget(budgetHistory, item.id, selYear, selMonth);
        budgetedPortion += toMonthly(hist ?? item.amount, item.frequency);
      }
    }
    return {
      actualPortion, budgetedPortion, loggedCount, totalCount: expenseItems.length,
      surplus: effectiveIncome - (actualPortion + budgetedPortion),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseItems, expenseActuals, budgetHistory, effectiveIncome, selYear, selMonth]);

  // liquidAssets/owed bills still drive the emergency-fund-funded gate (a real-dollars-
  // saved question) and the "Still owed" supporting list. See lib/planning/cash-flow-forecast.ts.
  const forecast = useMemo(
    () => computeAvailableToInvest(cashFlowItems, liquidAssets, monthlyPerf.surplus, new Date(), {
      emergencyFundTarget,
      surplusToInvestPct: investPctEdit,
    }),
    [cashFlowItems, liquidAssets, monthlyPerf.surplus, emergencyFundTarget, investPctEdit]
  );
  const owedByItemId = useMemo(
    () => new Map(forecast.owedItems.map(o => [o.item.id, o.dueDate])),
    [forecast.owedItems]
  );
  function paidStatusFor(item: CashFlowItem) {
    const nextDue = nextOccurrenceOnOrAfter(item, new Date());
    if (!nextDue) return null; // out of scope (no due date, or a frequency this feature doesn't track)
    const owed = owedByItemId.has(item.id);
    // Once paid, show the occurrence AFTER the one just satisfied as "next due" —
    // otherwise re-showing the just-paid date reads as if it's still coming up.
    const labelDate = owed ? nextDue : (nextOccurrenceOnOrAfter(item, new Date(nextDue.getTime() + 86400000)) ?? nextDue);
    const dueLabel = labelDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return { owed, dueLabel };
  }
  function handleMarkPaid(itemId: string) {
    startTransition(async () => { await markCashFlowItemPaid(itemId, toDateOnly(new Date())); router.refresh(); });
  }
  function handleClearPaid(itemId: string) {
    startTransition(async () => { await clearCashFlowItemPaid(itemId); router.refresh(); });
  }

  const displayCenter = (totalBudgeted * mult) >= 1000
    ? `$${((totalBudgeted * mult) / 1000).toFixed(1)}k`
    : fmt(totalBudgeted * mult);

  type KpiTile = { label: string; val: string; color: string; badge?: { text: string; over: boolean } | null };
  const kpiTiles: KpiTile[] = viewMode === "average"
    ? (avgMonthly ? [
        { label: "Avg Monthly Income", val: ph(fmt(avgMonthly.avgIncome)), color: "oklch(0.72 0.19 145)" },
        { label: "Avg Monthly Expenses", val: ph(fmt(avgMonthly.avgExpenses)), color: "oklch(0.65 0.18 25)" },
        { label: "Avg Monthly Savings", val: ph(fmt(Math.abs(avgMonthly.avgSavings))), color: avgMonthly.avgSavings >= 0 ? "oklch(0.72 0.19 145)" : "oklch(0.65 0.18 25)" },
        { label: "Savings Rate", val: `${avgMonthly.avgRate.toFixed(1)}%`, color: srColor },
      ] : [])
    : [
        { label: viewMode === "annual" ? "Annual Income" : viewMode === "ytd" ? `${selYear} Income` : "Monthly Income",       val: ph(fmt(effectiveIncome * mult)),       color: "oklch(0.72 0.19 145)" },
        // Monthly view sources from totalBudgeted (catData, budgetHistory-aware) rather than
        // the monthlyExpenses prop (not budgetHistory-aware) — keeps this tile consistent with
        // the variance badge sitting right below it. Annual/YTD keep the prop-based figure;
        // there's no budgetHistory equivalent scaled across a year.
        { label: viewMode === "annual" ? "Annual Expenses" : viewMode === "ytd" ? `${selYear} Expenses` : "Budgeted Expenses", val: ph(fmt(viewMode === "monthly" ? totalBudgeted : monthlyExpenses * mult)), color: "oklch(0.65 0.18 25)",
          badge: viewMode === "monthly" && totalActualLogged > 0 ? expenseVarianceBadge : null },
        { label: viewMode === "annual" ? "Annual Savings" : viewMode === "ytd" ? `${selYear} Savings` : "Monthly Savings",     val: ph(fmt(Math.abs((viewMode === "monthly" ? effectiveMonthlySavings : monthlySavings) * mult))), color: (viewMode === "monthly" ? effectiveMonthlySavings : monthlySavings) >= 0 ? "oklch(0.72 0.19 145)" : "oklch(0.65 0.18 25)" },
        { label: "Savings Rate",                                                    val: effectiveIncome > 0 ? `${displaySavingsRate.toFixed(1)}%` : "—",           color: srColor },
      ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
      <style>{`
        @keyframes cfo-fadein { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cfo-bar    { from { transform: scaleX(0); } }
        @keyframes cfo-sr     { from { width: 0; } }
        @keyframes cfo-arc    { from { opacity: 0; } to { opacity: 1; } }
        .cfo-zone  { animation: cfo-fadein 0.4s cubic-bezier(0.16,1,0.3,1) both; }
        .cfo-bar-a { animation: cfo-bar 0.85s cubic-bezier(0.22,1,0.36,1) both; transform-origin: left; }
        .cfo-sr-a  { animation: cfo-sr  1.1s cubic-bezier(0.22,1,0.36,1) both; }
        .cfo-arc-a { animation: cfo-arc 0.5s ease-out both; }
        .cfo-catrow:hover     { background: var(--surface-003) !important; }
        .cfo-catrow.cfo-hl   { background: var(--surface-004) !important; }
        .cfo-actual input:focus { border-color: var(--brand-blue) !important; outline: none; }
        @media (max-width: 640px) {
          /* Stack donut over bars; align-items:stretch so the bars span full
             width (inline alignItems:flex-start otherwise shrinks them). */
          .cfo-z2grid { flex-direction: column !important; align-items: stretch !important; }
          .cfo-donut  { width: 100% !important; display: flex; justify-content: center; }
          .cfo-z2grid > div:last-child { width: 100% !important; }
          .cfo-kpis   { grid-template-columns: repeat(2,1fr) !important; }
        }
      `}</style>

      {/* 50/30/20 balance */}
      <FiftyThirtyTwenty
        needsMonthly={needsMonthly}
        wantsMonthly={wantsMonthly}
        incomeMonthly={effectiveIncome}
        isPrivate={isPrivate}
      />

      {/* Zone 1 — Status Strip */}
      <div className="cfo-zone" style={{
        background: "var(--bg-surface)", border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)", padding: "18px 20px 16px", marginBottom: "10px",
        animationDelay: "0ms",
      }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
          <div style={{ display: "flex", background: "var(--surface-005)", borderRadius: "6px", padding: "2px", gap: "2px" }}>
            {(["monthly", "annual", "ytd", "average"] as const).map(m => (
              <button key={m} type="button" onClick={() => setViewMode(m)} style={{
                padding: "3px 10px", borderRadius: "4px", border: "none", cursor: "pointer",
                fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "capitalize",
                fontFamily: "var(--font-body)",
                background: viewMode === m ? "rgba(255,255,255,0.1)" : "transparent",
                color: viewMode === m ? "var(--text-primary)" : "var(--text-muted)",
                transition: "all 0.15s",
              }}>{m}</button>
            ))}
          </div>
        </div>
        {viewMode === "average" && !avgMonthly ? (
          <p style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: 0, textAlign: "center", padding: "8px 0" }}>
            Log actuals for at least one completed month to see an average.
          </p>
        ) : (
          <>
            <div className="cfo-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "16px 20px", marginBottom: viewMode === "average" ? "6px" : "16px" }}>
              {kpiTiles.map(({ label, val, color, badge }) => (
                <div key={label}>
                  <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "5px" }}>{label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 700, color, lineHeight: 1 }}>{val}</div>
                  {badge && (
                    <span style={{ display: "inline-block", marginTop: "5px", padding: "1px 5px", borderRadius: "3px", fontSize: "10px", fontFamily: "var(--font-mono)", background: badge.over ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)", color: badge.over ? "oklch(0.65 0.18 25)" : "oklch(0.72 0.19 145)" }}>
                      {badge.text}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {viewMode === "average" && avgMonthly && (
              <p style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: "0 0 16px" }}>
                Based on {avgMonthly.monthCount} completed month{avgMonthly.monthCount !== 1 ? "s" : ""}
                {avgMonthly.fullyLoggedMonths < avgMonthly.monthCount ? ` (${avgMonthly.fullyLoggedMonths} fully logged)` : ""}.
              </p>
            )}
            {effectiveIncome > 0 && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-tertiary)", fontFamily: "var(--font-body)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Savings Rate Progress</span>
                  <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>Target: 20%</span>
                </div>
                <div style={{ position: "relative", height: "6px", borderRadius: "3px", background: "var(--surface-008)", overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: `${(10/30)*100}%`, top: 0, bottom: 0, width: "1px", background: "var(--surface-010)" }} />
                  <div style={{ position: "absolute", left: `${(20/30)*100}%`, top: 0, bottom: 0, width: "1px", background: "var(--surface-010)" }} />
                  <div className="cfo-sr-a" style={{
                    height: "100%", borderRadius: "3px",
                    background: `linear-gradient(90deg, oklch(0.55 0.18 195), ${srColor})`,
                    width: `${srBarPct}%`,
                  }} />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Available to Invest — this month's income minus actual-or-budgeted spend,
          split against the emergency fund policy below. Cash on hand and unpaid
          bills stay visible as supporting context (right column + guard-rail
          callout) but no longer cap the headline number — see cash-flow-forecast.ts. */}
      <div className="cfo-zone" style={{
        background: "var(--bg-surface)", border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)", padding: "16px 20px", marginBottom: "10px",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "5px", display: "flex", alignItems: "center", gap: "7px" }}>
              Available to Invest · {MONTH_NAMES[selMonth - 1]} {selYear}
              {monthlyPerf.totalCount > 0 && monthlyPerf.loggedCount === 0 && (
                <span style={{ fontSize: "9px", fontWeight: 700, padding: "1px 7px", borderRadius: "999px", background: "var(--surface-008)", color: "var(--text-tertiary)", letterSpacing: "0.05em" }}>PROJECTED</span>
              )}
              {monthlyPerf.loggedCount > 0 && monthlyPerf.loggedCount < monthlyPerf.totalCount && (
                <span style={{ fontSize: "9px", fontWeight: 700, padding: "1px 7px", borderRadius: "999px", background: "var(--surface-008)", color: "var(--text-tertiary)", letterSpacing: "0.05em" }}>PARTIAL</span>
              )}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 700, color: forecast.availableToInvest >= 0 ? "oklch(0.72 0.19 145)" : "oklch(0.65 0.18 25)", lineHeight: 1 }}>
              {ph(fmt(forecast.availableToInvest))}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginTop: "4px" }}>
              {fmt(effectiveIncome)} income −{" "}
              {monthlyPerf.loggedCount === monthlyPerf.totalCount
                ? `${fmt(monthlyPerf.actualPortion)} spent in ${MONTH_NAMES[selMonth - 1]}`
                : monthlyPerf.loggedCount === 0
                  ? `${fmt(monthlyPerf.budgetedPortion)} budgeted for ${MONTH_NAMES[selMonth - 1]} (nothing logged yet)`
                  : `${fmt(monthlyPerf.actualPortion)} logged − ${fmt(monthlyPerf.budgetedPortion)} still budgeted`}
              {forecast.reservedForEmergencyFund > 0 ? ` − ${fmt(forecast.reservedForEmergencyFund)} reserved for emergency fund` : ""}
            </div>
            {monthlyPerf.loggedCount < monthlyPerf.totalCount && (
              <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginTop: "4px" }}>
                This assumes you'll spend the rest of your budget — log actuals below for a real number.
              </div>
            )}
            {monthlyPerf.surplus > 0 && forecast.freeCash < 0 && (
              <div style={{ fontSize: "11px", color: "oklch(0.65 0.18 25)", fontFamily: "var(--font-body)", marginTop: "6px" }}>
                ⚠ Your bills right now exceed your cash on hand — this figure reflects {MONTH_NAMES[selMonth - 1]}'s performance, not your current liquidity.
              </div>
            )}
          </div>
          <div style={{ minWidth: "200px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "6px" }}>
              <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>Cash on hand{!isCurrentMonth ? " (right now)" : ""}</span>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{ph(fmt(liquidAssets))}</span>
            </div>
            {forecast.owedItems.length > 0 && (
              <>
                <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "6px" }}>Still owed{!isCurrentMonth ? " (right now)" : ""}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  {forecast.owedItems.map(({ item, dueDate }) => (
                    <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "12px", fontFamily: "var(--font-body)" }}>
                      <span style={{ color: "var(--text-secondary)" }}>{item.label} · {dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      <span style={{ fontFamily: "var(--font-mono)", color: "oklch(0.65 0.18 25)" }}>{ph(fmt(item.amount))}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Emergency fund — only once there's a real expense number to target
            against (mirrors plan-401k-section.tsx's budgetKnown gate). */}
        {emergencyFundExpenseBasis > 0 && (() => {
          const freeCash = forecast.freeCash;
          const progressPct = emergencyFundTarget > 0 ? Math.min(100, Math.max(0, (freeCash / emergencyFundTarget) * 100)) : 0;
          // ETA at the currently-committed reserve rate — mirrors plan-401k-section.tsx's
          // fundEta pattern. The bar itself only moves once cash is actually saved (a real
          // balance); this answers "does the slider even matter" with a date instead, without
          // conflating money already saved with money the slider commits to save going forward.
          const monthlyRate = forecast.reservedForEmergencyFund;
          const gap = emergencyFundTarget - Math.max(0, freeCash);
          let eta: { months: number; date: string } | null = null;
          if (!forecast.emergencyFundFunded && monthlyRate > 0 && gap > 0) {
            const months = Math.ceil(gap / monthlyRate);
            const d = new Date();
            d.setMonth(d.getMonth() + months);
            eta = { months, date: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }) };
          }
          return (
            <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px", flexWrap: "wrap", gap: "6px" }}>
                <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
                  Emergency Fund · {efMonthsEdit}-month target
                </span>
                <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                  {ph(fmt(Math.max(0, freeCash)))} / {ph(fmt(emergencyFundTarget))}
                </span>
              </div>
              <div style={{ position: "relative", height: "6px", borderRadius: "3px", background: "var(--surface-008)", overflow: "hidden", marginBottom: "10px" }}>
                <div style={{ height: "100%", borderRadius: "3px", width: `${progressPct}%`, background: forecast.emergencyFundFunded ? "oklch(0.72 0.19 145)" : "linear-gradient(90deg, oklch(0.55 0.18 195), oklch(0.75 0.18 70))" }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {forecast.emergencyFundFunded ? (
                  <p style={{ fontSize: "12px", color: "oklch(0.72 0.19 145)", fontFamily: "var(--font-body)", margin: 0 }}>
                    ✓ Emergency fund fully funded — 100% of this month's surplus is available to invest.
                  </p>
                ) : (
                  <div>
                    <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", display: "block", marginBottom: "4px" }}>
                      Invest <strong style={{ color: "var(--text-primary)" }}>{investPctEdit}%</strong> of this month's surplus while building the fund, save the rest
                    </label>
                    <input
                      type="range" min={0} max={100} step={5} value={investPctEdit}
                      onChange={(e) => setInvestPctEdit(Number(e.target.value))}
                      style={{ width: "100%", accentColor: "oklch(0.6 0.15 195)" }}
                    />
                    <p style={{ fontSize: "11.5px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: "8px 0 0", lineHeight: 1.5 }}>
                      {eta
                        ? <>At {fmt(monthlyRate)}/mo you&apos;d reach your {efMonthsEdit}-month target by <strong style={{ color: "var(--text-primary)" }}>{eta.date}</strong> (~{eta.months} mo).</>
                        : "Nothing is being reserved toward this target right now — raise the slider, or check whether this month ran a surplus."}
                    </p>
                  </div>
                )}
                {/* Target-months + Save stay visible even once funded — otherwise there's no
                    way to move the goalpost (e.g. 6mo -> 12mo) or revisit the split later. */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>Target:</span>
                  {[6, 9, 12].map((m) => (
                    <button key={m} type="button" onClick={() => setEfMonthsEdit(m)}
                      style={{
                        fontSize: "12px", fontWeight: 600, padding: "3px 11px", borderRadius: "8px", cursor: "pointer",
                        border: `1px solid ${efMonthsEdit === m ? "oklch(0.6 0.15 195)" : "var(--border-subtle)"}`,
                        background: efMonthsEdit === m ? "oklch(0.6 0.15 195)" : "transparent",
                        color: efMonthsEdit === m ? "#fff" : "var(--text-secondary)",
                      }}>
                      {m} mo
                    </button>
                  ))}
                  <button type="button" disabled={pending} onClick={() => saveEfSettings(efMonthsEdit, investPctEdit)}
                    style={{
                      marginLeft: "auto", fontSize: "12px", fontWeight: 600, padding: "5px 14px", borderRadius: "8px",
                      border: "none", cursor: pending ? "default" : "pointer", opacity: pending ? 0.6 : 1,
                      background: "var(--brand-gradient)", color: "#fff",
                    }}>
                    {pending ? "Saving…" : "Save"}
                  </button>
                  {efSaved && <span style={{ fontSize: "11px", color: "oklch(0.72 0.19 145)" }}>Saved ✓</span>}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Surplus routing callout */}
      {monthlySavings > 50 && viewMode === "monthly" && (
        <div className="cfo-zone" style={{
          background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.2)",
          borderRadius: "var(--radius-lg)", padding: "11px 16px", marginBottom: "10px",
          animationDelay: "30ms", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
        }}>
          <div style={{ flex: 1, minWidth: "160px" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "oklch(0.72 0.19 145)", fontFamily: "var(--font-body)", marginBottom: "2px" }}>Surplus this month</div>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: 0, lineHeight: 1.5 }}>
              You&apos;re {ph(fmt(monthlySavings))} ahead — where should it go?
            </p>
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {[
              { label: "Invest it",         href: "/portfolios" },
              { label: "Emergency fund",    href: "/planning?tab=balance" },
              { label: "Toward a goal",     href: "/planning?tab=events" },
            ].map(({ label, href }) => (
              <a key={label} href={href} style={{
                padding: "5px 12px", borderRadius: "6px", border: "1px solid rgba(34,197,94,0.25)",
                background: "rgba(34,197,94,0.07)", color: "oklch(0.72 0.19 145)",
                fontSize: "11px", fontWeight: 600, fontFamily: "var(--font-body)",
                textDecoration: "none", cursor: "pointer", whiteSpace: "nowrap",
              }}>{label}</a>
            ))}
          </div>
        </div>
      )}

      {/* Atlas Insight Strip */}
      {(effectiveIncome > 0 || monthlyExpenses > 0) && (
        <div className="cfo-zone" style={{
          background: "rgba(63,174,74,0.04)", border: "1px solid rgba(63,174,74,0.22)",
          borderRadius: "var(--radius-lg)", padding: "11px 15px", marginBottom: "10px",
          animationDelay: "60ms", display: "flex", gap: "11px", alignItems: "flex-start",
        }}>
          <div style={{ flexShrink: 0, width: "24px", height: "24px", borderRadius: "50%", background: "rgba(63,174,74,0.12)", border: "1px solid rgba(63,174,74,0.25)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "1px" }}>
            <svg width="10" height="10" viewBox="0 0 20 20" fill="none">
              <path d="M10 2a7 7 0 014.83 12.01L14 17H6l-.83-2.99A7 7 0 0110 2z" fill="rgba(14,165,160,0.2)" stroke="oklch(0.65 0.18 195)" strokeWidth="1.5"/>
              <path d="M8 17h4" stroke="oklch(0.65 0.18 195)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "10px", fontWeight: 700, color: "oklch(0.65 0.18 195)", letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: "3px" }}>Atlas</div>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.6, margin: 0 }}>{cashFlowFinnInsight}</p>
          </div>
        </div>
      )}

      {/* Sankey — where the money flows (income → categories + savings) */}
      {effectiveIncome > 0 && catData.length > 0 && (
        <CashFlowSankey
          income={effectiveIncome}
          leaves={[
            ...catData.map((c) => ({ label: c.label, amount: c.budgeted, bucket: bucketForCategory(c.label), color: CF_CAT_COLORS[c.label] ?? "oklch(0.55 0.05 258)" })),
            ...(monthlySavings > 0 ? [{ label: "Savings", amount: monthlySavings, bucket: "savings" as const, color: "oklch(0.72 0.18 150)" }] : []),
          ]}
          isPrivate={isPrivate}
        />
      )}

      {/* Pacing Alert Strip — only for current month when tracking over budget */}
      {pacingAlerts.length > 0 && (
        <div className="cfo-zone" style={{
          background: "rgba(251,146,60,0.04)", border: "1px solid rgba(251,146,60,0.22)",
          borderRadius: "var(--radius-lg)", padding: "11px 15px", marginBottom: "10px",
          animationDelay: "80ms", display: "flex", gap: "10px", alignItems: "flex-start",
        }}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, marginTop: "1px" }}>
            <path d="M10 3L18 17H2L10 3z" fill="rgba(251,146,60,0.15)" stroke="oklch(0.72 0.18 55)" strokeWidth="1.5" strokeLinejoin="round"/>
            <line x1="10" y1="9" x2="10" y2="13" stroke="oklch(0.72 0.18 55)" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="10" cy="15.5" r="0.8" fill="oklch(0.72 0.18 55)"/>
          </svg>
          <div>
            <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "oklch(0.72 0.18 55)", fontFamily: "var(--font-body)", marginBottom: "2px" }}>Pacing alert — {daysLeft} day{daysLeft !== 1 ? "s" : ""} left</div>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: 0, lineHeight: 1.6 }}>
              {pacingAlerts.map((a, i) => (
                <span key={a.label}>{i > 0 ? " " : ""}<strong style={{ color: "var(--text-primary)" }}>{a.label}</strong> is on track to exceed budget by {ph(fmt(a.overage))}.{i < pacingAlerts.length - 1 ? "" : ""}</span>
              ))}
            </p>
          </div>
        </div>
      )}

      {guided && !cfExpanded && (
        <button type="button" onClick={() => setCfExpanded(true)}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", width: "100%", padding: "11px 0", borderRadius: "var(--radius-lg)", border: "1px dashed var(--border-subtle)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: "12px", fontFamily: "var(--font-body)", cursor: "pointer", marginBottom: "10px" }}>
          Show category detail & budget tracking
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      )}
      {cfAdvanced && (<>
      {/* Zone 2 — Donut + Category Bars */}
      {catData.length > 0 && (
        <div className="cfo-zone" style={{
          background: "var(--bg-surface)", border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg)", padding: "20px", marginBottom: "10px",
          animationDelay: "110ms",
        }}>
          <div className="cfo-z2grid" style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>

            {/* Donut */}
            <div className="cfo-donut" style={{ flexShrink: 0, width: "196px" }}>
              <svg width="196" height="196" viewBox="0 0 196 196">
                <circle cx="98" cy="98" r="74" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="14" />
                {donutSegments.map((seg, si) => {
                  const isHl = highlightedCat === seg.label;
                  const color = CF_CAT_COLORS[seg.label] ?? "oklch(0.55 0.05 258)";
                  const d = cfArcPath(98, 98, 74, seg.startDeg, seg.endDeg);
                  if (!d) return null;
                  return (
                    <path
                      key={seg.label}
                      className="cfo-arc-a"
                      d={d}
                      fill="none"
                      stroke={color}
                      strokeWidth={isHl ? 18 : 13}
                      strokeLinecap="round"
                      style={{
                        animationDelay: `${si * 35}ms`,
                        opacity: highlightedCat && !isHl ? 0.3 : 1,
                        transition: "opacity 0.2s, stroke-width 0.15s",
                        cursor: "pointer",
                        filter: isHl ? `drop-shadow(0 0 7px ${color})` : "none",
                      }}
                      onClick={() => setHighlightedCat(isHl ? null : seg.label)}
                    />
                  );
                })}
                {/* Center label */}
                <text x="98" y="90" textAnchor="middle" dominantBaseline="middle"
                  style={{ fontSize: "10px", fill: "var(--text-tertiary)", fontFamily: "var(--font-body)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  {highlightedCat ?? "Expenses"}
                </text>
                <text x="98" y="111" textAnchor="middle" dominantBaseline="middle"
                  style={{ fontSize: "19px", fontWeight: 700, fill: highlightedCat ? (CF_CAT_COLORS[highlightedCat] ?? "var(--text-primary)") : "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                  {isPrivate ? "••••" : (highlightedCat
                    ? ((catData.find(c => c.label === highlightedCat)?.budgeted ?? 0) * mult) >= 1000
                      ? `$${(((catData.find(c => c.label === highlightedCat)?.budgeted ?? 0) * mult) / 1000).toFixed(1)}k`
                      : fmt((catData.find(c => c.label === highlightedCat)?.budgeted ?? 0) * mult)
                    : displayCenter)}
                </text>
              </svg>
            </div>

            {/* Category bars */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "3px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "10px" }}>
                {viewMode === "annual" ? `${selYear} Annual Projection` : viewMode === "ytd" ? `${selYear} YTD (${ytdMonths}mo)` : `${MONTH_NAMES[selMonth - 1]} ${selYear}`} — Budget vs. Actual
              </div>

              {/* Headline verdict — the one-glance "how did I do" */}
              {(() => {
                const logged = catData.filter((c) => c.actual > 0);
                if (logged.length === 0) {
                  return (
                    <div style={{ marginBottom: "12px", padding: "11px 13px", borderRadius: "10px", background: "var(--surface-006)", border: "1px solid var(--border-subtle)", fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
                      Log this period&apos;s actual spending below and you&apos;ll see exactly how you tracked against budget here.
                    </div>
                  );
                }
                const totBudget = logged.reduce((s, c) => s + c.budgeted, 0) * mult;
                const totActual = logged.reduce((s, c) => s + c.actual, 0) * mult;
                const v = totActual - totBudget;
                const under = v <= 0;
                const col = under ? "oklch(0.72 0.19 145)" : "oklch(0.65 0.18 25)";
                const utilPct = totBudget > 0 ? Math.round((totActual / totBudget) * 100) : 0;
                return (
                  <div style={{ marginBottom: "14px", padding: "12px 14px", borderRadius: "10px", background: under ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.07)", border: `1px solid ${under ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}` }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                        Spent <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{ph(fmt(totActual))}</strong> of <span style={{ fontFamily: "var(--font-mono)" }}>{ph(fmt(totBudget))}</span> budgeted
                      </span>
                      <span style={{ fontSize: "14px", fontWeight: 700, color: col, fontFamily: "var(--font-mono)" }}>
                        {ph(fmt(Math.abs(v)))} {under ? "under" : "over"}
                      </span>
                    </div>
                    <div style={{ position: "relative", height: "7px", borderRadius: "3.5px", background: "var(--surface-006)", marginTop: "9px", overflow: "hidden" }}>
                      <div className="cfo-bar-a" style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${Math.min(utilPct, 100)}%`, borderRadius: "3.5px", background: col }} />
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "6px", fontFamily: "var(--font-body)" }}>{utilPct}% of budget used · {logged.length} categor{logged.length === 1 ? "y" : "ies"} logged</div>
                  </div>
                );
              })()}

              {catData.map((cat, ci) => {
                const isHl = highlightedCat === cat.label;
                const color = CF_CAT_COLORS[cat.label] ?? "oklch(0.55 0.05 258)";
                const hasActual = cat.actual > 0;
                const variance = hasActual ? cat.actual - cat.budgeted : null;
                const over = variance !== null && variance > 0;
                // Bar fills to % of THIS category's own budget (utilization), not the global max.
                const util = cat.budgeted > 0 ? cat.actual / cat.budgeted : (hasActual ? 1.2 : 0);
                const fillPct = Math.min(util * 100, 100);
                const barColor = !hasActual ? color + "44" : over ? "oklch(0.65 0.18 25)" : color;
                return (
                  <div
                    key={cat.label}
                    className={`cfo-catrow${isHl ? " cfo-hl" : ""}`}
                    style={{
                      padding: "6px 8px", borderRadius: "6px",
                      border: `1px solid ${isHl ? color + "40" : "transparent"}`,
                      cursor: "pointer", transition: "background 0.15s, border-color 0.15s",
                      opacity: highlightedCat && !isHl ? 0.5 : 1,
                    }}
                    onClick={() => setHighlightedCat(isHl ? null : cat.label)}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "5px" }}>
                      <span style={{ fontSize: "12px", lineHeight: 1, flexShrink: 0 }}>{cat.emoji}</span>
                      <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontWeight: isHl ? 600 : 400, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat.label}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                        {/* actual / budget — actual is the lead number now */}
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                          <span style={{ color: hasActual ? (over ? "oklch(0.65 0.18 25)" : "var(--text-primary)") : "var(--text-tertiary)", fontWeight: hasActual ? 600 : 400 }}>{hasActual ? ph(fmt(cat.actual * mult)) : "—"}</span>
                          <span style={{ color: "var(--text-muted)" }}> / {ph(fmt(cat.budgeted * mult))}</span>
                        </span>
                        {variance !== null && (
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: over ? "oklch(0.65 0.18 25)" : "oklch(0.72 0.19 145)", background: over ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)", padding: "1px 5px", borderRadius: "3px", whiteSpace: "nowrap" }}>
                            {ph(fmt(Math.abs(variance) * mult))} {over ? "over" : "under"}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ position: "relative", height: "5px", borderRadius: "2.5px", background: "var(--surface-006)", overflow: "hidden" }}>
                      <div className="cfo-bar-a" style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${fillPct}%`, borderRadius: "2.5px", background: barColor, animationDelay: `${150 + ci * 45}ms` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Build/Refresh Budget — between Zone 2 and Zone 3 */}
      <div className="cfo-zone" style={{ animationDelay: "155ms", display: "flex", flexDirection: "column", gap: "8px" }}>
        <AiImportPanel existingItems={expenseItems} onAdd={applyBudgetRows} />
        <ActualsRefreshPanel existingItems={expenseItems} expenseActuals={expenseActuals} onAdd={applyBudgetRows} />
      </div>

      {/* Bill Calendar */}
      <div className="cfo-zone" style={{
        background: "var(--bg-surface)", border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)", padding: "16px 20px", marginBottom: "10px",
        animationDelay: "170ms",
      }}>
        <button
          type="button"
          onClick={() => setShowCal(v => !v)}
          style={{ display: "flex", alignItems: "center", gap: "8px", background: "none", border: "none", cursor: "pointer", padding: 0, width: "100%" }}
        >
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
            <rect x="2" y="4" width="16" height="14" rx="2" stroke="var(--text-secondary)" strokeWidth="1.5"/>
            <line x1="6" y1="2" x2="6" y2="6" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="14" y1="2" x2="14" y2="6" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="2" y1="9" x2="18" y2="9" stroke="var(--text-secondary)" strokeWidth="1.5"/>
          </svg>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--font-body)", flex: 1, textAlign: "left" }}>Bill Calendar — {MONTH_NAMES[selMonth - 1]} {selYear}</span>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--text-muted)", transform: showCal ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
            <path d="M5 7l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
          </svg>
        </button>
        {showCal && (
          <div style={{ marginTop: "14px" }}>
            <BillCalendar cashFlowItems={cashFlowItems} year={selYear} month={selMonth} />
          </div>
        )}
      </div>

      {/* Zone 3 — Management */}
      <div className="cfo-zone" style={{
        background: "var(--bg-surface)", border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)", padding: "20px",
        animationDelay: "170ms",
      }}>
        {/* Period + statement import */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "18px" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "var(--font-body)" }}>Period</span>
          <select value={selMonth} onChange={e => setSelMonth(Number(e.target.value))}
            style={{ padding: "4px 8px", borderRadius: "7px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", fontSize: "11px" }}>
            {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={selYear} onChange={e => setSelYear(Number(e.target.value))}
            style={{ padding: "4px 8px", borderRadius: "7px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", fontSize: "11px" }}>
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button type="button" onClick={() => { setShowImport(p => !p); setImportSuccess(null); }}
            style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "5px", padding: "4px 10px", borderRadius: "7px", border: "1px solid var(--card-border)", background: showImport ? "rgba(14,165,160,0.1)" : "var(--card-bg)", color: showImport ? "#7fd9d4" : "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "11px", fontWeight: 500, cursor: "pointer", transition: "var(--transition-fast)" }}>
            <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            Log from Statement
          </button>
        </div>

        {showImport && (
          <div style={{ marginBottom: "14px" }}>
            <StatementImportPanel expenseItems={expenseItems} selYear={selYear} selMonth={selMonth}
              onClose={() => setShowImport(false)}
              onDone={count => { setShowImport(false); setImportSuccess(count); router.refresh(); }}
            />
          </div>
        )}
        {importSuccess !== null && !showImport && (
          <div style={{ marginBottom: "12px", padding: "8px 12px", borderRadius: "var(--radius-md)", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12px", color: "var(--green)", fontFamily: "var(--font-body)" }}>{importSuccess} actual{importSuccess !== 1 ? "s" : ""} logged for {MONTH_NAMES[selMonth - 1]} {selYear}.</span>
            <button type="button" onClick={() => setImportSuccess(null)} style={{ background: "none", border: "none", color: "var(--green)", cursor: "pointer", fontSize: "14px", lineHeight: 1, padding: "0 2px" }}><span aria-hidden="true">×</span><span className="bt-sr-only">Dismiss</span></button>
          </div>
        )}

        {/* Income */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span style={sectionHeadStyle}>Income <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: "10px", color: "var(--text-muted)" }}>(net, after taxes)</span></span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "oklch(0.72 0.19 145)", fontWeight: 600 }}>{ph(fmt(effectiveIncome))}/mo</span>
          </div>
          {incomeItems.map(item => (
            <LineItemRow key={item.id} item={item} type="cashflow" onDelete={deleteCashFlowItem} isPrivate={isPrivate} />
          ))}
          <div style={{ marginTop: "8px" }}>
            <AddItemRow type="cashflow" placeholder="e.g. Salary" onAdd={fd => { fd.set("type", "income"); return addCashFlowItem(fd); }} />
          </div>
        </div>

        {/* Expenses with inline actuals */}
        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <span style={sectionHeadStyle}>Expenses</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "oklch(0.65 0.18 25)", fontWeight: 600 }}>{ph(fmt(monthlyExpenses))}/mo</span>
          </div>

          {expenseItems.length === 0 ? (
            <p style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: "0 0 10px" }}>
              No expenses yet. Add one below — Atlas auto-groups by category.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "10px" }}>
              {EXPENSE_CATEGORIES.map(cat => {
                const items = expenseItems.filter(i => categoryOf(i) === cat.label);
                if (items.length === 0) return null;
                const catTotal = items.reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0);
                const isExpanded = expandedCats.has(cat.label);
                const catColor = CF_CAT_COLORS[cat.label] ?? "oklch(0.55 0.05 258)";
                const isHl = highlightedCat === cat.label;
                const catActual = items.reduce((s, i) => { const a = getActual(i.id); return a ? s + a.actual_amount : s; }, 0);
                const loggedInCat = items.filter(i => !!getActual(i.id)).length;
                const catVariance = loggedInCat > 0 ? catActual - catTotal : null;

                return (
                  <div key={cat.label} style={{
                    border: `1px solid ${isHl ? catColor + "44" : "var(--border-subtle)"}`,
                    borderRadius: "var(--radius-md)", overflow: "hidden", transition: "border-color 0.15s",
                  }}>
                    <button type="button"
                      onClick={() => setExpandedCats(prev => {
                        const next = new Set(prev);
                        next.has(cat.label) ? next.delete(cat.label) : next.add(cat.label);
                        return next;
                      })}
                      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 13px", background: isHl ? "rgba(255,255,255,0.022)" : "var(--bg-surface)", border: "none", cursor: "pointer", textAlign: "left", gap: "8px" }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 }}>
                        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: catColor, flexShrink: 0, boxShadow: isHl ? `0 0 6px ${catColor}` : "none", transition: "box-shadow 0.2s" }} />
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{cat.label}</span>
                        <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>({items.length})</span>
                        {catVariance !== null && (
                          <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", padding: "1px 5px", borderRadius: "3px", whiteSpace: "nowrap", background: catVariance > 0 ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)", color: catVariance > 0 ? "oklch(0.65 0.18 25)" : "oklch(0.72 0.19 145)" }}>
                            {Math.round(catVariance) === 0 ? "on budget" : `${ph(fmt(Math.abs(catVariance)))} ${catVariance > 0 ? "over" : "under"}`}
                          </span>
                        )}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "oklch(0.65 0.18 25)" }}>{ph(fmt(catTotal))}/mo</span>
                        {loggedInCat > 0 && (
                          <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>{loggedInCat}/{items.length}</span>
                        )}
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", color: "var(--text-tertiary)", flexShrink: 0 }}>
                          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </button>

                    {isExpanded && (
                      <div style={{ background: "var(--card-bg)", padding: "0 13px 12px" }}>
                        {items.map(item => {
                          const actual = getActual(item.id);
                          const fcast = forecastedMonthly(item);
                          const variance = actual ? actual.actual_amount - fcast : null;
                          const history = getHistory(item.id);
                          const mKeyWhole = `${item.id}:whole`;

                          const rowLabel: React.CSSProperties = {
                            fontSize: "10px", fontWeight: 700, textTransform: "uppercase",
                            letterSpacing: "0.09em", width: "44px", flexShrink: 0,
                            fontFamily: "var(--font-body)", paddingTop: "11px",
                          };

                          return (
                            <div key={item.id} style={{ borderBottom: "1px solid var(--border-subtle)", paddingBottom: "10px", marginBottom: "10px" }}>
                              {/* Budget row */}
                              <div style={{ display: "flex", alignItems: "flex-start", gap: "4px" }}>
                                <span style={{ ...rowLabel, color: "oklch(0.5 0.16 195)" }}>Budget</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <LineItemRow item={item} type="cashflow" onDelete={deleteCashFlowItem} isPrivate={isPrivate} editTitle="Edit budget amount"
                                    paidStatus={paidStatusFor(item)} onMarkPaid={handleMarkPaid} onClearPaid={handleClearPaid} />
                                  {/* Category override — corrects the auto-classification */}
                                  <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "4px" }}>
                                    <select
                                      value={item.category ?? "__auto__"}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        startTransition(async () => { await setCashFlowItemCategory(item.id, v); router.refresh(); });
                                      }}
                                      title={item.category ? "Category set manually" : `Auto-detected: ${categoryOf(item)}`}
                                      style={{
                                        fontSize: "10px", padding: "2px 6px", borderRadius: "5px",
                                        background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
                                        color: "var(--text-tertiary)", fontFamily: "var(--font-body)", cursor: "pointer", maxWidth: "160px",
                                      }}
                                    >
                                      <option value="__auto__">Auto: {getCategoryForExpense(item.label)}</option>
                                      {EXPENSE_CATEGORIES.map((c) => (
                                        <option key={c.label} value={c.label}>{c.emoji} {c.label}</option>
                                      ))}
                                    </select>
                                    {item.category && (
                                      <span style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>manual</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {/* Actual row */}
                              <div style={{ display: "flex", alignItems: "flex-start", gap: "4px", marginTop: "2px" }}>
                                <span style={{ ...rowLabel, color: "oklch(0.68 0.18 163)", paddingTop: "6px" }}>Actual</span>
                                <div className="cfo-actual" style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap", paddingTop: "4px" }}>
                                <form
                                  action={fd => {
                                    fd.set("cash_flow_item_id", item.id);
                                    fd.set("label", item.label);
                                    fd.set("period_year", String(selYear));
                                    fd.set("period_month", String(selMonth));
                                    startTransition(async () => { await logExpenseActual(fd); router.refresh(); });
                                  }}
                                  style={{ display: "flex", alignItems: "center", gap: "5px" }}
                                >
                                  <input
                                    name="actual_amount" type="number" min="0" step="0.01"
                                    key={`${item.id}-${selYear}-${selMonth}`}
                                    defaultValue={actual?.actual_amount ?? ""}
                                    placeholder={isPrivate ? "••••" : "Actual $"}
                                    style={{ width: "88px", padding: "4px 7px", borderRadius: "6px", fontSize: "11px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", fontFamily: "var(--font-mono)", transition: "border-color 0.15s" }}
                                  />
                                  <button type="submit" disabled={pending}
                                    style={{ padding: "4px 9px", borderRadius: "6px", fontSize: "10px", fontWeight: 600, background: "var(--brand-blue)", color: "#fff", border: "none", cursor: "pointer" }}>
                                    Log
                                  </button>
                                </form>
                                {variance !== null && (
                                  <span style={{ padding: "2px 7px", borderRadius: "3px", fontSize: "10px", fontWeight: 600, fontFamily: "var(--font-mono)", background: variance > 0 ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)", color: variance > 0 ? "oklch(0.65 0.18 25)" : "oklch(0.72 0.19 145)" }}>
                                    {variance > 0 ? "+" : ""}{ph(fmt(variance))} {variance > 0 ? "over" : "under"}
                                  </span>
                                )}
                                {history.length >= 3 && (
                                  <button onClick={() => handleSync(item.id)} disabled={syncingId === item.id} title="Update forecast to 3-month avg"
                                    style={{ padding: "2px 7px", borderRadius: "5px", fontSize: "10px", fontWeight: 500, background: "rgba(63,174,74,0.1)", color: "#5fbf9a", border: "1px solid rgba(63,174,74,0.2)", cursor: "pointer" }}>
                                    {syncingId === item.id ? "Syncing…" : "Sync"}
                                  </button>
                                )}
                              </div>
                              {syncMsg[item.id] && <div style={{ marginTop: "3px", fontSize: "10px", color: syncMsg[item.id].startsWith("Updated") ? "var(--green)" : "var(--red)" }}>{syncMsg[item.id]}</div>}
                              {/* Sparkline history */}
                              {history.length > 1 && (
                                <div style={{ marginTop: "6px", display: "flex", gap: "3px", alignItems: "flex-end" }}>
                                  {history.slice().reverse().map((h, hi) => {
                                    const barH = Math.max(3, Math.min(22, (h.actual_amount / (fcast * 2 || 1)) * 18));
                                    return (
                                      <div key={hi} title={`${MONTH_NAMES[h.period_month - 1]} ${h.period_year}: $${h.actual_amount.toLocaleString()}`}
                                        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                                        <div style={{ width: "13px", height: `${barH}px`, borderRadius: "2px", background: h.actual_amount > fcast ? "rgba(239,68,68,0.5)" : "rgba(34,197,94,0.45)" }} />
                                        <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{MONTH_NAMES[h.period_month - 1][0]}</span>
                                      </div>
                                    );
                                  })}
                                  <div style={{ width: "1px", background: "var(--border-subtle)", height: "16px", margin: "0 1px" }} />
                                  <div style={{ width: "13px", height: "14px", borderRadius: "2px", background: "rgba(63,174,74,0.25)", position: "relative" }} title={`Forecast: ${fmt(fcast)}`}>
                                    <span style={{ position: "absolute", bottom: "-11px", fontSize: "10px", color: "var(--text-muted)" }}>F</span>
                                  </div>
                                </div>
                              )}
                              {/* Move whole actual */}
                              {actual && (!actual.breakdown || actual.breakdown.length === 0) && expenseItems.filter(ei => ei.id !== item.id).length > 0 && (() => {
                                const isMoving = movingKey === mKeyWhole;
                                const others = expenseItems.filter(ei => ei.id !== item.id);
                                return (
                                  <div style={{ marginTop: "5px" }}>
                                    <button type="button" onClick={() => setMovingKey(isMoving ? null : mKeyWhole)}
                                      style={{ background: isMoving ? "var(--bg-elevated)" : "none", border: isMoving ? "1px solid var(--border-subtle)" : "1px solid transparent", borderRadius: "4px", cursor: "pointer", color: isMoving ? "var(--accent)" : "var(--text-tertiary)", fontSize: "10px", padding: "2px 6px", lineHeight: 1, fontFamily: "var(--font-body)" }}>
                                      → Move ${actual.actual_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </button>
                                    {isMoving && (
                                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                                        <span style={{ fontSize: "10px", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>Move to:</span>
                                        <select defaultValue="" onChange={e => {
                                          const destId = e.target.value;
                                          if (!destId) return;
                                          setMovingKey(null);
                                          startTransition(async () => { await moveMerchantActual(item.id, destId, item.label, actual.actual_amount, selYear, selMonth); router.refresh(); });
                                        }} style={{ flex: 1, padding: "3px 5px", borderRadius: "5px", fontSize: "10px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", cursor: "pointer" }}>
                                          <option value="" disabled>Select bucket...</option>
                                          {others.map(ei => <option key={ei.id} value={ei.id}>{ei.label}</option>)}
                                        </select>
                                        <button type="button" onClick={() => setMovingKey(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: "13px", padding: "2px 4px", lineHeight: 1 }}><span aria-hidden="true">×</span><span className="bt-sr-only">Dismiss</span></button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                              {/* Breakdown */}
                              {actual?.breakdown && actual.breakdown.length > 0 && (
                                <>
                                  <button type="button" onClick={() => setExpandedBreakdown(prev => {
                                    const next = new Set(prev);
                                    next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                                    return next;
                                  })} style={{ marginTop: "5px", background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: "10px", padding: "0", display: "flex", alignItems: "center", gap: "4px" }}>
                                    {expandedBreakdown.has(item.id) ? "▲" : "▼"} {actual.breakdown.length} merchant{actual.breakdown.length !== 1 ? "s" : ""}
                                  </button>
                                  {expandedBreakdown.has(item.id) && (
                                    <div style={{ marginTop: "4px", paddingLeft: "8px", display: "flex", flexDirection: "column", gap: "3px" }}>
                                      {actual.breakdown.map((m, mi) => {
                                        const mKeyBreak = `${item.id}:${mi}`;
                                        const isMov = movingKey === mKeyBreak;
                                        const others = expenseItems.filter(ei => ei.id !== item.id);
                                        return (
                                          <div key={mi} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px" }}>
                                              <span style={{ fontSize: "10px", color: "var(--text-secondary)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>↳ {m.label}</span>
                                              <div style={{ display: "flex", alignItems: "center", gap: "5px", flexShrink: 0 }}>
                                                <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>${m.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                {others.length > 0 && (
                                                  <button type="button" onClick={() => setMovingKey(isMov ? null : mKeyBreak)} style={{ background: isMov ? "var(--bg-elevated)" : "none", border: isMov ? "1px solid var(--border-subtle)" : "none", borderRadius: "3px", cursor: "pointer", color: isMov ? "var(--accent)" : "var(--text-tertiary)", fontSize: "10px", padding: "1px 4px", lineHeight: 1 }}>→</button>
                                                )}
                                              </div>
                                            </div>
                                            {isMov && (
                                              <div style={{ display: "flex", alignItems: "center", gap: "6px", paddingLeft: "10px" }}>
                                                <span style={{ fontSize: "10px", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>Move to:</span>
                                                <select defaultValue="" onChange={e => {
                                                  const destId = e.target.value;
                                                  if (!destId) return;
                                                  setMovingKey(null);
                                                  startTransition(async () => { await moveMerchantActual(item.id, destId, m.label, m.amount, selYear, selMonth); router.refresh(); });
                                                }} style={{ flex: 1, padding: "3px 5px", borderRadius: "5px", fontSize: "10px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", cursor: "pointer" }}>
                                                  <option value="" disabled>Select bucket...</option>
                                                  {others.map(ei => <option key={ei.id} value={ei.id}>{ei.label}</option>)}
                                                </select>
                                                <button type="button" onClick={() => setMovingKey(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: "13px", padding: "2px 4px", lineHeight: 1 }}><span aria-hidden="true">×</span><span className="bt-sr-only">Dismiss</span></button>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </>
                              )}
                              </div>{/* end Actual row wrapper */}
                            </div>
                          );
                        })}
                        <div style={{ marginTop: "6px" }}>
                          <AddItemRow type="cashflow" placeholder={`Add ${cat.label.toLowerCase()} expense`} onAdd={fd => { fd.set("type", "expense"); fd.set("category", cat.label); return addCashFlowItem(fd); }} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <AddItemRow type="cashflow" placeholder="Add expense (auto-categorized by label)" onAdd={fd => { fd.set("type", "expense"); return addCashFlowItem(fd); }} />
        </div>
      </div>
      {guided && cfExpanded && (
        <button type="button" onClick={() => setCfExpanded(false)}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", width: "100%", padding: "9px 0", borderRadius: "var(--radius-lg)", border: "1px dashed var(--border-subtle)", background: "transparent", color: "var(--text-tertiary)", fontSize: "11px", fontFamily: "var(--font-body)", cursor: "pointer" }}>
          Show less
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 10l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      )}
      </>)}
    </div>
  );
}
