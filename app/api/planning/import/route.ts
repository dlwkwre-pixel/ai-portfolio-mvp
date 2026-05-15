import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

export type ImportedItem = {
  type: "income" | "expense";
  label: string;
  amount: number;
  frequency: "monthly" | "annual";
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Groq not configured." }, { status: 500 });

  let rawText: string;
  try {
    const body = await req.json() as { text: string };
    rawText = body.text?.trim();
    if (!rawText) throw new Error("empty");
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (rawText.length > 8000) {
    return NextResponse.json({ error: "Input too long (max 8000 characters)." }, { status: 400 });
  }

  const systemPrompt = `You are a financial data parser. Extract income and expense line items from the provided text.
The text may be a bank statement, CSV export, budget description, or free-form list.
Return ONLY a valid JSON array. No markdown, no code fences, no explanation — just the raw JSON array.

Each item in the array must have exactly these fields:
- "type": "income" or "expense"
- "label": a short human-readable name (max 40 chars, title-cased)
- "amount": a positive number (monthly dollar amount if monthly, annual if annual)
- "frequency": "monthly" or "annual"

Rules:
- If the frequency is ambiguous and the amount looks like a monthly figure (under $3000 for expenses), use "monthly".
- Salary/wages should be "annual" if stated as yearly, otherwise "monthly".
- Ignore one-time transactions, ATM withdrawals, transfers between accounts, and balance information.
- Ignore duplicates — if the same item appears multiple times, include it once.
- Cap output at 40 items.
- If nothing useful can be extracted, return an empty array [].`;

  const userPrompt = `Parse the following financial data into income and expense items:\n\n${rawText}`;

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });

    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 2000,
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
        }))
        .filter((x) => x.amount > 0)
        .slice(0, 40);
    } catch {
      return NextResponse.json({ error: "AI returned unparseable output. Try rephrasing your input." }, { status: 422 });
    }

    return NextResponse.json({ items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
