"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function savePortfolioOrder(portfolioIds: string[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");

  // Update each portfolio's display_order based on its position in the array
  await Promise.all(
    portfolioIds.map((id, index) =>
      supabase
        .from("portfolios")
        .update({ display_order: index })
        .eq("id", id)
        .eq("user_id", user.id)
    )
  );

  revalidatePath("/dashboard");
}
