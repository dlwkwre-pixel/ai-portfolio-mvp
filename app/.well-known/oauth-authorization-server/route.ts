import { NextResponse } from "next/server";
import { ISSUER, AUTHORIZATION_ENDPOINT, TOKEN_ENDPOINT, REGISTRATION_ENDPOINT, CORS_HEADERS } from "@/lib/oauth/config";

// RFC 8414 Authorization Server Metadata. Public client only (no secret
// issued — see lib/oauth/tokens.ts registerClient), PKCE S256 mandatory on
// every authorization_code grant.
export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(
    {
      issuer: ISSUER,
      authorization_endpoint: AUTHORIZATION_ENDPOINT,
      token_endpoint: TOKEN_ENDPOINT,
      registration_endpoint: REGISTRATION_ENDPOINT,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["read"],
    },
    { headers: CORS_HEADERS }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
