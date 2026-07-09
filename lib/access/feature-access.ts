import { createAdminClient } from "@/lib/supabase/admin";

// Admin-granted connection features. Vendor-agnostic keys so the UI can label them
// however we like (brokerage = SnapTrade, bank = Plaid today).
export type ConnectFeature = "brokerage_connect" | "bank_connect";
export const CONNECT_FEATURES: ConnectFeature[] = ["brokerage_connect", "bank_connect"];

// Which connection features a user has been granted. Uses the service-role client so
// it works from any server context; degrades to an empty set if the table isn't there
// yet or the read fails (feature simply stays hidden).
export async function getUserFeatures(userId: string): Promise<Set<string>> {
  if (!userId) return new Set();
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("feature_access").select("feature").eq("user_id", userId);
    return new Set((data ?? []).map((r) => r.feature as string));
  } catch {
    return new Set();
  }
}

export async function hasFeatureAccess(userId: string, feature: ConnectFeature): Promise<boolean> {
  return (await getUserFeatures(userId)).has(feature);
}
