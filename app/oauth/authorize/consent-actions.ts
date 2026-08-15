"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClient, createAuthorizationCode } from "@/lib/oauth/tokens";

// Both actions re-validate client_id/redirect_uri against the DB even though
// app/oauth/authorize/page.tsx already did — a <form action> is itself a
// reachable POST endpoint, so it can't rely on the GET page having run first.
async function resolveTrustedRedirect(clientId: string, redirectUri: string): Promise<string> {
  const client = await getClient(clientId);
  if (!client || !client.redirectUris.includes(redirectUri)) {
    // Should be unreachable via the real consent form — the page that
    // renders it already validated this. Bail to a safe internal page
    // rather than trusting an unverified redirect_uri.
    redirect("/dashboard");
  }
  return redirectUri;
}

export async function approveAuthorization(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const clientId = String(formData.get("client_id") || "");
  const redirectUri = await resolveTrustedRedirect(clientId, String(formData.get("redirect_uri") || ""));
  const codeChallenge = String(formData.get("code_challenge") || "");
  const state = formData.get("state") ? String(formData.get("state")) : null;
  const resource = formData.get("resource") ? String(formData.get("resource")) : null;

  const code = await createAuthorizationCode({ clientId, userId: user.id, redirectUri, codeChallenge, resource });

  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  redirect(url.toString());
}

export async function denyAuthorization(formData: FormData): Promise<void> {
  const clientId = String(formData.get("client_id") || "");
  const redirectUri = await resolveTrustedRedirect(clientId, String(formData.get("redirect_uri") || ""));
  const state = formData.get("state") ? String(formData.get("state")) : null;

  const url = new URL(redirectUri);
  url.searchParams.set("error", "access_denied");
  if (state) url.searchParams.set("state", state);
  redirect(url.toString());
}
