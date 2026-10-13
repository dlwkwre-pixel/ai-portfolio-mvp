"use client";

import { useMemo, useRef, useState } from "react";
import type { CashFlowItem } from "./planning-actions";
import { saveImportedTransactions } from "./planning-actions";
import type { ReviewTxn, ParseTransactionsResponse } from "@/app/api/planning/transactions/parse/route";
import { merchantKey, NEW_PAYCHECK_BUCKET, type TxnKind } from "@/lib/planning/transactions";
import { EXPENSE_CATEGORIES, categoryOf } from "@/lib/planning/expense-categories";
import { Button, Chip } from "@/app/components/ui-primitives";
import { MONTH_NAMES } from "./planning-shared";

// Statement → individual transactions → review → save. Replaces the old "Log Actuals
// from Statement" flow, which summed everything per merchant and OVERWROTE the month.
// Here every line is kept with its date, so a second import adds to the month instead of
// replacing it, and lines already saved by an earlier import are flagged (unchecked) —
// never silently dropped, because identical charges on the same day are real.

type Row = ReviewTxn & {
  key: number;
  include: boolean;
  bucket: string | null;   // item id, "new:<Category>", or null
  touched: boolean;        // user picked this bucket themselves
};

type Filter = "all" | "needs" | "dupes" | "skipped";

export type ImportSavedSummary = { inserted: number; batchId: string; months: string[] };

const KIND_LABEL: Record<TxnKind, string> = {
  spend: "Spending",
  refund: "Refund",
  income: "Income",
  transfer: "Transfer (skip)",
};

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shortDate(iso: string): string {
  return `${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
}

function money(n: number, isPrivate: boolean): string {
  return isPrivate ? "••••" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const fieldStyle: React.CSSProperties = {
  background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)",
  color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", padding: "6px 8px",
  minHeight: "32px", minWidth: 0,
};

export default function TransactionImportPanel({
  expenseItems, incomeItems, isPrivate, onClose, onSaved,
}: {
  expenseItems: CashFlowItem[];
  incomeItems: CashFlowItem[];
  isPrivate: boolean;
  onClose: () => void;
  onSaved: (summary: ImportSavedSummary) => void;
}) {
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [parser, setParser] = useState<"csv" | "ai">("csv");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [remember, setRemember] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Categories with no budget item yet — offered as "New: Travel" so a merchant always
  // has somewhere to go (creates a $0 budget line on save).
  const missingCategories = useMemo(() => {
    const have = new Set(expenseItems.map((i) => categoryOf(i)));
    return EXPENSE_CATEGORIES.map((c) => c.label).filter((c) => !have.has(c));
  }, [expenseItems]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setRawText(await file.text());
    setError(null);
  }

  async function handleParse() {
    if (!rawText.trim()) return;
    setParsing(true);
    setError(null);
    try {
      const res = await fetch("/api/planning/transactions/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText, today: todayLocal() }),
      });
      const data = await res.json() as ParseTransactionsResponse;
      if (!res.ok || data.error || !data.transactions) {
        setError(data.error ?? "Something went wrong reading that statement.");
        return;
      }
      setParser(data.parser ?? "csv");
      setWarnings(data.warnings ?? []);
      setRows(data.transactions.map((t, key) => ({
        ...t,
        key,
        include: !t.duplicateOf && t.kind !== "transfer",
        bucket: t.suggestedItemId,
        touched: false,
      })));
      setFilter("all");
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setParsing(false);
    }
  }

  function patchRow(key: number, patch: Partial<Row>) {
    setRows((prev) => prev && prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  // Picking a bucket for one Costco line also fills every other Costco line in this
  // import the user hasn't set by hand — sorting 12 coffee runs shouldn't take 12 clicks.
  function setBucket(row: Row, bucket: string | null) {
    const k = merchantKey(row.merchant);
    setRows((prev) => prev && prev.map((r) => {
      if (r.key === row.key) return { ...r, bucket, touched: true };
      if (!r.touched && r.kind === row.kind && merchantKey(r.merchant) === k) return { ...r, bucket };
      return r;
    }));
  }

  function setKind(row: Row, kind: TxnKind) {
    const typeChanged = (kind === "income") !== (row.kind === "income");
    patchRow(row.key, {
      kind,
      include: kind === "transfer" ? false : row.include || row.kind === "transfer",
      bucket: typeChanged ? null : row.bucket,
    });
  }

  function swapInOut() {
    setRows((prev) => prev && prev.map((r) =>
      r.kind === "spend" ? { ...r, kind: "income", bucket: null }
      : r.kind === "income" ? { ...r, kind: "spend", bucket: null }
      : r));
  }

  async function handleSave() {
    if (!rows) return;
    const chosen = rows.filter((r) => r.include && r.kind !== "transfer");
    if (chosen.length === 0) return;
    setSaving(true);
    setError(null);
    const rememberList = remember
      ? Array.from(new Map(rows.filter((r) => r.touched && r.bucket).map((r) => [merchantKey(r.merchant), { merchant: r.merchant, bucket: r.bucket! }])).values())
      : [];
    const res = await saveImportedTransactions({
      rows: chosen.map((r) => ({
        date: r.date, description: r.description, merchant: r.merchant, amount: r.amount,
        kind: r.kind as Exclude<TxnKind, "transfer">, bucket: r.bucket,
      })),
      remember: rememberList,
    });
    setSaving(false);
    if (res.error || !res.batchId) { setError(res.error ?? "Couldn't save."); return; }
    const months = Array.from(new Set(chosen.map((r) => r.date.slice(0, 7)))).sort()
      .map((ym) => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`);
    onSaved({ inserted: res.inserted ?? chosen.length, batchId: res.batchId, months });
  }

  // ── Derived review stats ──
  const stats = useMemo(() => {
    if (!rows) return null;
    const included = rows.filter((r) => r.include && r.kind !== "transfer");
    const byMonth = new Map<string, number>();
    for (const r of included) byMonth.set(r.date.slice(0, 7), (byMonth.get(r.date.slice(0, 7)) ?? 0) + 1);
    return {
      included,
      dupes: rows.filter((r) => r.duplicateOf).length,
      transfers: rows.filter((r) => r.kind === "transfer").length,
      needs: included.filter((r) => !r.bucket && r.kind !== "income").length,
      spent: included.filter((r) => r.kind !== "income").reduce((s, r) => s + (r.kind === "refund" ? -r.amount : r.amount), 0),
      income: included.filter((r) => r.kind === "income").reduce((s, r) => s + r.amount, 0),
      first: rows[0]?.date, last: rows[rows.length - 1]?.date,
      months: Array.from(byMonth.entries()).sort(([a], [b]) => a.localeCompare(b)),
    };
  }, [rows]);

  const visible = rows?.filter((r) =>
    filter === "needs" ? r.include && r.kind !== "transfer" && r.kind !== "income" && !r.bucket
    : filter === "dupes" ? !!r.duplicateOf
    : filter === "skipped" ? !r.include || r.kind === "transfer"
    : true) ?? [];

  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
            Import transactions
          </div>
          <p style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: "2px 0 0", lineHeight: 1.5 }}>
            Records what actually happened, by date. It doesn&apos;t change your budget. Importing again adds to what&apos;s there, and anything already imported gets flagged.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close import"
          style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: "20px", lineHeight: 1, minWidth: "44px", minHeight: "44px", marginTop: "-10px", marginRight: "-10px" }}>
          ×
        </button>
      </div>

      {!rows ? (
        <>
          <textarea
            value={rawText}
            onChange={(e) => { setRawText(e.target.value); setFileName(null); }}
            placeholder={"Paste transactions copied from your bank or card website, or a CSV export. Dates, descriptions and amounts are all fine to include."}
            rows={7}
            style={{ ...fieldStyle, width: "100%", boxSizing: "border-box", padding: "10px 12px", resize: "vertical", lineHeight: 1.6 }}
          />
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <Button variant="primary" size="sm" onClick={handleParse} disabled={parsing || !rawText.trim()}>
              {parsing ? "Reading…" : "Read statement"}
            </Button>
            <Button size="sm" onClick={() => fileRef.current?.click()}>Choose CSV file</Button>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={handleFile} style={{ display: "none" }} />
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
              {fileName ?? (rawText.length > 0 ? `${rawText.length.toLocaleString()} characters` : "CSV exports read instantly and most accurately")}
            </span>
          </div>
        </>
      ) : stats && (
        <>
          {/* Summary — what this import covers and what needs attention */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
              <strong>{stats.included.length}</strong> of {rows.length} transactions selected
              {stats.first && <> · {shortDate(stats.first)} – {shortDate(stats.last!)}</>}
            </div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <span>Out: <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{money(stats.spent, isPrivate)}</span></span>
              <span>In: <span style={{ fontFamily: "var(--font-mono)", color: "var(--green)" }}>{money(stats.income, isPrivate)}</span></span>
              {stats.months.length > 1 && (
                <span>Split by date: {stats.months.map(([ym, n]) => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} (${n})`).join(", ")}</span>
              )}
            </div>
            {warnings.map((w, i) => (
              <div key={i} style={{ fontSize: "var(--text-xs)", color: "var(--amber)", background: "var(--amber-bg)", borderRadius: "var(--radius-sm)", padding: "6px 10px", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>{w}</div>
            ))}
          </div>

          {/* Filters + bulk tools */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
            {([
              ["all", `All (${rows.length})`],
              ["needs", `Needs a bucket (${stats.needs})`],
              ["dupes", `Already imported (${stats.dupes})`],
              ["skipped", `Not saving (${rows.filter((r) => !r.include || r.kind === "transfer").length})`],
            ] as [Filter, string][]).map(([f, label]) => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                style={{
                  padding: "6px 10px", minHeight: "32px", borderRadius: "var(--radius-full)", fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", cursor: "pointer",
                  border: `1px solid ${filter === f ? "var(--brand-blue)" : "var(--border-subtle)"}`,
                  background: filter === f ? "rgba(14,165,160,0.12)" : "transparent",
                  color: filter === f ? "var(--brand-blue)" : "var(--text-secondary)",
                }}>
                {label}
              </button>
            ))}
            {parser === "csv" && (
              <Button size="sm" onClick={swapInOut} style={{ marginLeft: "auto" }} title="Use this if spending showed up as income (sign convention guessed wrong)">
                Swap money in/out
              </Button>
            )}
          </div>

          {/* Rows */}
          <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", maxHeight: "460px", overflowY: "auto" }}>
            {visible.length === 0 && (
              <p style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: 0, padding: "16px", textAlign: "center" }}>Nothing here.</p>
            )}
            {visible.map((r) => {
              const saving_ = r.include && r.kind !== "transfer";
              const bucketPool = r.kind === "income" ? incomeItems : expenseItems;
              return (
                <div key={r.key} style={{ display: "flex", gap: "8px", padding: "8px 10px", borderBottom: "1px solid var(--border-subtle)", opacity: saving_ ? 1 : 0.55, alignItems: "flex-start" }}>
                  <label style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: "28px", minHeight: "32px", cursor: r.kind === "transfer" ? "default" : "pointer" }}>
                    <input type="checkbox" checked={saving_} disabled={r.kind === "transfer"}
                      onChange={() => patchRow(r.key, { include: !r.include })}
                      aria-label={`Include ${r.merchant} ${shortDate(r.date)}`}
                      style={{ accentColor: "var(--brand-blue)", width: "16px", height: "16px" }} />
                  </label>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "baseline" }}>
                      <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        <span title={r.description} style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text-primary)", fontFamily: "var(--font-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                          {r.merchant}
                        </span>
                        {r.duplicateOf && <Chip tone="brand">Already imported {shortDate(r.duplicateOf.date)}</Chip>}
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", color: r.kind === "income" ? "var(--green)" : "var(--text-primary)", whiteSpace: "nowrap" }}>
                        {r.kind === "income" ? "+" : r.kind === "refund" ? "−" : ""}{money(r.amount, isPrivate)}
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "56px minmax(0, 110px) minmax(0, 1fr)", gap: "6px", alignItems: "center" }}>
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{shortDate(r.date)}</span>
                      <select value={r.kind} onChange={(e) => setKind(r, e.target.value as TxnKind)} aria-label="Type" style={fieldStyle}>
                        {(Object.keys(KIND_LABEL) as TxnKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                      </select>
                      {r.kind === "transfer" ? (
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>Not spending or income</span>
                      ) : (
                        <select value={r.bucket ?? ""} onChange={(e) => setBucket(r, e.target.value || null)} aria-label="Budget bucket"
                          style={{ ...fieldStyle, borderColor: !r.bucket && saving_ && r.kind !== "income" ? "var(--amber)" : "var(--border-subtle)", color: r.bucket || r.kind === "income" ? "var(--text-primary)" : "var(--amber)" }}>
                          <option value="">{r.kind === "income" ? "Extra, one-time" : "Needs a bucket"}</option>
                          {bucketPool.length > 0 && (
                            <optgroup label={r.kind === "income" ? "Regular pay (replaces expected)" : "Your budget"}>
                              {bucketPool.map((i) => <option key={i.id} value={i.id}>{r.kind === "income" ? `Pay from ${i.label}` : i.label}</option>)}
                            </optgroup>
                          )}
                          {r.kind === "income" && bucketPool.length === 0 && (
                            <option value={NEW_PAYCHECK_BUCKET}>Regular paycheck (replaces estimate)</option>
                          )}
                          {r.kind !== "income" && missingCategories.length > 0 && (
                            <optgroup label="Create new budget line">
                              {missingCategories.map((c) => <option key={c} value={`new:${c}`}>New: {c}</option>)}
                            </optgroup>
                          )}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {stats.income > 0 && (
            <p style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: 0, lineHeight: 1.5 }}>
              Income set to <strong>Pay from…</strong> replaces your expected income for that month. Income left as <strong>Extra, one-time</strong> is added on top, so make sure paychecks aren&apos;t left as extra.
            </p>
          )}
          {stats.needs > 0 && (
            <p style={{ fontSize: "var(--text-xs)", color: "var(--amber)", fontFamily: "var(--font-body)", margin: 0, lineHeight: 1.5 }}>
              {stats.needs} transaction{stats.needs !== 1 ? "s" : ""} without a bucket will be saved as unsorted. Unsorted spending isn&apos;t counted in your budget until you sort it.
            </p>
          )}

          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || stats.included.length === 0}>
              {saving ? "Saving…" : `Save ${stats.included.length} transaction${stats.included.length !== 1 ? "s" : ""}`}
            </Button>
            <Button size="sm" onClick={() => { setRows(null); setError(null); }}>Back</Button>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", cursor: "pointer", minHeight: "32px", marginLeft: "auto" }}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ accentColor: "var(--brand-blue)" }} />
              Remember my bucket choices for these merchants
            </label>
          </div>
        </>
      )}

      {error && (
        <div role="alert" style={{ background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--red)", fontFamily: "var(--font-body)", marginBottom: "2px" }}>
            {rows ? "Couldn't save" : "Couldn't read this statement"}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>{error}</div>
        </div>
      )}
    </div>
  );
}
