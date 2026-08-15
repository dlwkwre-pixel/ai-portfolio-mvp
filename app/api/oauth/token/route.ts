import { NextRequest, NextResponse } from "next/server";
import { consumeAuthorizationCode, issueTokenPair, rotateRefreshToken, getClient } from "@/lib/oauth/tokens";
import { verifyPkce } from "@/lib/oauth/crypto";
import { CORS_HEADERS, MCP_RESOURCE } from "@/lib/oauth/config";
import { checkRateLimit, getIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function oauthError(error: string, description: string, status = 400) {
  return NextResponse.json({ error, error_description: description }, { status, headers: CORS_HEADERS });
}

// Public clients only — no client_secret is ever issued (see
// lib/oauth/tokens.ts registerClient), so this endpoint accepts form-encoded
// or JSON bodies per RFC 6749 §4.1.3 / MCP's OAuth guidance, with no
// client-auth header to check. Security comes from PKCE + single-use codes +
// exact redirect_uri matching, all already enforced upstream at
// /oauth/authorize.
async function parseBody(req: NextRequest): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = await req.json().catch(() => null);
    return json && typeof json === "object" ? json : {};
  }
  const text = await req.text();
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(text)) out[k] = v;
  return out;
}

export async function POST(req: NextRequest) {
  const { limited, retryAfter } = checkRateLimit(`oauth-token:${getIp(req)}`, 30, 60_000);
  if (limited) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { ...CORS_HEADERS, "Retry-After": String(retryAfter) } });
  }

  const body = await parseBody(req);

  if (body.grant_type === "authorization_code") {
    const { code, redirect_uri, client_id, code_verifier, resource } = body;
    if (!code || !redirect_uri || !client_id || !code_verifier) {
      return oauthError("invalid_request", "code, redirect_uri, client_id, and code_verifier are all required.");
    }

    const pending = await consumeAuthorizationCode(code);
    if (!pending) return oauthError("invalid_grant", "Authorization code is invalid, expired, or already used.");
    if (pending.clientId !== client_id) return oauthError("invalid_grant", "client_id does not match the authorization request.");
    if (pending.redirectUri !== redirect_uri) return oauthError("invalid_grant", "redirect_uri does not match the authorization request.");
    if (resource && resource !== MCP_RESOURCE) return oauthError("invalid_target", `This authorization server only issues tokens for ${MCP_RESOURCE}.`);
    if (!verifyPkce(code_verifier, pending.codeChallenge)) return oauthError("invalid_grant", "PKCE verification failed.");

    const pair = await issueTokenPair(pending.clientId, pending.userId);
    return NextResponse.json(
      { access_token: pair.accessToken, token_type: "Bearer", expires_in: pair.expiresIn, refresh_token: pair.refreshToken, scope: "read" },
      { headers: CORS_HEADERS }
    );
  }

  if (body.grant_type === "refresh_token") {
    const { refresh_token, client_id } = body;
    if (!refresh_token || !client_id) return oauthError("invalid_request", "refresh_token and client_id are required.");

    const client = await getClient(client_id);
    if (!client) return oauthError("invalid_client", "Unknown client_id.");

    const pair = await rotateRefreshToken(refresh_token, client_id);
    if (!pair) return oauthError("invalid_grant", "Refresh token is invalid, expired, or already used.");

    return NextResponse.json(
      { access_token: pair.accessToken, token_type: "Bearer", expires_in: pair.expiresIn, refresh_token: pair.refreshToken, scope: "read" },
      { headers: CORS_HEADERS }
    );
  }

  return oauthError("unsupported_grant_type", "Only authorization_code and refresh_token grants are supported.");
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
