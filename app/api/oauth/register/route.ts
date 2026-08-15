import { NextRequest, NextResponse } from "next/server";
import { registerClient } from "@/lib/oauth/tokens";
import { checkRateLimit, getIp } from "@/lib/rate-limit";
import { CORS_HEADERS } from "@/lib/oauth/config";

export const dynamic = "force-dynamic";

// RFC 7591 Dynamic Client Registration. Unauthenticated by design — this is
// how a new agent platform (e.g. claude.ai) introduces itself to BuyTune for
// the first time, before any user has logged in. Only issues public clients
// (no client_secret): security comes from exact redirect_uri matching at
// /oauth/authorize plus mandatory PKCE at the token endpoint, not a shared
// secret a public/native client couldn't keep safe anyway.
function isAllowedRedirectUri(uri: string): boolean {
  let parsed: URL;
  try { parsed = new URL(uri); } catch { return false; }
  if (parsed.protocol === "https:") return true;
  if (parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")) return true;
  return false;
}

export async function POST(req: NextRequest) {
  // Registration is cheap to spam (it just inserts a row), so this is keyed
  // by IP and generous — the point is blocking an automated flood, not
  // limiting legitimate one-time client setup.
  const { limited, retryAfter } = checkRateLimit(`oauth-register:${getIp(req)}`, 20, 60_000);
  if (limited) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { ...CORS_HEADERS, "Retry-After": String(retryAfter) } });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_client_metadata" }, { status: 400, headers: CORS_HEADERS });
  }

  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u: unknown) => typeof u === "string") : [];
  if (redirectUris.length === 0 || !redirectUris.every(isAllowedRedirectUri)) {
    return NextResponse.json(
      { error: "invalid_redirect_uri", error_description: "redirect_uris must be non-empty and each must be https://, or http://localhost for local development." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const clientName = typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.trim().slice(0, 120) : "Unnamed MCP client";

  const client = await registerClient(clientName, redirectUris);

  return NextResponse.json(
    {
      client_id: client.clientId,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_id_issued_at: Math.floor(Date.now() / 1000),
    },
    { status: 201, headers: CORS_HEADERS }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
