import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ portfolios: [] });

  const { data } = await supabase
    .from("portfolios")
    .select("id, name, account_type")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  return NextResponse.json({ portfolios: data ?? [] });
}
