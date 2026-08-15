// Shared constants for the OAuth 2.1 authorization server. Kept separate
// from the route handlers so the metadata documents (RFC 8414 / RFC 9728)
// and the actual endpoints can never drift apart on issuer/endpoint URLs.

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://buytune.io";

export const ISSUER = SITE_URL;
export const AUTHORIZATION_ENDPOINT = `${SITE_URL}/oauth/authorize`;
export const TOKEN_ENDPOINT = `${SITE_URL}/api/oauth/token`;
export const REGISTRATION_ENDPOINT = `${SITE_URL}/api/oauth/register`;
export const MCP_RESOURCE = `${SITE_URL}/api/mcp`;
export const PROTECTED_RESOURCE_METADATA_URL = `${SITE_URL}/.well-known/oauth-protected-resource`;

// Short — an authorization code only needs to live long enough for the
// client to hit the token endpoint in the same round trip.
export const AUTH_CODE_TTL_MS = 60 * 1000;
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h
export const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90d, rotates on every use

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
