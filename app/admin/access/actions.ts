"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { BLOCKABLE_PAGES } from "@/lib/access/page-blocks";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) return null;
  return user;
}

// Block or restore one page for one user. Admin-only, service-role write.
export async function setPageBlock(
  userId: string, page: string, blocked: boolean,
): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Not authorized." };
  if (!userId || !BLOCKABLE_PAGES.some((p) => p.id === page)) return { error: "Bad request." };
  if (userId === admin.id) return { error: "You can't block your own admin account." };

  try {
    const svc = createAdminClient();
    if (blocked) {
      const { error } = await svc.from("page_blocks").upsert(
        { user_id: userId, page, blocked_by: admin.id, blocked_at: new Date().toISOString() },
        { onConflict: "user_id,page" },
      );
      if (error) return { error: error.message };
    } else {
      const { error } = await svc.from("page_blocks").delete().eq("user_id", userId).eq("page", page);
      if (error) return { error: error.message };
    }
    revalidatePath("/admin/access");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update access." };
  }
}
