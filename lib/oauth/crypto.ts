import { randomBytes, createHash, timingSafeEqual } from "crypto";

// Same shape as lib/auth/api-tokens.ts's generateApiToken — raw value shown/
// sent exactly once, only the sha256 hash ever persisted.
export function generateOpaqueToken(prefix: string): { raw: string; hash: string } {
  const raw = prefix + randomBytes(32).toString("base64url");
  const hash = sha256Hex(raw);
  return { raw, hash };
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// RFC 7636 S256: code_challenge = BASE64URL(SHA256(code_verifier)).
// Constant-time compare since this is effectively a credential check.
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  if (!codeVerifier || !codeChallenge) return false;
  const computed = createHash("sha256").update(codeVerifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(codeChallenge);
  return a.length === b.length && timingSafeEqual(a, b);
}
