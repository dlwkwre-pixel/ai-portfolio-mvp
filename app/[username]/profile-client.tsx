"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { likeStrategy, saveStrategy, followUser } from "@/app/community/social-actions";

type Profile = {
  id: string; username: string; display_name: string | null;
  bio: string | null; avatar_color: string; created_at: string;
};

type StrategyRow = {
  id: string; name: string; description: string | null;
  style: string | null; risk_level: string | null;
  likes_count: number; copies_count: number;
  created_at: string; is_public: boolean;
  is_liked: boolean; is_saved: boolean; is_own: boolean;
};

function riskColor(r: string | null) {
  if (!r) return { bg: "var(--card-bg)", border: "var(--card-border)", color: "var(--text-tertiary)" };
  const l = r.toLowerCase();
  if (["low","conservative"].includes(l)) return { bg: "var(--green-bg)", border: "var(--green-border)", color: "var(--green)" };
  if (["high","aggressive"].includes(l)) return { bg: "var(--red-bg)", border: "var(--red-border)", color: "var(--red)" };
  return { bg: "var(--amber-bg)", border: "var(--amber-border)", color: "var(--amber)" };
}

export default function ProfileClient({
  profile, strategies: initialStrategies,
  followersCount: initFollowers, followingCount,
  isFollowing: initFollowing, isOwnProfile, isLoggedIn,
}: {
  profile: Profile;
  strategies: StrategyRow[];
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
  isOwnProfile: boolean;
  isLoggedIn: boolean;
}) {
  const [strategies, setStrategies] = useState(initialStrategies);
  const [following, setFollowing] = useState(initFollowing);
  const [followers, setFollowers] = useState(initFollowers);
  const [isPending, startTransition] = useTransition();

  const initials = (profile.display_name || profile.username)[0]?.toUpperCase();

  function handleFollow() {
    setFollowing(f => !f);
    setFollowers(n => following ? n - 1 : n + 1);
    startTransition(() => followUser(profile.id));
  }

  function handleLike(id: string) {
    setStrategies(prev => prev.map(s => s.id === id ? {
      ...s, is_liked: !s.is_liked,
      likes_count: s.is_liked ? s.likes_count - 1 : s.likes_count + 1,
    } : s));
    startTransition(() => likeStrategy(id));
  }

  function handleSave(id: string) {
    setStrategies(prev => prev.map(s => s.id === id ? { ...s, is_saved: !s.is_saved } : s));
    startTransition(() => saveStrategy(id));
  }

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Profile card */}
      <div className="bt-card animate-fade-up">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            {/* Avatar */}
            <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: profile.avatar_color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", fontWeight: 700, color: "#fff", flexShrink: 0, boxShadow: `0 0 20px ${profile.avatar_color}40` }}>
              {initials}
            </div>
            <div>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>
                {profile.display_name || profile.username}
              </h1>
              <p style={{ fontSize: "13px", color: "var(--text-tertiary)", marginTop: "1px" }}>@{profile.username}</p>
              {profile.bio && (
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "8px", lineHeight: 1.6, maxWidth: "400px" }}>
                  {profile.bio}
                </p>
              )}
            </div>
          </div>

          {/* Follow / Edit button */}
          {isOwnProfile ? (
            <Link href="/settings/profile" className="bt-btn bt-btn-ghost bt-btn-sm">
              Edit profile
            </Link>
          ) : isLoggedIn ? (
            <button
              type="button"
              onClick={handleFollow}
              disabled={isPending}
              className={`bt-btn bt-btn-sm ${following ? "bt-btn-ghost" : "bt-btn-primary"}`}
            >
              {following ? "Following" : "Follow"}
            </button>
          ) : null}
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: "20px", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--border-subtle)" }}>
          {[
            { label: "Strategies", value: strategies.length },
            { label: "Followers", value: followers },
            { label: "Following", value: followingCount },
          ].map(stat => (
            <div key={stat.label}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 500, color: "var(--text-primary)" }}>{stat.value}</span>
              <span style={{ fontSize: "12px", color: "var(--text-tertiary)", marginLeft: "5px" }}>{stat.label}</span>
            </div>
          ))}
          <div style={{ marginLeft: "auto" }}>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              Joined {new Date(profile.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </span>
          </div>
        </div>
      </div>

      {/* Strategies */}
      <div>
        <h2 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "10px" }}>
          {isOwnProfile ? "Your strategies" : "Public strategies"}
        </h2>

        {strategies.length > 0 ? (
          <div className="bt-list-animate" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {strategies.map(s => {
              const rs = riskColor(s.risk_level);
              return (
                <div key={s.id} className="bt-card bt-lift" style={{ position: "relative" }}>
                  {!s.is_public && isOwnProfile && (
                    <div style={{ position: "absolute", top: "12px", right: "12px" }}>
                      <span style={{ fontSize: "9px", background: "var(--card-bg)", border: "1px solid var(--card-border)", color: "var(--text-muted)", padding: "2px 7px", borderRadius: "var(--radius-full)" }}>Private</span>
                    </div>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "7px", marginBottom: "6px" }}>
                    <h3 style={{ fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>{s.name}</h3>
                    {s.risk_level && (
                      <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "2px 7px", borderRadius: "var(--radius-full)", background: rs.bg, border: `1px solid ${rs.border}`, color: rs.color }}>
                        {s.risk_level}
                      </span>
                    )}
                    {s.style && (
                      <span style={{ fontSize: "9px", color: "var(--text-muted)", background: "var(--card-bg)", border: "1px solid var(--card-border)", padding: "2px 7px", borderRadius: "var(--radius-full)" }}>
                        {s.style}
                      </span>
                    )}
                  </div>
                  {s.description && (
                    <p style={{ fontSize: "12px", color: "var(--text-tertiary)", lineHeight: 1.6, marginBottom: "10px" }}>{s.description}</p>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    {/* Like */}
                    {isLoggedIn && !s.is_own && (
                      <button type="button" onClick={() => handleLike(s.id)} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 8px", borderRadius: "var(--radius-md)", fontSize: "12px", background: s.is_liked ? "rgba(255,92,92,0.08)" : "none", border: `1px solid ${s.is_liked ? "rgba(255,92,92,0.2)" : "transparent"}`, color: s.is_liked ? "#ff5c5c" : "var(--text-tertiary)", cursor: "pointer", fontFamily: "var(--font-body)" }}>
                        <svg width="12" height="12" viewBox="0 0 20 20" fill={s.is_liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
                          <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"/>
                        </svg>
                        {s.likes_count}
                      </button>
                    )}
                    {/* Save */}
                    {isLoggedIn && !s.is_own && (
                      <button type="button" onClick={() => handleSave(s.id)} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 8px", borderRadius: "var(--radius-md)", fontSize: "12px", background: s.is_saved ? "rgba(37,99,235,0.1)" : "none", border: `1px solid ${s.is_saved ? "rgba(37,99,235,0.2)" : "transparent"}`, color: s.is_saved ? "#93c5fd" : "var(--text-tertiary)", cursor: "pointer", fontFamily: "var(--font-body)" }}>
                        <svg width="12" height="12" viewBox="0 0 20 20" fill={s.is_saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
                          <path d="M5 3a2 2 0 00-2 2v12l7-3 7 3V5a2 2 0 00-2-2H5z"/>
                        </svg>
                        {s.is_saved ? "Saved" : "Save"}
                      </button>
                    )}
                    <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--text-muted)" }}>
                      {s.copies_count} {s.copies_count === 1 ? "copy" : "copies"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bt-card" style={{ padding: "32px", textAlign: "center" }}>
            <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
              {isOwnProfile ? "No public strategies yet. Go to Strategies and toggle one public." : "No public strategies yet."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
