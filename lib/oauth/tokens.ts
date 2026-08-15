import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateOpaqueToken, sha256Hex } from "./crypto";
import { AUTH_CODE_TTL_MS, ACCESS_TOKEN_TTL_MS, REFRESH_TOKEN_TTL_MS } from "./config";
import type { ApiTokenAuth } from "@/lib/auth/api-tokens";

export type OAuthClient = { clientId: string; clientName: string; redirectUris: string[] };

export async function registerClient(clientName: string, redirectUris: string[]): Promise<OAuthClient> {
  const clientId = "bt_client_" + randomUUID().replace(/-/g, "");
  const admin = createAdminClient();
  const { error } = await admin.from("oauth_clients").insert({
    client_id: clientId,
    client_name: clientName,
    redirect_uris: redirectUris,
  });
  if (error) throw new Error(error.message);
  return { clientId, clientName, redirectUris };
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("oauth_clients")
    .select("client_id, client_name, redirect_uris").eq("client_id", clientId).maybeSingle();
  if (!data) return null;
  return { clientId: data.client_id, clientName: data.client_name, redirectUris: data.redirect_uris as string[] };
}

// --- Authorization codes ---------------------------------------------------

export type PendingAuthorization = {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string | null;
};

export async function createAuthorizationCode(p: PendingAuthorization): Promise<string> {
  const { raw, hash } = generateOpaqueToken("bt_ac_");
  const admin = createAdminClient();
  const { error } = await admin.from("oauth_authorization_codes").insert({
    code_hash: hash,
    client_id: p.clientId,
    user_id: p.userId,
    redirect_uri: p.redirectUri,
    code_challenge: p.codeChallenge,
    resource: p.resource,
    expires_at: new Date(Date.now() + AUTH_CODE_TTL_MS).toISOString(),
  });
  if (error) throw new Error(error.message);
  return raw;
}

// Single-use: the row is deleted on the first successful lookup, valid or
// not, so a code can never be redeemed twice even under a race.
export async function consumeAuthorizationCode(raw: string): Promise<PendingAuthorization | null> {
  if (!raw || !raw.startsWith("bt_ac_")) return null;
  const hash = sha256Hex(raw);
  const admin = createAdminClient();
  const { data } = await admin.from("oauth_authorization_codes")
    .delete().eq("code_hash", hash)
    .select("client_id, user_id, redirect_uri, code_challenge, resource, expires_at")
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return {
    clientId: data.client_id,
    userId: data.user_id,
    redirectUri: data.redirect_uri,
    codeChallenge: data.code_challenge,
    resource: data.resource,
  };
}

// --- Access / refresh token pairs ------------------------------------------

export type TokenPair = { accessToken: string; refreshToken: string; expiresIn: number };

export async function issueTokenPair(clientId: string, userId: string, familyId?: string): Promise<TokenPair> {
  const access = generateOpaqueToken("bt_at_");
  const refresh = generateOpaqueToken("bt_rt_");
  const admin = createAdminClient();
  const { error } = await admin.from("oauth_tokens").insert({
    family_id: familyId ?? randomUUID(),
    client_id: clientId,
    user_id: userId,
    access_token_hash: access.hash,
    refresh_token_hash: refresh.hash,
    access_expires_at: new Date(Date.now() + ACCESS_TOKEN_TTL_MS).toISOString(),
    refresh_expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString(),
  });
  if (error) throw new Error(error.message);
  return { accessToken: access.raw, refreshToken: refresh.raw, expiresIn: ACCESS_TOKEN_TTL_MS / 1000 };
}

export async function verifyOAuthAccessToken(raw: string | null): Promise<ApiTokenAuth | null> {
  if (!raw || !raw.startsWith("bt_at_")) return null;
  const hash = sha256Hex(raw);
  const admin = createAdminClient();
  const { data } = await admin.from("oauth_tokens")
    .select("id, user_id, access_expires_at, revoked_at").eq("access_token_hash", hash).maybeSingle();
  if (!data || data.revoked_at) return null;
  if (new Date(data.access_expires_at).getTime() < Date.now()) return null;
  return { userId: data.user_id, tokenId: data.id };
}

// Rotates a refresh token: the presented token must be unused (rotated_at is
// null) and unrevoked and unexpired. On success the row is marked rotated
// and a new pair is issued sharing the same family_id. If a token that was
// ALREADY rotated gets presented again, that's replay of a stolen refresh
// token — the entire family (every descendant of the original grant) is
// revoked immediately.
export async function rotateRefreshToken(raw: string, clientId: string): Promise<TokenPair | null> {
  if (!raw || !raw.startsWith("bt_rt_")) return null;
  const hash = sha256Hex(raw);
  const admin = createAdminClient();
  const { data } = await admin.from("oauth_tokens")
    .select("id, family_id, client_id, user_id, refresh_expires_at, rotated_at, revoked_at")
    .eq("refresh_token_hash", hash).maybeSingle();
  if (!data || data.client_id !== clientId) return null;

  if (data.rotated_at || data.revoked_at) {
    await admin.from("oauth_tokens").update({ revoked_at: new Date().toISOString() }).eq("family_id", data.family_id);
    return null;
  }
  if (!data.refresh_expires_at || new Date(data.refresh_expires_at).getTime() < Date.now()) return null;

  await admin.from("oauth_tokens").update({ rotated_at: new Date().toISOString() }).eq("id", data.id);
  return issueTokenPair(data.client_id, data.user_id, data.family_id);
}
