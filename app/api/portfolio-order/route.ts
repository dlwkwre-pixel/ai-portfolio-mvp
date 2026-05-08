import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { portfolioIds } = await req.json();

    if (!Array.isArray(portfolioIds)) {
      return NextResponse.json({ error: "Invalid portfolioIds" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    await Promise.all(
      (portfolioIds as string[]).map((id, index) =>
        supabase
          .from("portfolios")
          .update({ display_order: index })
          .eq("id", id)
          .eq("user_id", user.id)
      )
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("portfolio-order error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
