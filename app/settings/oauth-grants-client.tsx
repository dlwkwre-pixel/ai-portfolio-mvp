"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { revokeOAuthGrantAction } from "./oauth-grants-actions";
import type { OAuthGrant } from "@/lib/oauth/tokens";

export default function OAuthGrantsClient({ grants }: { grants: OAuthGrant[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function revoke(familyId: string) {
    startTransition(async () => { await revokeOAuthGrantAction(familyId); router.refresh(); });
  }

  if (grants.length === 0) return null;

  return (
    <div style={{ marginTop: "16px" }}>
      <h3 style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "2px" }}>
        Connected via OAuth
      </h3>
      <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "8px" }}>
        Apps like claude.ai&apos;s Connectors that approved access through the sign-in screen, not a pasted token. Revoke here if you don&apos;t recognize the last-used location or device.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {grants.map((g) => (
          <div key={g.familyId} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)" }}>{g.clientName}</div>
              <div style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>
                Connected {new Date(g.connectedAt).toLocaleDateString()}
                {" · "}
                {g.lastUsedAt ? `last used ${new Date(g.lastUsedAt).toLocaleDateString()}${g.lastUsedIp ? ` from ${g.lastUsedIp}` : ""}` : "never used"}
              </div>
            </div>
            <button type="button" onClick={() => revoke(g.familyId)} disabled={pending} style={{ fontSize: "11px", fontWeight: 600, color: "var(--red)", background: "none", border: "none", cursor: pending ? "wait" : "pointer", fontFamily: "var(--font-body)" }}>
              Revoke
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
