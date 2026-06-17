import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import OpenAI from "openai";

export type ImportedItem = {
  type: "income" | "expense";
  label: string;
  amount: number;
  frequency: "monthly" | "annual";
  category?: string;
};

const VALID_CATEGORIES = [
  "Housing", "Transportation", "Food & Dining", "Healthcare", "Fitness",
  "Insurance", "Utilities", "Entertainment", "Travel", "Subscriptions", "Childcare", "Other",
];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { limited, retryAfter } = checkRateLimit(`planning-import:${user.id}`, 12, 5 * 60_000);
  if (limited) return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Groq not configured." }, { status: 500 });

  let rawText: string;
  let mode: "budget" | "statement" = "budget";
  try {
    const body = await req.json() as { text: string; mode?: "budget" | "statement" };
    rawText = body.text?.trim();
    if (body.mode === "statement") mode = "statement";
    if (!rawText) throw new Error("empty");
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (rawText.length > 8000) {
    return NextResponse.json({ error: "Input too long (max 8000 characters)." }, { status: 400 });
  }

  const budgetSystemPrompt = `You are a financial data parser. Extract income and expense line items from the provided text.
The text may be a bank statement, CSV export, budget description, or free-form list.
Return ONLY a valid JSON array. No markdown, no code fences, no explanation — just the raw JSON array.

Each item must have exactly these fields:
- "type": "income" or "expense"
- "label": short human-readable name (max 40 chars, title-cased)
- "amount": positive number (monthly dollar amount if monthly, annual if annual)
- "frequency": "monthly" or "annual"
- "category": one of: Housing, Transportation, Food & Dining, Healthcare, Fitness, Insurance, Utilities, Entertainment, Travel, Subscriptions, Childcare, Other

Rules:
- If frequency is ambiguous and amount looks monthly (under $3000 for expenses), use "monthly".
- Salary/wages: "annual" if stated yearly, otherwise "monthly".
- Ignore one-time transactions, ATM withdrawals, transfers between accounts, balance info.
- Ignore duplicates — if the same item appears multiple times, include it once.
- Cap output at 40 items.
- If nothing useful can be extracted, return [].`;

  const statementSystemPrompt = `You are processing a credit card or bank statement to extract actual spending by merchant.
Return ONLY a valid JSON array. No markdown, no code fences, no explanation — just the raw JSON array.

Each item must have exactly these fields:
- "type": always "expense"
- "label": merchant name, cleaned and title-cased (max 40 chars)
- "amount": TOTAL spent at this merchant across all transactions in the statement (positive number, sum if multiple charges)
- "frequency": always "monthly"
- "category": one of: Housing, Transportation, Food & Dining, Healthcare, Fitness, Insurance, Utilities, Entertainment, Travel, Subscriptions, Childcare, Other

Rules:
- Group ALL charges from the same merchant into ONE item with the summed total.
- Do NOT include: payments, credits, returns, refunds, ATM withdrawals, balance transfers, fees you can't categorize.
- Classify restaurant names, fast food chains, grocery stores, cafes under "Food & Dining".
- Classify streaming services, software subscriptions under "Entertainment" or "Subscriptions".
- Cap output at 60 items.
- If nothing useful can be extracted, return [].`;

  const userPrompt = mode === "statement"
    ? `Parse this credit card/bank statement and group spending by merchant:\n\n${rawText}`
    : `Parse the following financial data into income and expense items:\n\n${rawText}`;

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });

    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: mode === "statement" ? statementSystemPrompt : budgetSystemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 3000,
      temperature: 0.1,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "[]";

    let items: ImportedItem[];
    try {
      const parsed = JSON.parse(raw) as unknown[];
      items = parsed
        .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
        .map((x): ImportedItem => ({
          type: (x.type === "income" || x.type === "expense") ? x.type : "expense",
          label: String(x.label ?? "Unnamed").slice(0, 40),
          amount: Math.abs(Number(x.amount) || 0),
          frequency: (x.frequency === "monthly" || x.frequency === "annual") ? x.frequency : "monthly",
          category: VALID_CATEGORIES.includes(String(x.category ?? "")) ? String(x.category) : undefined,
        }))
        .filter((x) => x.amount > 0)
        .slice(0, mode === "statement" ? 60 : 40);
    } catch {
      return NextResponse.json({ error: "AI returned unparseable output. Try rephrasing your input." }, { status: 422 });
    }

    return NextResponse.json({ items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
