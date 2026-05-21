"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  publishPortfolio,
  unpublishPortfolio,
  syncPublicAllocation,
  updatePublicPortfolioMeta,
} from "@/app/community/portfolio-actions";

type PublicPortfolioState = {
  id: string;
  public_name: string;
  public_description: string | null;
  follower_count: number;
  copy_count: number;
  last_synced_at: string | null;
} | null;

export default function PortfolioShareSection({
  portfolioId,
  publicPortfolio: serverPublicPortfolio,
}: {
  portfolioId: string;
  publicPortfolio: PublicPortfolioState;
}) {
  const router = useRouter();
  const [publicPortfolio, setPublicPortfolio] = useState(serverPublicPortfolio);
  const [expanded, setExpanded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Sync state when server re-renders with updated data (e.g. after publish)
  useEffect(() => {
    setPublicPortfolio(serverPublicPortfolio);
  }, [serverPublicPortfolio?.id, serverPublicPortfolio?.last_synced_at]);

  // Publish form state
  const [pubName, setPubName] = useState("");
  const [pubDesc, setPubDesc] = useState("");

  // Edit form state
  const [editName, setEditName] = useState(serverPublicPortfolio?.public_name ?? "");
  const [editDesc, setEditDesc] = useState(serverPublicPortfolio?.public_description ?? "");

  function handlePublish() {
    if (!pubName.trim()) { setError("Name is required."); return; }
    setError(null);
    const fd = new FormData();
    fd.set("portfolio_id", portfolioId);
    fd.set("public_name", pubName.trim());
    fd.set("public_description", pubDesc.trim());
    startTransition(async () => {
      try {
        await publishPortfolio(fd);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to publish.");
      }
    });
  }

  function handleUnpublish() {
    setError(null);
    startTransition(async () => {
      try {
        await unpublishPortfolio(portfolioId);
        setPublicPortfolio(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to unpublish.");
      }
    });
  }

  function handleSync() {
    setError(null);
    startTransition(async () => {
      try {
        await syncPublicAllocation(portfolioId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to sync.");
      }
    });
  }

  function handleEditSave() {
    if (!editName.trim()) { setError("Name is required."); return; }
    setError(null);
    const fd = new FormData();
    fd.set("portfolio_id", portfolioId);
    fd.set("public_name", editName.trim());
    fd.set("public_description", editDesc.trim());
    startTransition(async () => {
      try {
        await updatePublicPortfolioMeta(fd);
        setEditMode(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save.");
      }
    });
  }

  const [shareCopied, setShareCopied] = useState(false);
  const copyShareLink = useCallback(() => {
    if (!publicPortfolio) return;
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const url = `${origin}/share/portfolio/${publicPortfolio.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    });
  }, [publicPortfolio]);

  const relativeSync = (() => {
    if (!publicPortfolio?.last_synced_at) return null;
    const diff = Date.now() - new Date(publicPortfolio.last_synced_at).getTime();
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (h < 1) return "just now";
    if (h < 24) return `${h}h ago`;
    if (d < 7) return `${d}d ago`;
    return new Date(publicPortfolio.last_synced_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  })();

  return (
    <div style={{
      background: "var(--card-bg)", border: "1px solid var(--card-border)",
      borderRadius: "var(--radius-lg)", padding: "14px 16px",
    }}>
      {/* Section header */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "none", border: "none", padding: 0, cursor: "pointer",
          fontFamily: "var(--font-body)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke={publicPortfolio ? "#34d399" : "var(--text-muted)"} strokeWidth="1.5">
            <path d="M15 8a3 3 0 10-5.977-.75l-4.477 2.24a3 3 0 100 4.02l4.477 2.24A3 3 0 1015 12a2.97 2.97 0 00-.23-1.15l.45-.22A3 3 0 0015 8z" />
          </svg>
          <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>
            Community Sharing
          </span>
          {publicPortfolio && (
            <span style={{
              fontSize: "9px", fontWeight: 600, letterSpacing: "0.06em",
              textTransform: "uppercase", padding: "1px 7px",
              borderRadius: "var(--radius-full)",
              background: "rgba(0,211,149,0.1)", border: "1px solid rgba(0,211,149,0.2)",
              color: "var(--green)",
            }}>
              Live
            </span>
          )}
        </div>
        <svg
          width="14" height="14" viewBox="0 0 20 20" fill="currentColor"
          style={{
            color: "var(--text-muted)",
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 200ms ease",
          }}
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {expanded && (
        <div style={{ marginTop: "14px", borderTop: "1px solid var(--border-subtle)", paddingTop: "14px" }}>
          {error && (
            <p style={{
              fontSize: "11px", color: "var(--red)",
              background: "var(--red-bg)", border: "1px solid var(--red-border)",
              borderRadius: "var(--radius-sm)", padding: "7px 10px", marginBottom: "12px",
            }}>
              {error}
            </p>
          )}

          {/* ── Not published ── */}
          {!publicPortfolio ? (
            <div>
              <p style={{ fontSize: "12px", color: "var(--text-tertiary)", lineHeight: 1.55, marginBottom: "14px" }}>
                Share this portfolio with the community. Only allocation percentages are visible — no share counts, prices, or account values.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: "5px" }}>
                    Public name <span style={{ color: "var(--red)" }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={pubName}
                    onChange={(e) => setPubName(e.target.value)}
                    maxLength={100}
                    placeholder="e.g. Balanced Growth Portfolio"
                    style={{
                      width: "100%", padding: "8px 11px",
                      background: "var(--bg-elevated)", border: "1px solid var(--card-border)",
                      borderRadius: "var(--radius-md)", color: "var(--text-primary)",
                      fontSize: "12px", fontFamily: "var(--font-body)", outline: "none",
                      boxSizing: "border-box",
                      transition: "border-color 150ms ease",
                    }}
                    onFocus={(e) => { e.target.style.borderColor = "var(--brand-blue)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "var(--card-border)"; }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: "5px" }}>
                    Description <span style={{ color: "var(--text-muted)" }}>(optional)</span>
                  </label>
                  <textarea
                    value={pubDesc}
                    onChange={(e) => setPubDesc(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    placeholder="Describe your investment approach..."
                    style={{
                      width: "100%", padding: "8px 11px",
                      background: "var(--bg-elevated)", border: "1px solid var(--card-border)",
                      borderRadius: "var(--radius-md)", color: "var(--text-primary)",
                      fontSize: "12px", fontFamily: "var(--font-body)", outline: "none",
                      resize: "vertical", boxSizing: "border-box",
                      transition: "border-color 150ms ease",
                    }}
                    onFocus={(e) => { e.target.style.borderColor = "var(--brand-blue)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "var(--card-border)"; }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={isPending || !pubName.trim()}
                  style={{
                    padding: "8px 18px", borderRadius: "var(--radius-md)",
                    fontSize: "12px", fontWeight: 600, fontFamily: "var(--font-body)",
                    background: "var(--brand-gradient)", border: "none", color: "#fff",
                    cursor: isPending || !pubName.trim() ? "not-allowed" : "pointer",
                    opacity: isPending || !pubName.trim() ? 0.55 : 1,
                    alignSelf: "flex-start",
                    transition: "opacity 150ms ease",
                  }}
                >
                  {isPending ? "Publishing..." : "Publish to Community"}
                </button>
              </div>
            </div>
          ) : (
            /* ── Published ── */
            <div>
              {editMode ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "12px" }}>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={100}
                    style={{
                      width: "100%", padding: "8px 11px",
                      background: "var(--bg-elevated)", border: "1px solid var(--card-border)",
                      borderRadius: "var(--radius-md)", color: "var(--text-primary)",
                      fontSize: "12px", fontFamily: "var(--font-body)", outline: "none",
                      boxSizing: "border-box",
                      transition: "border-color 150ms ease",
                    }}
                    onFocus={(e) => { e.target.style.borderColor = "var(--brand-blue)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "var(--card-border)"; }}
                  />
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    style={{
                      width: "100%", padding: "8px 11px",
                      background: "var(--bg-elevated)", border: "1px solid var(--card-border)",
                      borderRadius: "var(--radius-md)", color: "var(--text-primary)",
                      fontSize: "12px", fontFamily: "var(--font-body)", outline: "none",
                      resize: "vertical", boxSizing: "border-box",
                      transition: "border-color 150ms ease",
                    }}
                    onFocus={(e) => { e.target.style.borderColor = "var(--brand-blue)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "var(--card-border)"; }}
                  />
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={handleEditSave}
                      disabled={isPending}
                      style={{
                        padding: "6px 14px", borderRadius: "var(--radius-md)",
                        fontSize: "12px", fontWeight: 600, fontFamily: "var(--font-body)",
                        background: "var(--brand-gradient)", border: "none", color: "#fff",
                        cursor: isPending ? "not-allowed" : "pointer",
                        opacity: isPending ? 0.6 : 1,
                        transition: "opacity 150ms ease",
                      }}
                    >
                      {isPending ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditMode(false)}
                      style={{
                        padding: "6px 12px", borderRadius: "var(--radius-md)",
                        fontSize: "12px", fontFamily: "var(--font-body)",
                        background: "none", border: "1px solid var(--card-border)",
                        color: "var(--text-muted)", cursor: "pointer",
                        transition: "color 150ms ease, border-color 150ms ease",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* Published summary */
                <div style={{
                  background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)", padding: "10px 12px", marginBottom: "12px",
                }}>
                  <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "3px" }}>
                    {publicPortfolio.public_name}
                  </p>
                  <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      {publicPortfolio.follower_count} follower{publicPortfolio.follower_count !== 1 ? "s" : ""}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      {publicPortfolio.copy_count} cop{publicPortfolio.copy_count !== 1 ? "ies" : "y"}
                    </span>
                    {relativeSync && (
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        synced {relativeSync}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              {!editMode && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
                  <Link
                    href={`/community/portfolios/${publicPortfolio.id}`}
                    style={{
                      display: "flex", alignItems: "center", gap: "4px",
                      padding: "6px 12px", borderRadius: "var(--radius-md)",
                      fontSize: "11px", fontWeight: 500, textDecoration: "none",
                      background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)",
                      color: "#93c5fd", fontFamily: "var(--font-body)",
                      transition: "background 150ms ease",
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                      <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                    </svg>
                    View Public Page
                  </Link>

                  <button
                    type="button"
                    onClick={copyShareLink}
                    style={{
                      display: "flex", alignItems: "center", gap: "4px",
                      padding: "6px 12px", borderRadius: "var(--radius-md)",
                      fontSize: "11px", fontWeight: 500, fontFamily: "var(--font-body)",
                      background: shareCopied ? "rgba(74,222,128,0.08)" : "rgba(37,99,235,0.08)",
                      border: `1px solid ${shareCopied ? "rgba(74,222,128,0.2)" : "rgba(37,99,235,0.2)"}`,
                      color: shareCopied ? "#4ade80" : "#93c5fd",
                      cursor: "pointer", transition: "all 150ms ease",
                    }}
                  >
                    {shareCopied ? (
                      <><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M2 8l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> Copied!</>
                    ) : (
                      <><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M6 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1v-3M9 1h6v6M15 1L8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg> Share Card</>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleSync}
                    disabled={isPending}
                    style={{
                      display: "flex", alignItems: "center", gap: "4px",
                      padding: "6px 12px", borderRadius: "var(--radius-md)",
                      fontSize: "11px", fontWeight: 500, fontFamily: "var(--font-body)",
                      background: "none", border: "1px solid var(--card-border)",
                      color: "var(--text-secondary)", cursor: isPending ? "not-allowed" : "pointer",
                      opacity: isPending ? 0.6 : 1,
                      transition: "color 150ms ease, border-color 150ms ease, opacity 150ms ease",
                    }}
                    onMouseEnter={(e) => { if (!isPending) { e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; e.currentTarget.style.color = "var(--text-primary)"; } }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--card-border)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                  >
                    <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {isPending ? "Syncing..." : "Sync Allocation"}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setEditName(publicPortfolio.public_name); setEditDesc(publicPortfolio.public_description ?? ""); setEditMode(true); }}
                    style={{
                      padding: "6px 12px", borderRadius: "var(--radius-md)",
                      fontSize: "11px", fontWeight: 500, fontFamily: "var(--font-body)",
                      background: "none", border: "1px solid var(--card-border)",
                      color: "var(--text-secondary)", cursor: "pointer",
                      transition: "color 150ms ease, border-color 150ms ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--card-border)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                  >
                    Edit Details
                  </button>

                  <button
                    type="button"
                    onClick={handleUnpublish}
                    disabled={isPending}
                    style={{
                      padding: "6px 12px", borderRadius: "var(--radius-md)",
                      fontSize: "11px", fontWeight: 500, fontFamily: "var(--font-body)",
                      background: "none", border: "1px solid var(--card-border)",
                      color: "var(--text-tertiary)", cursor: isPending ? "not-allowed" : "pointer",
                      opacity: isPending ? 0.6 : 1,
                      transition: "color 150ms ease, border-color 150ms ease, opacity 150ms ease",
                    }}
                    onMouseEnter={(e) => { if (!isPending) { e.currentTarget.style.borderColor = "var(--red-border)"; e.currentTarget.style.color = "var(--red)"; } }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--card-border)"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
                  >
                    Unpublish
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
