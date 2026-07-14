import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

// Manual accounts: balances no aggregator can reach (Robinhood spending, HSAs, cash).
// Stored in bank_accounts with item_id "manual" so net-worth surfaces treat aggregated
// and manual balances through one pipeline. Available to every signed-in user — there's
// no provider cost, so no feature gate.

const TYPES = new Set(["depository", "credit", "loan", "investment"]);

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as { id?: string; name?: string; type?: string; balance?: number } | null;
  const name = body?.name?.trim().slice(0, 80);
  const type = TYPES.has(body?.type ?? "") ? body!.type! : "depository";
  const balance = Number(body?.balance);
  if (!body?.id && !name) return NextResponse.json({ error: "Give the account a name." }, { status: 400 });
  if (!Number.isFinite(balance)) return NextResponse.json({ error: "Enter a valid balance." }, { status: 400 });

  const admin = createAdminClient();
  try {
    if (body?.id) {
      // Update balance (and name/type when provided) — only the user's own manual rows.
      const { error } = await admin.from("bank_accounts")
        .update({
          balance_current: Math.round(balance * 100) / 100,
          ...(name ? { name } : {}),
          type,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id).eq("item_id", "manual").eq("account_id", body.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    const accountId = `manual:${randomUUID()}`;
    const { error } = await admin.from("bank_accounts").insert({
      user_id: user.id,
      item_id: "manual",
      account_id: accountId,
      name,
      type,
      subtype: "manual",
      balance_current: Math.round(balance * 100) / 100,
      iso_currency: "USD",
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, id: accountId });
  } catch {
    return NextResponse.json({ error: "Could not save. Run supabase/bank-connections.sql first." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as { id?: string } | null;
  if (!body?.id) return NextResponse.json({ error: "Missing account." }, { status: 400 });

  const admin = createAdminClient();
  // item_id guard means a Plaid-linked row can never be deleted through this route.
  await admin.from("bank_accounts").delete()
    .eq("user_id", user.id).eq("item_id", "manual").eq("account_id", body.id)
    .then((r) => r, () => ({}));
  return NextResponse.json({ ok: true });
}
