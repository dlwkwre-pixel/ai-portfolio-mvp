"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { followPublicPortfolio, copyPublicAllocation } from "../../portfolio-actions";

export default function PublicPortfolioActions({
  portfolioId,
  isOwn,
  isFollowing: initialIsFollowing,
  followerCount: initialFollowerCount,
}: {
  portfolioId: string;
  isOwn: boolean;
  isFollowing: boolean;
  followerCount: number;
}) {
  const router = useRouter();
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();

  function handleFollow() {
    setIsFollowing((prev) => !prev);
    setFollowerCount((prev) => (isFollowing ? prev - 1 : prev + 1));
    startTransition(() => followPublicPortfolio(portfolioId));
  }

  async function handleCopy() {
    if (copying || copied) return;
    setCopying(true);
    try {
      const result = await copyPublicAllocation(portfolioId);
      setCopied(true);
      setTimeout(() => router.push(`/portfolios/${result.id}`), 800);
    } finally {
      setCopying(false);
    }
  }

  if (isOwn) return null;

  return (
    <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
      <button
        type="button"
        onClick={handleFollow}
        style={{
          padding: "7px 16px", borderRadius: "var(--radius-full)",
          fontSize: "12px", fontWeight: 500, fontFamily: "var(--font-body)",
          background: isFollowing ? "transparent" : "rgba(37,99,235,0.1)",
          border: `1px solid ${isFollowing ? "var(--card-border)" : "rgba(37,99,235,0.3)"}`,
          color: isFollowing ? "var(--text-tertiary)" : "#93c5fd",
          cursor: "pointer",
          transition: "color 150ms ease, background 150ms ease, border-color 150ms ease",
        }}
        onPointerDown={(e) => { e.currentTarget.style.transform = "scale(0.96)"; }}
        onPointerUp={(e) => { e.currentTarget.style.transform = ""; }}
        onPointerCancel={(e) => { e.currentTarget.style.transform = ""; }}
      >
        {isFollowing ? `Following (${followerCount})` : `Follow (${followerCount})`}
      </button>

      <button
        type="button"
        onClick={handleCopy}
        disabled={copying || copied}
        style={{
          padding: "7px 16px", borderRadius: "var(--radius-md)",
          fontSize: "12px", fontWeight: 600, fontFamily: "var(--font-body)",
          background: copied ? "rgba(0,211,149,0.1)" : "var(--brand-gradient)",
          border: copied ? "1px solid rgba(0,211,149,0.3)" : "none",
          color: copied ? "var(--green)" : "#fff",
          cursor: copying || copied ? "not-allowed" : "pointer",
          opacity: copying ? 0.7 : 1,
          transition: "opacity 150ms ease",
        }}
        onPointerDown={(e) => { if (!copying && !copied) e.currentTarget.style.opacity = "0.85"; }}
        onPointerUp={(e) => { e.currentTarget.style.opacity = "1"; }}
        onPointerCancel={(e) => { e.currentTarget.style.opacity = "1"; }}
      >
        {copied ? "Copied!" : copying ? "Copying..." : "Copy Allocation"}
      </button>
    </div>
  );
}
