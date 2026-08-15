import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClient } from "@/lib/oauth/tokens";
import { MCP_RESOURCE } from "@/lib/oauth/config";
import { Button } from "@/app/components/ui-primitives";
import { BrandGlyph } from "@/app/components/brand-mark";
import { approveAuthorization, denyAuthorization } from "./consent-actions";

// OAuth 2.1 consent screen — the human-in-the-loop step between an MCP
// client's authorization request and it receiving a code. Mirrors
// app/login/page.tsx's session + `next` redirect convention so an
// unauthenticated visitor lands back here, params intact, after signing in.
export const dynamic = "force-dynamic";

const INK = "oklch(0.2 0.03 150)";
const INK2 = "oklch(0.4 0.03 150)";
const GRAD = "linear-gradient(135deg,#3fae4a,#0ea5a0)";

type Props = {
  searchParams: Promise<{
    response_type?: string;
    client_id?: string;
    redirect_uri?: string;
    code_challenge?: string;
    code_challenge_method?: string;
    state?: string;
    resource?: string;
    scope?: string;
  }>;
};

function ErrorScreen({ message }: { message: string }) {
  return (
    <div style={{ minHeight: "100vh", background: "oklch(0.91 0.04 150)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "var(--font-body)" }}>
      <div style={{ maxWidth: "400px", textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 700, color: INK, marginBottom: "8px" }}>Can&apos;t continue</h1>
        <p style={{ fontSize: "13px", color: INK2, lineHeight: 1.6 }}>{message}</p>
      </div>
    </div>
  );
}

export default async function OAuthAuthorizePage({ searchParams }: Props) {
  const sp = await searchParams;
  const { response_type, client_id, redirect_uri, code_challenge, code_challenge_method, state, resource } = sp;

  if (!client_id || !redirect_uri) {
    return <ErrorScreen message="This link is missing required parameters (client_id, redirect_uri)." />;
  }

  const client = await getClient(client_id);
  if (!client) {
    return <ErrorScreen message="Unknown client — this app hasn't registered with BuyTune." />;
  }
  if (!client.redirectUris.includes(redirect_uri)) {
    return <ErrorScreen message="This app's redirect URL doesn't match what it registered with BuyTune." />;
  }

  // redirect_uri is trusted from here on — every further validation failure
  // bounces back to the client with a standard OAuth error instead of
  // dead-ending on this page.
  function bounceWithError(error: string, description: string): never {
    const url = new URL(redirect_uri!);
    url.searchParams.set("error", error);
    url.searchParams.set("error_description", description);
    if (state) url.searchParams.set("state", state);
    redirect(url.toString());
  }

  if (response_type !== "code") bounceWithError("unsupported_response_type", "Only 'code' is supported.");
  if (!code_challenge || code_challenge_method !== "S256") bounceWithError("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  if (resource && resource !== MCP_RESOURCE) bounceWithError("invalid_target", `This authorization server only issues tokens for ${MCP_RESOURCE}.`);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const params = new URLSearchParams();
    params.set("response_type", response_type!);
    params.set("client_id", client_id);
    params.set("redirect_uri", redirect_uri);
    params.set("code_challenge", code_challenge!);
    params.set("code_challenge_method", code_challenge_method!);
    if (state) params.set("state", state);
    if (resource) params.set("resource", resource);
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${params.toString()}`)}`);
  }

  return (
    <div style={{ minHeight: "100vh", background: "oklch(0.91 0.04 150)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "var(--font-body)" }}>
      <div style={{ width: "100%", maxWidth: "420px", background: "#fff", border: "1px solid rgba(20,30,20,0.1)", borderRadius: "16px", padding: "32px", boxShadow: "0 12px 40px rgba(20,30,20,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px" }}>
          <div style={{ width: "36px", height: "36px", minWidth: "36px", background: GRAD, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(14,165,160,0.3)" }}>
            <BrandGlyph size={18} strokeWidth={2.4} />
          </div>
          <span style={{ fontFamily: "var(--font-logo)", fontWeight: 700, fontSize: "16px", color: INK }}>BuyTune.io</span>
        </div>

        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "19px", fontWeight: 700, color: INK, letterSpacing: "-0.3px", marginBottom: "6px", lineHeight: 1.35 }}>
          {client.clientName} wants to access your BuyTune account
        </h1>
        <p style={{ fontSize: "13px", color: INK2, marginBottom: "20px" }}>Signed in as {user.email}</p>

        <div style={{ background: "rgba(14,148,136,0.06)", border: "1px solid rgba(14,148,136,0.15)", borderRadius: "10px", padding: "14px 16px", marginBottom: "24px" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: INK, marginBottom: "8px" }}>This will let {client.clientName}:</div>
          <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12.5px", color: INK2, lineHeight: 1.8 }}>
            <li>Read your portfolios, holdings, watchlist, and cached AI research/recommendations</li>
            <li>Add tickers to your BuyTune watchlist</li>
          </ul>
          <div style={{ fontSize: "11.5px", color: INK2, marginTop: "8px", lineHeight: 1.6 }}>
            It cannot place trades, move money, or touch a brokerage account — BuyTune never holds those credentials. You can revoke this anytime from Settings.
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <form action={denyAuthorization} style={{ flex: 1 }}>
            <input type="hidden" name="client_id" value={client_id} />
            <input type="hidden" name="redirect_uri" value={redirect_uri} />
            {state && <input type="hidden" name="state" value={state} />}
            <Button type="submit" variant="ghost" style={{ width: "100%" }}>Deny</Button>
          </form>
          <form action={approveAuthorization} style={{ flex: 1 }}>
            <input type="hidden" name="client_id" value={client_id} />
            <input type="hidden" name="redirect_uri" value={redirect_uri} />
            <input type="hidden" name="code_challenge" value={code_challenge!} />
            {state && <input type="hidden" name="state" value={state} />}
            {resource && <input type="hidden" name="resource" value={resource} />}
            <Button type="submit" variant="primary" style={{ width: "100%" }}>Approve</Button>
          </form>
        </div>
      </div>
    </div>
  );
}
