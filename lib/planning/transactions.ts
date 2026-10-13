// Transaction-level cash flow: parsing helpers, duplicate detection, bucket suggestion,
// and the transactions → monthly-actuals rollup. Pure functions only (no Supabase, no
// React) so the parser route, server actions, page.tsx and the client UI all share them.

import { categoryOf, getCategoryForExpense, normLabel } from "./expense-categories";

// What the import review works with. amount is always positive; `kind` carries the sign:
//   spend    → stored direction 'out', +amount
//   refund   → stored direction 'out', −amount (nets against the bucket it came from)
//   income   → stored direction 'in',  +amount
//   save     → stored direction 'save', +amount (moved into your own savings/investments)
//   transfer → not stored (card payments, moves between your own checking accounts)
export type TxnKind = "spend" | "refund" | "income" | "save" | "transfer";

export type ParsedTxn = {
  date: string;          // YYYY-MM-DD
  description: string;   // raw line text
  merchant: string;      // cleaned display name
  amount: number;        // positive
  kind: TxnKind;
  category?: string;     // expense category hint (parser's guess)
};

export type CashFlowTransaction = {
  id: string;
  txn_date: string;
  period_year: number;
  period_month: number;
  description: string;
  merchant: string;
  amount: number;        // signed per the 'out' convention above
  direction: "in" | "out" | "save";
  cash_flow_item_id: string | null;
  source: "statement" | "manual" | "plaid";
  import_batch_id: string | null;
  note: string | null;
};

export type MerchantRule = { merchant_key: string; cash_flow_item_id: string };

type BucketItem = { id: string; label: string; type: "income" | "expense"; category?: string | null; amount?: number };

// Review-table bucket values that create a budget line on save (resolved server-side in
// planning-actions.ts resolveBuckets). "new:<Expense Category>" → $0 expense line;
// NEW_PAYCHECK_BUCKET → a $0, variable "Paycheck" income source, used when someone whose
// income comes from their profile imports payroll deposits — assigning them to a source is
// what makes them REPLACE expected income instead of stacking on top of it.
export const NEW_EXPENSE_BUCKET_PREFIX = "new:";
export const NEW_PAYCHECK_BUCKET = "newincome:Paycheck";

// ── Merchant normalization ──────────────────────────────────────────────────

// Payment-processor prefixes and statement noise that make the same store look different
// from one statement to the next ("SQ *BLUE BOTTLE #123 OAKLAND CA" vs "Blue Bottle").
const MERCHANT_NOISE = [
  /^(sq|tst|sp|pp|py|ck|ext|dd|in|bt)\s*\*\s*/i,
  /^(paypal|venmo)\s*\*\s*/i,
  /^(pos|ach|dbt|debit|chk)\s+(purchase|card|pmt|payment|debit|withdrawal)?\s*/i,
  /^(debit card|check card|recurring|purchase authorized on|purchase)\s+(purchase\s+)?/i,
  /^\d{1,2}\/\d{1,2}\s+/,               // leading "10/03 " date stamp inside the description
];

export function cleanMerchant(description: string): string {
  let s = description.trim().replace(/\s+/g, " ");
  // Two passes: prefixes nest ("PURCHASE AUTHORIZED ON 10/02 SQ *JOES PIZZA").
  for (let pass = 0; pass < 2; pass++) for (const re of MERCHANT_NOISE) s = s.replace(re, "");
  s = s
    .replace(/\s+#?\d{3,}.*$/, "")                  // store numbers / reference ids and everything after
    .replace(/\s+[A-Z]{2}\s*\d{0,5}$/, "")          // trailing state code / zip ("OAKLAND CA 94612")
    .replace(/[*#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) s = description.trim();
  // Title-case shouty statement text, leave mixed-case names alone.
  if (s === s.toUpperCase()) {
    s = s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
  }
  return s.slice(0, 60);
}

// Stable key for "is this the same merchant" — rules and duplicate matching both use it.
// First two meaningful words, letters only: "Costco Whse 0412" and "COSTCO WHOLESALE" → "costcowh…"
// would differ, so we take the first word when it's distinctive (≥4 chars), else two words.
export function merchantKey(merchant: string): string {
  const words = cleanMerchant(merchant).toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean)
    .filter((w) => !["the", "inc", "llc", "co", "corp", "store", "stores"].includes(w));
  if (words.length === 0) return normLabel(merchant);
  if (words[0].length >= 4 || words.length === 1) return words[0];
  return words[0] + words[1];
}

// ── Transfers / refunds ─────────────────────────────────────────────────────

// Money moving between the user's own accounts — not spending, not income. Deliberately
// does NOT match bare "Zelle"/"Venmo": those are often real income (a Marketplace sale)
// or real spending (paying a friend back), so they stay as spend/income for the user to judge.
const TRANSFER_RE = /\b(payment\s*(-\s*)?thank\s*you|autopay|auto\s*pay|online\s+(banking\s+)?transfer|transfer\s+(to|from)|internal\s+transfer|credit\s*card\s+(payment|pmt)|card\s*(payment|pmt)|epay|e-payment|mobile\s+payment|payment\s+received|crcardpmt|cc\s*pymt|to\s+savings|from\s+savings|to\s+checking|from\s+checking)\b/i;
const REFUND_RE = /\b(refund|return|reversal|credit\s+adj|merchant\s+credit|chargeback)\b/i;

const PAYROLL_RE = /\b(payroll|direct\s*dep(osit)?|dir\s*dep|salary|paycheck|wages?|ppd|net\s*pay)\b/i;
export function looksLikePayroll(text: string): boolean {
  return PAYROLL_RE.test(text);
}

// Money leaving checking for the user's own savings or investment account — the actual act
// of saving. Only meaningful for money OUT (a Robinhood withdrawal back to checking isn't).
const SAVE_RE = /\b(to\s+savings|transfer\s+to\s+(savings|brokerage|investment|ira|roth|hysa|high\s*yield)|robinhood|fidelity|vanguard|schwab|betterment|wealthfront|acorns|stash|m1\s*finance|e\*?trade|webull|marcus|wealthsimple|sofi\s*invest)\b/i;
export function looksLikeSave(description: string): boolean {
  return SAVE_RE.test(description);
}

export function looksLikeTransfer(description: string): boolean {
  return TRANSFER_RE.test(description);
}
export function looksLikeRefund(description: string): boolean {
  return REFUND_RE.test(description);
}

// ── Dates ───────────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // Feb 30 etc.
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Statements without a year ("10/03") get the most recent year that doesn't put the date
// more than a week into the future relative to `today` (YYYY-MM-DD) — so a December line
// pasted in January lands in last year.
function withInferredYear(m: number, d: number, today: string): string | null {
  const ty = Number(today.slice(0, 4));
  const candidate = iso(ty, m, d);
  if (!candidate) return null;
  const limit = new Date(`${today}T00:00:00Z`).getTime() + 7 * 86400000;
  return new Date(`${candidate}T00:00:00Z`).getTime() > limit ? iso(ty - 1, m, d) : candidate;
}

export function parseFlexibleDate(raw: string, today: string): string | null {
  const s = raw.trim().replace(/^"|"$/g, "");
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return iso(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/))) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return iso(y, +m[1], +m[2]); // US order — what US bank exports use
  }
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})$/))) return withInferredYear(+m[1], +m[2], today);
  if ((m = s.match(/^([A-Za-z]{3,4})\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?/))) {
    const mon = MONTHS[m[1].toLowerCase()];
    if (!mon) return null;
    return m[3] ? iso(+m[3], mon, +m[2]) : withInferredYear(mon, +m[2], today);
  }
  if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,4})\.?(?:\s+(\d{4}))?/))) {
    const mon = MONTHS[m[2].toLowerCase()];
    if (!mon) return null;
    return m[3] ? iso(+m[3], mon, +m[1]) : withInferredYear(mon, +m[1], today);
  }
  return null;
}

// ── Amounts ─────────────────────────────────────────────────────────────────

// "$1,234.56" → 1234.56, "(45.00)" / "-45.00" / "45.00-" / "45.00 CR" → negative. null if not money.
export function parseMoney(raw: string): number | null {
  let s = raw.trim().replace(/^"|"$/g, "");
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/\s*(cr|-)$/i.test(s)) { neg = true; s = s.replace(/\s*(cr|-)$/i, ""); }
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  if (s.startsWith("+")) s = s.slice(1);
  s = s.replace(/[$\s,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return neg ? -n : n;
}

// ── CSV parsing (deterministic path) ────────────────────────────────────────

function splitDelimited(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ;
    } else if (c === delim && !inQ) {
      out.push(cur.trim()); cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

function detectDelimiter(lines: string[]): string | null {
  const sample = lines.slice(0, 15);
  let best: { d: string; cols: number } | null = null;
  for (const d of [",", "\t", ";", "|"]) {
    const freq = new Map<number, number>();
    for (const l of sample) {
      const n = splitDelimited(l, d).length;
      freq.set(n, (freq.get(n) ?? 0) + 1);
    }
    const [common, consistent] = Array.from(freq.entries()).sort((a, b) => b[1] - a[1])[0];
    if (common >= 3 && consistent >= Math.max(2, sample.length * 0.6) && (!best || common > best.cols)) best = { d, cols: common };
  }
  return best?.d ?? null;
}

type ColumnMap = { date: number; desc: number; amount?: number; debit?: number; credit?: number; type?: number; category?: number };

function mapHeader(cells: string[]): ColumnMap | null {
  const h = cells.map((c) => c.toLowerCase().replace(/[^a-z ]/g, "").trim());
  const find = (...pats: RegExp[]) => h.findIndex((c) => pats.some((p) => p.test(c)));
  const date = find(/^(transaction |trans |posted |post |posting )?date$/, /^date/, /date$/);
  const desc = find(/description/, /merchant/, /payee/, /^name$/, /details/, /memo/, /narrative/);
  const amount = find(/^amount/, /amount$/);
  const debit = find(/debit/, /withdrawal/, /money out/, /^charges?$/);
  const credit = find(/credit/, /deposit/, /money in/, /payments?$/);
  const type = find(/^(transaction )?type$/, /^dr ?cr$/);
  const category = find(/^category$/);
  if (date < 0 || desc < 0 || (amount < 0 && debit < 0 && credit < 0)) return null;
  return {
    date, desc,
    amount: amount >= 0 ? amount : undefined,
    debit: debit >= 0 ? debit : undefined,
    credit: credit >= 0 && credit !== amount ? credit : undefined,
    type: type >= 0 ? type : undefined,
    category: category >= 0 ? category : undefined,
  };
}

// Headerless rows (copied straight off a bank website): pick the column where most values
// parse as dates, the one where most parse as money, and the longest text column.
function inferColumns(rows: string[][], today: string): ColumnMap | null {
  const cols = Math.max(...rows.map((r) => r.length));
  const score = (fn: (v: string) => boolean) =>
    Array.from({ length: cols }, (_, i) => rows.filter((r) => r[i] !== undefined && fn(r[i])).length);
  const dateScores = score((v) => parseFlexibleDate(v, today) !== null);
  const moneyScores = score((v) => parseMoney(v) !== null && /\d\.\d{2}|\$/.test(v));
  const date = dateScores.indexOf(Math.max(...dateScores));
  if (dateScores[date] < rows.length * 0.6) return null;
  const moneyCols = moneyScores.map((s, i) => ({ s, i })).filter((x) => x.i !== date && x.s >= rows.length * 0.5);
  if (moneyCols.length === 0) return null;
  // If there are several money columns (amount + running balance), the balance is usually last.
  const amount = moneyCols[0].i;
  const lens = Array.from({ length: cols }, (_, i) =>
    i === date || moneyCols.some((m) => m.i === i) ? -1 : rows.reduce((s, r) => s + (r[i]?.length ?? 0), 0));
  const desc = lens.indexOf(Math.max(...lens));
  if (desc < 0 || lens[desc] <= 0) return null;
  return { date, desc, amount };
}

export type CsvParseResult = { txns: ParsedTxn[]; skipped: number; signNote: string | null };

// Returns null when the text isn't a recognizable table — the caller then falls back to AI.
export function parseCsvStatement(text: string, today: string): CsvParseResult | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const delim = detectDelimiter(lines);
  if (!delim) return null;
  const rows = lines.map((l) => splitDelimited(l, delim));

  let map: ColumnMap | null = null;
  let start = 0;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    map = mapHeader(rows[i]);
    if (map) { start = i + 1; break; }
  }
  if (!map) map = inferColumns(rows.filter((r) => r.length >= 3), today);
  if (!map) return null;

  type Raw = { date: string; description: string; signed: number; typeHint: string; bankCategory: string };
  const raws: Raw[] = [];
  let skipped = 0;
  for (const r of rows.slice(start)) {
    const date = parseFlexibleDate(r[map.date] ?? "", today);
    const description = (r[map.desc] ?? "").trim();
    let signed: number | null = null;
    if (map.debit !== undefined || map.credit !== undefined) {
      const d = map.debit !== undefined ? parseMoney(r[map.debit] ?? "") : null;
      const c = map.credit !== undefined ? parseMoney(r[map.credit] ?? "") : null;
      // Debit column = money out (negative here), credit column = money in.
      if (d !== null && d !== 0) signed = -Math.abs(d);
      else if (c !== null && c !== 0) signed = Math.abs(c);
      else if (map.amount !== undefined) signed = parseMoney(r[map.amount] ?? "");
    } else if (map.amount !== undefined) {
      signed = parseMoney(r[map.amount] ?? "");
    }
    if (!date || !description || signed === null || signed === 0) { skipped++; continue; }
    raws.push({
      date, description, signed,
      typeHint: map.type !== undefined ? (r[map.type] ?? "").toLowerCase() : "",
      bankCategory: map.category !== undefined ? (r[map.category] ?? "") : "",
    });
  }
  if (raws.length === 0) return null;

  // Sign convention for a single amount column: banks export debits as negative, card
  // issuers export charges as positive. Most rows on any statement are money OUT, so the
  // majority sign = out. Explicit debit/credit columns or a type column override this.
  const explicit = map.debit !== undefined || map.credit !== undefined;
  const negatives = raws.filter((r) => r.signed < 0).length;
  // Strict majority — on a tie, assume card-style (positive = out), the more common export.
  const outIsNegative = explicit ? true : negatives > raws.length / 2;
  const signNote = explicit || map.type !== undefined ? null
    : outIsNegative
      ? "Read negative amounts as money out (bank-style export)."
      : "Read positive amounts as money out (credit-card-style export).";

  const txns = raws.map((r): ParsedTxn => {
    let isOut = outIsNegative ? r.signed < 0 : r.signed > 0;
    let typeSaysRefund = false;
    if (r.typeHint) {
      if (/debit|sale|purchase|withdraw|fee/.test(r.typeHint)) isOut = true;
      else if (/refund|return/.test(r.typeHint)) { isOut = false; typeSaysRefund = true; }
      else if (/credit|deposit|payment/.test(r.typeHint)) isOut = false;
    }
    // Into your own savings/brokerage = saved; back OUT of it to checking = just a transfer.
    const kind: TxnKind = looksLikeSave(r.description) ? (isOut ? "save" : "transfer")
      : looksLikeTransfer(r.description) || /^payment$/.test(r.typeHint) ? "transfer"
      : isOut ? "spend"
      : typeSaysRefund || looksLikeRefund(r.description) ? "refund"
      : "income";
    const merchant = cleanMerchant(r.description);
    // Our keyword guess first; the bank's own category column ("Gas", "Groceries") as backup.
    let category: string | undefined;
    if (kind === "spend" || kind === "refund") {
      category = getCategoryForExpense(merchant);
      if (category === "Other" && r.bankCategory) category = getCategoryForExpense(r.bankCategory);
    }
    return {
      date: r.date, description: r.description.slice(0, 200), merchant,
      amount: Math.round(Math.abs(r.signed) * 100) / 100, kind, category,
    };
  });
  return { txns, skipped, signNote };
}

// ── Duplicates ──────────────────────────────────────────────────────────────

// Same merchant, loosely: equal keys, or one key is a prefix of the other ("costco" vs
// "costcowhse"). Parsers clean names a little differently from run to run.
function sameMerchant(a: string, b: string): boolean {
  const ka = merchantKey(a), kb = merchantKey(b);
  if (ka === kb) return true;
  const short = ka.length < kb.length ? ka : kb;
  const long = ka.length < kb.length ? kb : ka;
  return short.length >= 4 && long.startsWith(short);
}

export function signedAmountFor(t: { amount: number; kind: TxnKind }): number {
  return t.kind === "refund" ? -t.amount : t.amount;
}

export function directionFor(kind: TxnKind): "in" | "out" | "save" {
  return kind === "income" ? "in" : kind === "save" ? "save" : "out";
}

export type DuplicateMatch = { index: number; existingId: string; existingDate: string; existingMerchant: string };

// Flags new rows that were ALREADY SAVED by an earlier import: same date, same amount,
// same direction, same merchant. Each existing row can absorb only ONE new row, so two
// identical $5.75 coffees on one statement — a real thing — only get one flagged when the
// earlier import had one of them. Identical rows within the same paste are never flagged.
export function findDuplicates(incoming: ParsedTxn[], existing: CashFlowTransaction[]): DuplicateMatch[] {
  const pool = new Map<string, CashFlowTransaction[]>();
  for (const e of existing) {
    const key = `${e.txn_date}|${Math.round(e.amount * 100)}|${e.direction}`;
    const list = pool.get(key) ?? [];
    list.push(e);
    pool.set(key, list);
  }
  const matches: DuplicateMatch[] = [];
  incoming.forEach((t, index) => {
    if (t.kind === "transfer") return;
    const key = `${t.date}|${Math.round(signedAmountFor(t) * 100)}|${directionFor(t.kind)}`;
    const list = pool.get(key);
    if (!list || list.length === 0) return;
    const at = list.findIndex((e) => sameMerchant(e.merchant, t.merchant) || sameMerchant(e.description, t.description));
    if (at < 0) return;
    const [hit] = list.splice(at, 1);
    matches.push({ index, existingId: hit.id, existingDate: hit.txn_date, existingMerchant: hit.merchant });
  });
  return matches;
}

// ── Bucket suggestion ───────────────────────────────────────────────────────

// Where a transaction most likely belongs: a remembered rule wins, then a budget item
// named after the merchant ("Netflix"), then a budget item in the same category
// (preferring one literally named after the category, e.g. "Food & Dining").
export function suggestBucket(
  t: { merchant: string; kind: TxnKind; category?: string; description?: string },
  items: BucketItem[],
  rules: MerchantRule[],
): string | null {
  if (t.kind === "transfer" || t.kind === "save") return null;
  const key = merchantKey(t.merchant);
  const rule = rules.find((r) => r.merchant_key === key);
  if (rule && items.some((i) => i.id === rule.cash_flow_item_id)) return rule.cash_flow_item_id;

  const wantType = t.kind === "income" ? "income" : "expense";
  const pool = items.filter((i) => i.type === wantType);
  const byName = pool.find((i) => {
    const k = merchantKey(i.label);
    return k.length >= 4 && (k === key || key.startsWith(k));
  });
  if (byName) return byName.id;
  if (wantType === "income") {
    // Only payroll-looking deposits are "regular pay"; anything else (a Marketplace sale,
    // a friend paying you back) defaults to extra one-time income.
    if (!looksLikePayroll(`${t.merchant} ${t.description ?? ""}`)) return null;
    if (pool.length === 0) return NEW_PAYCHECK_BUCKET;
    return pool.slice().sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0].id;
  }

  const cat = t.category ?? getCategoryForExpense(t.merchant);
  const inCat = pool.filter((i) => categoryOf(i) === cat);
  if (inCat.length === 0) return null;
  return (inCat.find((i) => i.label.toLowerCase() === cat.toLowerCase()) ?? inCat[0]).id;
}

// ── Rollup: transactions → monthly actuals ──────────────────────────────────

export type TxnActualRollup = {
  cash_flow_item_id: string;
  period_year: number;
  period_month: number;
  total: number;
  count: number;
  breakdown: { label: string; amount: number }[];
};

// Sums 'out' transactions per bucket per month (refunds are negative, so they net out).
// Unsorted rows (no bucket) are excluded here — the UI surfaces them separately so they
// get sorted rather than silently vanishing into nothing.
export function rollupTransactionActuals(txns: CashFlowTransaction[]): TxnActualRollup[] {
  const map = new Map<string, TxnActualRollup & { merchants: Map<string, number> }>();
  for (const t of txns) {
    if (t.direction !== "out" || !t.cash_flow_item_id) continue;
    const key = `${t.cash_flow_item_id}|${t.period_year}|${t.period_month}`;
    const g = map.get(key) ?? {
      cash_flow_item_id: t.cash_flow_item_id, period_year: t.period_year, period_month: t.period_month,
      total: 0, count: 0, breakdown: [], merchants: new Map<string, number>(),
    };
    g.total += t.amount;
    g.count++;
    g.merchants.set(t.merchant, (g.merchants.get(t.merchant) ?? 0) + t.amount);
    map.set(key, g);
  }
  return Array.from(map.values()).map(({ merchants, ...g }) => ({
    ...g,
    total: Math.round(g.total * 100) / 100,
    breakdown: Array.from(merchants.entries())
      .map(([label, amount]) => ({ label, amount: Math.round(amount * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount),
  }));
}

// ── Month income: expected vs recorded ──────────────────────────────────────

export type IncomeSource = { id: string; label: string; planMonthly: number };

export type MonthIncome = {
  total: number;          // what the month's math should use
  expected: number;       // the plan (effectiveIncome)
  regular: number;        // regular-pay portion of total
  extras: number;         // one-time income (unassigned 'in' transactions)
  extraCount: number;
  recordedRegular: number; // sum of income assigned to sources this month
  recordedCount: number;
  status: "expected" | "in-progress" | "recorded";
};

// Income for one month, from the plan and whatever was actually recorded.
//
// - Income assigned to a source (paycheck → "Salary") REPLACES that source's expected
//   amount for the month. Expected amounts are scaled by expectedTotal / Σ plans so they're
//   on the same after-401(k) basis as real deposits.
// - Unassigned income (a Marketplace sale) is EXTRA, added on top.
// - Profile-only income (no sources with a plan): any income assigned to a source replaces
//   the whole expected amount.
// - The month in progress never drops BELOW expected because of pay that hasn't landed yet
//   (one of two paychecks in shouldn't halve the month); past months use what was recorded.
//   Future months are expected only.
export function computeMonthIncome(p: {
  year: number;
  month: number;
  today: Date;
  sources: IncomeSource[];
  expectedTotal: number;
  transactions: CashFlowTransaction[];
}): MonthIncome {
  const period = p.year * 12 + (p.month - 1);
  const nowPeriod = p.today.getFullYear() * 12 + p.today.getMonth();
  const inMonth = p.transactions.filter((t) => t.direction === "in" && t.period_year === p.year && t.period_month === p.month);
  const sourceIds = new Set(p.sources.map((s) => s.id));
  const extrasList = inMonth.filter((t) => !t.cash_flow_item_id || !sourceIds.has(t.cash_flow_item_id));
  const extras = extrasList.reduce((s, t) => s + t.amount, 0);
  const recordedBy = new Map<string, number>();
  for (const t of inMonth) {
    if (t.cash_flow_item_id && sourceIds.has(t.cash_flow_item_id)) {
      recordedBy.set(t.cash_flow_item_id, (recordedBy.get(t.cash_flow_item_id) ?? 0) + t.amount);
    }
  }
  const recordedRegular = Array.from(recordedBy.values()).reduce((s, v) => s + v, 0);
  const recordedCount = inMonth.length - extrasList.length;

  const planSum = p.sources.reduce((s, x) => s + x.planMonthly, 0);
  const ratio = planSum > 0 ? p.expectedTotal / planSum : 1;
  const isPast = period < nowPeriod;
  const isCurrent = period === nowPeriod;

  let regular: number;
  if (period > nowPeriod) {
    regular = p.expectedTotal;
  } else if (planSum > 0) {
    regular = p.sources.reduce((s, src) => {
      const expectedShare = src.planMonthly * ratio;
      const rec = recordedBy.get(src.id);
      if (rec === undefined) return s + expectedShare;
      return s + (isCurrent ? Math.max(rec, expectedShare) : rec);
    }, 0);
  } else {
    regular = recordedRegular > 0
      ? (isCurrent ? Math.max(recordedRegular, p.expectedTotal) : recordedRegular)
      : p.expectedTotal;
  }

  return {
    total: regular + extras,
    expected: p.expectedTotal,
    regular,
    extras,
    extraCount: extrasList.length,
    recordedRegular,
    recordedCount,
    status: recordedCount === 0 ? "expected" : isPast ? "recorded" : "in-progress",
  };
}

// ── Guessed buckets ─────────────────────────────────────────────────────────

// When nothing matches, guess a NEW budget line named after the expense category rather
// than leaving the row unsorted — the user sees it pre-selected (marked "suggested") and
// only fixes the wrong ones, instead of picking every row by hand.
export function guessBucket(
  t: { merchant: string; kind: TxnKind; category?: string },
  expenseItems: { id: string; label: string; category?: string | null }[],
): string | null {
  if (t.kind !== "spend" && t.kind !== "refund") return null;
  const cat = t.category ?? getCategoryForExpense(t.merchant);
  const inCat = expenseItems.filter((i) => categoryOf(i) === cat);
  if (inCat.length > 0) return (inCat.find((i) => i.label.toLowerCase() === cat.toLowerCase()) ?? inCat[0]).id;
  return NEW_EXPENSE_BUCKET_PREFIX + cat;
}

// ── Recurring charges ───────────────────────────────────────────────────────

export type RecurringCharge = {
  key: string;
  merchant: string;
  typical: number;          // median charge
  latest: number;
  previous: number | null;  // the last charge at a DIFFERENT price, if any
  previousDate: string | null;
  months: number;           // distinct months seen
  increase: number;         // latest − previous when it went up by ≥ $1 and ≥ 2%, else 0
  bucketId: string | null;  // bucket of the latest charge
  lastDate: string;
};

// Same merchant charged in 3+ different months at a steady amount (every charge within 25%
// of the median) — subscriptions, phone bill, insurance. Groceries fail the steadiness test.
export function findRecurringCharges(txns: CashFlowTransaction[], today: Date): RecurringCharge[] {
  const cutoff = new Date(today.getFullYear(), today.getMonth() - 6, 1).toISOString().slice(0, 10);
  const groups = new Map<string, CashFlowTransaction[]>();
  for (const t of txns) {
    if (t.direction !== "out" || t.amount <= 0 || t.txn_date < cutoff) continue;
    const k = merchantKey(t.merchant);
    if (!k) continue;
    const list = groups.get(k) ?? [];
    list.push(t);
    groups.set(k, list);
  }
  const out: RecurringCharge[] = [];
  for (const [key, list] of groups) {
    // one charge per month: the month's largest (a refund-and-recharge shouldn't double up)
    const byMonth = new Map<string, CashFlowTransaction>();
    for (const t of list) {
      const ym = t.txn_date.slice(0, 7);
      const cur = byMonth.get(ym);
      if (!cur || t.amount > cur.amount) byMonth.set(ym, t);
    }
    if (byMonth.size < 3) continue;
    const monthly = Array.from(byMonth.values()).sort((a, b) => a.txn_date.localeCompare(b.txn_date));
    const amounts = monthly.map((t) => t.amount).sort((a, b) => a - b);
    const mid = Math.floor(amounts.length / 2);
    const typical = amounts.length % 2 ? amounts[mid] : (amounts[mid - 1] + amounts[mid]) / 2;
    if (monthly.some((t) => Math.abs(t.amount - typical) > typical * 0.25)) continue;
    const latest = monthly[monthly.length - 1];
    // Compare against the last charge at a different price, so "$15.49, $15.49, $17.99,
    // $17.99" still reports the increase instead of comparing the two $17.99s.
    const prev = monthly.slice(0, -1).reverse().find((t) => Math.abs(t.amount - latest.amount) >= 0.01) ?? null;
    const diff = prev ? latest.amount - prev.amount : 0;
    out.push({
      key, merchant: latest.merchant, typical: Math.round(typical * 100) / 100,
      latest: latest.amount, previous: prev?.amount ?? null, previousDate: prev?.txn_date ?? null, months: byMonth.size,
      increase: prev && diff >= 1 && diff >= prev.amount * 0.02 ? Math.round(diff * 100) / 100 : 0,
      bucketId: latest.cash_flow_item_id, lastDate: latest.txn_date,
    });
  }
  return out.sort((a, b) => b.increase - a.increase || b.typical - a.typical);
}

// ── Variable income ─────────────────────────────────────────────────────────

// Recorded pay per COMPLETED month for one income source, newest first.
export function recordedIncomeByMonth(txns: CashFlowTransaction[], sourceId: string, today: Date): number[] {
  const nowKey = today.getFullYear() * 12 + today.getMonth();
  const byMonth = new Map<number, number>();
  for (const t of txns) {
    if (t.direction !== "in" || t.cash_flow_item_id !== sourceId) continue;
    const k = t.period_year * 12 + (t.period_month - 1);
    if (k >= nowKey) continue;
    byMonth.set(k, (byMonth.get(k) ?? 0) + t.amount);
  }
  return Array.from(byMonth.entries()).sort((a, b) => b[0] - a[0]).map(([, v]) => v);
}
