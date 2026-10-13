import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { EXPENSE_CATEGORIES } from "@/lib/planning/expense-categories";
import {
  parseCsvStatement, parseFlexibleDate, cleanMerchant, looksLikeTransfer,
  findDuplicates, suggestBucket,
  type ParsedTxn, type TxnKind, type CashFlowTransaction, type MerchantRule,
} from "@/lib/planning/transactions";

// Statement → individual dated transactions, flagged for duplicates against what's
// already saved and pre-bucketed. Nothing is written here — the review UI decides,
// then saveImportedTransactions (planning-actions.ts) persists.

export type ReviewTxn = ParsedTxn & {
  suggestedItemId: string | null;
  duplicateOf: { id: string; date: string; merchant: string } | null;
};

export type ParseTransactionsResponse = {
  transactions?: ReviewTxn[];
  parser?: "csv" | "ai";
  warnings?: string[];
  error?: string;
};

const MAX_CHARS = 60_000;
const CHUNK_CHARS = 3_500;   // ~60-80 statement lines — keeps each AI response well under its token cap
const MAX_CONCURRENCY = 3;
const VALID_CATEGORIES = EXPENSE_CATEGORIES.map((c) => c.label);
const KINDS: TxnKind[] = ["spend", "refund", "income", "transfer"];

function chunkLines(text: string): { text: string; firstLine: number; lastLine: number }[] {
  const lines = text.split(/\r?\n/);
  const chunks: { text: string; firstLine: number; lastLine: number }[] = [];
  let buf: string[] = [];
  let size = 0;
  let first = 1;
  lines.forEach((line, i) => {
    if (size + line.length > CHUNK_CHARS && buf.length > 0) {
      chunks.push({ text: buf.join("\n"), firstLine: first, lastLine: i });
      buf = []; size = 0; first = i + 1;
    }
    buf.push(line);
    size += line.length + 1;
  });
  if (buf.some((l) => l.trim())) chunks.push({ text: buf.join("\n"), firstLine: first, lastLine: lines.length });
  return chunks;
}

function systemPrompt(today: string): string {
  return `You extract individual transactions from a bank or credit card statement that a user pasted.
Today's date is ${today}. Return ONLY a JSON object, no markdown:
{"transactions":[{"date":"YYYY-MM-DD","description":"raw text","merchant":"Clean Name","amount":12.34,"kind":"spend","category":"Food & Dining"}],"note":""}

Rules:
- ONE entry per transaction line. Never combine or sum charges, even from the same merchant on the same day.
- "date": the transaction date as YYYY-MM-DD. If the statement omits the year, use the most recent year that is not in the future relative to today.
- "amount": always a positive number.
- "kind": "spend" (a purchase or bill), "refund" (money returned from a merchant), "income" (paycheck, deposit, someone paying the user, a sale), or "transfer" (credit card payment, moving money between the user's own accounts).
- Money sent to another person (Venmo, Zelle, Cash App, PayPal) is "spend"; money received from another person is "income". Only use "transfer" when both sides are the user's own accounts or it's paying off a card.
- "category" (only for spend/refund): one of ${VALID_CATEGORIES.join(", ")}.
- "merchant": the store or payer name, title-cased, without store numbers, locations or processor prefixes like "SQ *".
- Skip balances, statement summaries, interest-rate tables, headers and page footers.
- If there are no transactions in the text, return {"transactions":[],"note":"<one sentence telling the user why, e.g. it looks like a summary page, or amounts are missing>"}.`;
}

type AiChunkResult = { txns: ParsedTxn[]; note: string };

async function parseChunkWithAi(client: OpenAI, text: string, today: string): Promise<AiChunkResult> {
  const completion = await client.chat.completions.create({
    model: "openai/gpt-oss-120b",
    messages: [
      { role: "system", content: systemPrompt(today) },
      { role: "user", content: text },
    ],
    max_tokens: 12000,
    temperature: 0,
    // Extraction doesn't need deep reasoning; low effort keeps reasoning tokens from
    // eating the output budget on a long chunk.
    ...({ reasoning_format: "hidden", reasoning_effort: "low" } as Record<string, unknown>),
  });
  const raw = completion.choices[0]?.message?.content ?? "";
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in response");
  const parsed = JSON.parse(raw.slice(start, end + 1)) as { transactions?: unknown[]; note?: unknown };

  const txns: ParsedTxn[] = [];
  for (const x of parsed.transactions ?? []) {
    if (typeof x !== "object" || x === null) continue;
    const r = x as Record<string, unknown>;
    const date = parseFlexibleDate(String(r.date ?? ""), today);
    const amount = Math.abs(Number(r.amount));
    if (!date || !Number.isFinite(amount) || amount === 0) continue;
    const description = String(r.description ?? r.merchant ?? "").slice(0, 200);
    const merchant = String(r.merchant ?? "").trim() || cleanMerchant(description);
    let kind: TxnKind = KINDS.includes(r.kind as TxnKind) ? (r.kind as TxnKind) : "spend";
    // Belt and braces: a card payment the model called "income" would inflate income.
    if (kind === "income" && looksLikeTransfer(description)) kind = "transfer";
    const category = VALID_CATEGORIES.includes(String(r.category)) ? String(r.category) : undefined;
    txns.push({ date, description, merchant: merchant.slice(0, 60), amount: Math.round(amount * 100) / 100, kind, category });
  }
  return { txns, note: typeof parsed.note === "string" ? parsed.note : "" };
}

// Specific, actionable reasons instead of "something went wrong".
function diagnose(text: string): string | null {
  if (!/\d/.test(text)) return "There are no numbers in what you pasted, so there are no amounts to read. Copy the transaction list itself, not the account overview.";
  if (!/\d+[.,]\d{2}\b/.test(text) && !/\$\s?\d/.test(text)) return "We couldn't find any dollar amounts (like 12.34). Make sure the amount column was included when you copied.";
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length <= 2 && text.length > 1500) return "This looks like it lost its line breaks (common when copying from a PDF). Try downloading the CSV from your bank instead, or paste a few rows at a time.";
  return null;
}

async function runPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try { results[i] = { status: "fulfilled", value: await fn(items[i]) }; }
      catch (reason) { results[i] = { status: "rejected", reason }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function POST(req: NextRequest): Promise<NextResponse<ParseTransactionsResponse>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let text: string;
  let today: string;
  try {
    const body = await req.json() as { text?: string; today?: string };
    text = String(body.text ?? "").trim();
    today = /^\d{4}-\d{2}-\d{2}$/.test(String(body.today)) ? String(body.today) : new Date().toISOString().slice(0, 10);
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!text) return NextResponse.json({ error: "Paste a statement or choose a CSV file first." }, { status: 400 });
  if (text.length > MAX_CHARS) {
    return NextResponse.json({ error: `That's ${text.length.toLocaleString()} characters — the limit is ${MAX_CHARS.toLocaleString()}. Import one month at a time.` }, { status: 400 });
  }
  const reason = diagnose(text);
  if (reason) return NextResponse.json({ error: reason }, { status: 422 });

  const warnings: string[] = [];
  let txns: ParsedTxn[] = [];
  let parser: "csv" | "ai" = "csv";

  // 1) Deterministic CSV/table parse — free, instant, exact.
  const csv = parseCsvStatement(text, today);
  if (csv && csv.txns.length > 0) {
    txns = csv.txns;
    if (csv.signNote) warnings.push(`${csv.signNote} If that's backwards, use "Swap money in/out".`);
    if (csv.skipped > 0) warnings.push(`${csv.skipped} row${csv.skipped !== 1 ? "s" : ""} without a date or amount were skipped (headers, balances, blank lines).`);
  } else {
    // 2) AI parse for copied/plain-text statements, in chunks so long statements fit.
    parser = "ai";
    const { limited, retryAfter } = checkRateLimit(`planning-txn-parse:${user.id}`, 10, 5 * 60_000);
    if (limited) return NextResponse.json({ error: "Too many imports in a short time. Please wait a few minutes." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Statement reading isn't configured. Try a CSV export instead." }, { status: 500 });

    const client = new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" });
    const chunks = chunkLines(text);
    const results = await runPool(chunks, MAX_CONCURRENCY, (c) => parseChunkWithAi(client, c.text, today));
    const notes: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        txns.push(...r.value.txns);
        if (r.value.txns.length === 0 && r.value.note) notes.push(r.value.note);
      } else {
        warnings.push(`Lines ${chunks[i].firstLine}–${chunks[i].lastLine} couldn't be read. Check those transactions made it in, or paste them again on their own.`);
      }
    });
    if (txns.length === 0) {
      const allFailed = results.every((r) => r.status === "rejected");
      return NextResponse.json({
        error: allFailed
          ? "The statement reader didn't respond properly. Try again, or download a CSV from your bank — those import without AI."
          : notes[0] ?? "No transactions found. Make sure each line includes a date, a description and an amount.",
      }, { status: 422 });
    }
  }

  // 3) Flag rows already saved by an earlier import, and pre-pick a bucket for each.
  txns.sort((a, b) => a.date.localeCompare(b.date));
  const minDate = txns[0].date;
  const maxDate = txns[txns.length - 1].date;
  const [{ data: existing }, { data: items }, { data: rules }] = await Promise.all([
    supabase.from("cash_flow_transactions")
      .select("id, txn_date, period_year, period_month, description, merchant, amount, direction, cash_flow_item_id, source, import_batch_id, note")
      .eq("user_id", user.id).gte("txn_date", minDate).lte("txn_date", maxDate),
    supabase.from("cash_flow_items").select("id, label, type, category").eq("user_id", user.id),
    supabase.from("cash_flow_merchant_rules").select("merchant_key, cash_flow_item_id").eq("user_id", user.id),
  ]);

  const existingTyped: CashFlowTransaction[] = (existing ?? []).map((e) => ({ ...e, amount: Number(e.amount) }) as CashFlowTransaction);
  const dupes = new Map(findDuplicates(txns, existingTyped).map((d) => [d.index, d]));
  const bucketItems = (items ?? []) as { id: string; label: string; type: "income" | "expense"; category: string | null }[];
  const ruleList = (rules ?? []) as MerchantRule[];

  const transactions: ReviewTxn[] = txns.map((t, i) => {
    const d = dupes.get(i);
    return {
      ...t,
      suggestedItemId: suggestBucket(t, bucketItems, ruleList),
      duplicateOf: d ? { id: d.existingId, date: d.existingDate, merchant: d.existingMerchant } : null,
    };
  });

  return NextResponse.json({ transactions, parser, warnings });
}
