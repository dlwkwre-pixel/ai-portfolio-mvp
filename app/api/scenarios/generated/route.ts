import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type AIGeneratedScenario = {
  id: string;
  scenario_key: string;
  title: string;
  thesis: string;
  emoji: string;
  category: string;
  tags: string[];
  keywords: string[];
  long_plays:  { ticker: string; name: string; reason: string }[];
  avoid_plays: { ticker: string; name: string; reason: string }[];
  time_horizon: string;
  trigger_context: string | null;
  generated_at: string;
  expires_at: string;
};

export async function GET() {
  try {
    const supabase = await createClient();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("ai_generated_scenarios")
      .select("*")
      .eq("is_active", true)
      .gt("expires_at", now)
      .order("generated_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    return NextResponse.json((data ?? []) as AIGeneratedScenario[]);
  } catch (err) {
    console.error("Failed to fetch AI scenarios:", err);
    return NextResponse.json([], { status: 200 }); // soft-fail: panel just shows nothing
  }
}
