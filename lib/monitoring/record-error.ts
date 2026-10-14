import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Shared writer for app_errors (supabase/app-errors.sql), used by /api/client-errors and
// instrumentation.ts. Best-effort: never throws, so reporting an error can't cause one.

export type ErrorReport = {
  source: "client" | "server";
  message: string;
  stack?: string | null;
  path?: string | null;
  digest?: string | null;
  userId?: string | null;
  userAgent?: string | null;
  context?: Record<string, unknown> | null;
};

// Errors that aren't bugs in BuyTune: browser quirks, extensions, flaky networks,
// navigations the user cancelled, and Next's own control-flow throws.
const NOISE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /chrome-extension:|moz-extension:|safari-extension:/i,
  /^(TypeError: )?(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?)$/i,
  /AbortError|The user aborted a request|signal is aborted/i,
  /NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK/,
];

export function isNoise(message: string, stack?: string | null): boolean {
  return NOISE.some((re) => re.test(message) || (stack ? re.test(stack) : false));
}

// Same error on the same route = same group, regardless of query string, ids in the path,
// or numbers in the message (e.g. "index 3 out of range").
export function fingerprintFor(source: string, message: string, path: string | null | undefined): string {
  const route = (path ?? "").split("?")[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id").replace(/\/\d+(?=\/|$)/g, "/:n");
  const msg = message.split("\n")[0].replace(/\d+/g, "#").slice(0, 200);
  return createHash("sha1").update(`${source}|${route}|${msg}`).digest("hex").slice(0, 16);
}

export async function recordError(r: ErrorReport): Promise<void> {
  try {
    const message = (r.message || "Unknown error").slice(0, 1000);
    if (isNoise(message, r.stack)) return;
    await createAdminClient().from("app_errors").insert({
      source: r.source,
      message,
      stack: r.stack ? r.stack.slice(0, 4000) : null,
      path: r.path ? r.path.slice(0, 500) : null,
      digest: r.digest ? r.digest.slice(0, 100) : null,
      fingerprint: fingerprintFor(r.source, message, r.path),
      user_id: r.userId ?? null,
      user_agent: r.userAgent ? r.userAgent.slice(0, 300) : null,
      context: r.context ?? null,
    });
  } catch {
    // table not created yet, or the database is unreachable — drop the report
  }
}
