"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const AVATAR_COLORS = [
  { color: "#2563eb", label: "Blue" },
  { color: "#7c3aed", label: "Violet" },
  { color: "#0891b2", label: "Cyan" },
  { color: "#059669", label: "Green" },
  { color: "#d97706", label: "Amber" },
  { color: "#dc2626", label: "Red" },
  { color: "#db2777", label: "Pink" },
  { color: "#6366f1", label: "Indigo" },
];

type ExistingProfile = {
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_color: string | null;
};

export default function ProfileSettingsClient({
  userId, email, existingProfile,
}: {
  userId: string;
  email: string;
  existingProfile: ExistingProfile | null;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [username, setUsername] = useState(existingProfile?.username ?? "");
  const [displayName, setDisplayName] = useState(existingProfile?.display_name ?? "");
  const [bio, setBio] = useState(existingProfile?.bio ?? "");
  const [avatarColor, setAvatarColor] = useState(existingProfile?.avatar_color ?? "#2563eb");
  const [isPublic, setIsPublic] = useState((existingProfile as any)?.is_public ?? true);
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(existingProfile ? true : null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const isNew = !existingProfile;
  const initials = (displayName || username || email)[0]?.toUpperCase() ?? "?";

  // Debounced username check
  useEffect(() => {
    if (!username || username.length < 3) { setAvailable(null); return; }
    if (username === existingProfile?.username) { setAvailable(true); return; }
    const timeout = setTimeout(async () => {
      setChecking(true);
      const { data } = await supabase.from("user_profiles").select("username").eq("username", username).maybeSingle();
      setAvailable(!data);
      setChecking(false);
    }, 500);
    return () => clearTimeout(timeout);
  }, [username]);

  function handleUsernameChange(val: string) {
    const clean = val.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
    setUsername(clean);
    if (clean !== existingProfile?.username) setAvailable(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!available || username.length < 3) return;
    setSaving(true);
    setError("");
    setSuccess(false);

    const profileData = {
      id: userId,
      username,
      display_name: displayName || username,
      bio: bio || null,
      avatar_color: avatarColor,
      is_public: isPublic,
      updated_at: new Date().toISOString(),
    };

    const { error: saveError } = isNew
      ? await supabase.from("user_profiles").insert(profileData)
      : await supabase.from("user_profiles").update(profileData).eq("id", userId);

    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }

    setSuccess(true);
    setSaving(false);
    router.refresh();
  }

  return (
    <div style={{ maxWidth: "560px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
      {isNew && (
        <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "var(--radius-md)", padding: "12px 16px", fontSize: "13px", color: "var(--amber)" }}>
          Set up your profile to appear in the Community and on public strategy pages.
        </div>
      )}

      {/* Avatar preview */}
      <div className="bt-card" style={{ display: "flex", alignItems: "center", gap: "20px" }}>
        <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: avatarColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "26px", fontWeight: 700, color: "#fff", flexShrink: 0, boxShadow: `0 0 24px ${avatarColor}50`, transition: "all 0.2s" }}>
          {initials}
        </div>
        <div>
          <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)", marginBottom: "4px" }}>
            {displayName || username || "Your Name"}
          </p>
          <p style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
            @{username || "username"}
          </p>
        </div>
      </div>

      {/* Color picker */}
      <div className="bt-card">
        <div className="label" style={{ marginBottom: "12px" }}>Avatar Color</div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {AVATAR_COLORS.map(({ color, label }) => (
            <button
              key={color}
              type="button"
              onClick={() => setAvatarColor(color)}
              title={label}
              style={{
                width: "36px", height: "36px", borderRadius: "50%",
                background: color, border: `3px solid ${avatarColor === color ? "#fff" : "transparent"}`,
                cursor: "pointer", transition: "all 0.15s",
                boxShadow: avatarColor === color ? `0 0 0 2px ${color}` : "none",
              }}
            />
          ))}
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div className="bt-card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Username */}
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "6px" }}>
              Username <span style={{ color: "var(--red)" }}>*</span>
            </label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontFamily: "var(--font-mono)", fontSize: "14px", color: "var(--text-tertiary)" }}>@</span>
              <input
                type="text"
                value={username}
                onChange={e => handleUsernameChange(e.target.value)}
                placeholder="your_username"
                required minLength={3} maxLength={20}
                className="bt-input"
                style={{ paddingLeft: "28px" }}
              />
              <div style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "11px" }}>
                {checking && <span style={{ color: "var(--text-muted)" }}>checking...</span>}
                {!checking && username.length >= 3 && available === true && (
                  <span style={{ color: "var(--green)", display: "flex", alignItems: "center", gap: "3px" }}>
                    <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd"/></svg>
                    available
                  </span>
                )}
                {!checking && available === false && <span style={{ color: "var(--red)" }}>taken</span>}
              </div>
            </div>
            <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
              3–20 characters · lowercase, numbers, underscores only · public facing
            </p>
          </div>

          {/* Display name */}
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "6px" }}>
              Display Name <span style={{ color: "var(--text-muted)" }}>(optional)</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your full name or nickname"
              maxLength={50}
              className="bt-input"
            />
          </div>

          {/* Bio */}
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "6px" }}>
              Bio <span style={{ color: "var(--text-muted)" }}>(optional)</span>
            </label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="e.g. Growth investor focused on small-cap breakouts"
              maxLength={160}
              rows={3}
              className="bt-input"
              style={{ resize: "none", lineHeight: 1.6 }}
            />
            <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "3px", textAlign: "right" }}>
              {bio.length}/160
            </p>
          </div>

          {/* Profile visibility */}
          <div>
            <div className="label" style={{ marginBottom: "8px" }}>Profile Visibility</div>
            <div
              onClick={() => setIsPublic(!isPublic)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 14px", borderRadius: "var(--radius-md)", cursor: "pointer",
                background: isPublic ? "rgba(0,211,149,0.06)" : "var(--bg-elevated)",
                border: `1px solid ${isPublic ? "rgba(0,211,149,0.2)" : "var(--border)"}`,
                transition: "var(--transition-base)",
              }}
            >
              <div>
                <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>
                  {isPublic ? "Public profile" : "Private profile"}
                </p>
                <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                  {isPublic ? "Anyone can find you and see your public strategies" : "Only you can see your profile — you won't appear in People search"}
                </p>
              </div>
              {/* Toggle switch */}
              <div style={{
                width: "40px", height: "22px", borderRadius: "11px", flexShrink: 0,
                background: isPublic ? "var(--green)" : "var(--card-border)",
                position: "relative", transition: "background 0.2s",
              }}>
                <div style={{
                  position: "absolute", top: "3px",
                  left: isPublic ? "21px" : "3px",
                  width: "16px", height: "16px", borderRadius: "50%",
                  background: "#fff", transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                }} />
              </div>
            </div>
          </div>

          {/* Email (read only) */}
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "6px" }}>
              Email <span style={{ color: "var(--text-muted)" }}>(login only — never shown publicly)</span>
            </label>
            <input
              type="email"
              value={email}
              disabled
              className="bt-input"
              style={{ opacity: 0.5, cursor: "not-allowed" }}
            />
          </div>
        </div>

        {error && (
          <div style={{ background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: "var(--radius-md)", padding: "10px 14px", fontSize: "13px", color: "var(--red)" }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ background: "var(--green-bg)", border: "1px solid var(--green-border)", borderRadius: "var(--radius-md)", padding: "10px 14px", fontSize: "13px", color: "var(--green)" }}>
            Profile saved! Your public page is at{" "}
            <Link href={`/${username}`} style={{ color: "var(--green)", textDecoration: "underline" }}>
              /@{username}
            </Link>
          </div>
        )}

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="submit"
            disabled={saving || !available || username.length < 3}
            className="bt-btn bt-btn-primary"
            style={{ flex: 1 }}
          >
            {saving ? "Saving..." : isNew ? "Create Profile" : "Save Changes"}
          </button>
          {!isNew && (
            <Link href={`/${existingProfile.username}`} className="bt-btn bt-btn-ghost">
              View Profile →
            </Link>
          )}
        </div>
      </form>
    </div>
  );
}
