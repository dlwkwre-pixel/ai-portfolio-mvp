import { randomBytes, createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const TOKEN_PREFIX = "bt_live_";

export type NewApiToken = {
  raw: string;        // shown to the user exactly once — never stored
  hash: string;        // sha256(raw), what's actually persisted
  displayPrefix: string; // safe to show in a token list, e.g. "bt_live_a1b2c3…"
};

export function generateApiToken(): NewApiToken {
  const raw = TOKEN_PREFIX + randomBytes(24).toString("base64url");
  const hash = createHash("sha256").update(raw).digest("hex");
  const displayPrefix = raw.slice(0, TOKEN_PREFIX.length + 6) + "…";
  return { raw, hash, displayPrefix };
}

export type ApiTokenAuth = { userId: string; tokenId: string };

// Verifies a raw Bearer token against the stored hash and returns the owning
// user. There's no Supabase auth session at this point (the whole reason
// this exists), so callers must apply their own .eq("user_id", userId)
// filters on every query — RLS won't fire for the service-role client this
// runs under.
export async function verifyApiToken(raw: string | null): Promise<ApiTokenAuth | null> {
  if (!raw || !raw.startsWith(TOKEN_PREFIX)) return null;

  const hash = createHash("sha256").update(raw).digest("hex");
  const admin = createAdminClient();
  const { data } = await admin
    .from("api_tokens")
    .select("id, user_id, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();

  if (!data || data.revoked_at) return null;

  void admin.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);

  return { userId: data.user_id, tokenId: data.id };
}
