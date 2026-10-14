"use client";

import { useEffect } from "react";

// Sends uncaught browser errors to /api/client-errors so they show up at /admin/errors.
// Each distinct message is reported once per page session, at most 8 per session, so a
// render loop can't flood the table.

const sent = new Set<string>();
const MAX_PER_SESSION = 8;

export function reportClientError(err: unknown, kind: string, digest?: string): void {
  try {
    const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : JSON.stringify(err) ?? "Unknown error");
    const key = `${kind}|${e.message}`;
    if (sent.has(key) || sent.size >= MAX_PER_SESSION) return;
    sent.add(key);
    const payload = JSON.stringify({
      message: `${e.name && e.name !== "Error" ? `${e.name}: ` : ""}${e.message}`,
      stack: e.stack ?? null,
      path: window.location.pathname + window.location.search,
      digest: digest ?? (e as Error & { digest?: string }).digest ?? null,
      kind,
    });
    const blob = new Blob([payload], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/client-errors", blob)) {
      void fetch("/api/client-errors", { method: "POST", body: payload, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
    }
  } catch {
    // reporting must never throw
  }
}

export default function ErrorReporter() {
  useEffect(() => {
    const onError = (ev: ErrorEvent) => reportClientError(ev.error ?? ev.message, "error");
    const onRejection = (ev: PromiseRejectionEvent) => reportClientError(ev.reason, "unhandledrejection");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
