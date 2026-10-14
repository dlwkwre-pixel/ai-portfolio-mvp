import type { Instrumentation } from "next";

// Server-side errors (page renders, route handlers, server actions, proxy) → app_errors,
// shown at /admin/errors next to browser errors. Node runtime only: the recorder uses the
// Supabase service-role client and node:crypto.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordError } = await import("@/lib/monitoring/record-error");
  const e = err as Error & { digest?: string };
  const ua = request.headers["user-agent"];
  await recordError({
    source: "server",
    message: e?.message ?? String(err),
    stack: e?.stack ?? null,
    path: request.path,
    digest: e?.digest ?? null,
    userAgent: Array.isArray(ua) ? ua[0] : ua ?? null,
    context: { method: request.method, routePath: context.routePath, routeType: context.routeType },
  });
};
