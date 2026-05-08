"use server";

import { createClient } from "@/lib/supabase/server";

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
  // No revalidatePath — the client already shows the correct order via optimistic
  // state. The saved display_order will be applied on the next full page load.
}
