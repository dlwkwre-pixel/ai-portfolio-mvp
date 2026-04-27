"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function UsernameSetupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Check if user already has a profile
  useEffect(() => {
    async function checkProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: profile } = await supabase
        .from("user_profiles").select("username").eq("id", user.id).maybeSingle();
      if (profile?.username) router.push("/dashboard");
      // Pre-fill display name from auth metadata
      const name = user.user_metadata?.full_name || "";
      if (name) setDisplayName(name);
    }
    checkProfile();
  }, []);

  // Debounced username availability check
  useEffect(() => {
    if (!username || username.length < 3) { setAvailable(null); return; }
    const timeout = setTimeout(async () => {
      setChecking(true);
      const { data } = await supabase
        .from("user_profiles").select("username").eq("username", username).maybeSingle();
      setAvailable(!data);
      setChecking(false);
    }, 500);
    return () => clearTimeout(timeout);
  }, [username]);

  function handleUsernameChange(val: string) {
    const clean = val.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
    setUsername(clean);
    setAvailable(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!available) return;
    setLoading(true);
    setError("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { error } = await supabase.from("user_profiles").insert({
      id: user.id,
      username,
      display_name: displayName || username,
      bio: bio || null,
      avatar_color: randomColor(),
    });

    if (error) { setError(error.message); setLoading(false); return; }
    router.push("/dashboard");
    router.refresh();
  }

  function randomColor() {
    const colors = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626"];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  const isValid = username.length >= 3 && available === true;

  return (
    <main style={{ minHeight: "100vh", background: "#07090f", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .fu0 { animation: fadeUp 0.5s ease both; }
        .fu1 { animation: fadeUp 0.5s 0.08s ease both; }
        .fu2 { animation: fadeUp 0.5s 0.16s ease both; }
        .fu3 { animation: fadeUp 0.5s 0.24s ease both; }
        .fu4 { animation: fadeUp 0.5s 0.32s ease both; }
        .ifield { width: 100%; padding: 12px 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; color: #e2e8f0; font-size: 14px; font-family: 'DM Sans', sans-serif; outline: none; transition: all 0.15s; }
        .ifield:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }
        .ifield::placeholder { color: #334155; }
        .ifield.valid { border-color: rgba(0,211,149,0.4); }
        .ifield.invalid { border-color: rgba(255,92,92,0.4); }
        .sbtn { width: 100%; padding: 13px; background: linear-gradient(135deg, #2563eb, #7c3aed); border: none; border-radius: 10px; color: #fff; font-size: 14px; font-weight: 600; font-family: 'DM Sans', sans-serif; cursor: pointer; box-shadow: 0 4px 20px rgba(37,99,235,0.35); transition: all 0.2s; }
        .sbtn:hover:not(:disabled) { box-shadow: 0 6px 28px rgba(37,99,235,0.5); transform: translateY(-1px); }
        .sbtn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
      `}</style>

      <div style={{ width: "100%", maxWidth: "440px" }}>
        {/* Logo */}
        <div className="fu0" style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "40px", justifyContent: "center" }}>
          <div style={{ width: "32px", height: "32px", background: "linear-gradient(135deg, #2563eb, #7c3aed)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="2 4 20 16" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M4 16c2.5-3 4.5-4 7-4 2 0 3.5 1 5 3 1.5-4 3-7 4-8" />
            </svg>
          </div>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "16px", color: "#fff" }}>
            Buy<span style={{ color: "#7c3aed" }}>Tune</span>.io
          </span>
        </div>

        <div className="fu1" style={{ marginBottom: "32px", textAlign: "center" }}>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: "26px", fontWeight: 700, color: "#fff", letterSpacing: "-0.5px", marginBottom: "8px" }}>
            Pick your username
          </h1>
          <p style={{ fontSize: "14px", color: "#64748b", lineHeight: 1.6 }}>
            This is how you'll appear publicly in the BuyTune community.<br />Your email stays private.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Username field */}
          <div className="fu2">
            <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "#64748b", marginBottom: "6px" }}>
              Username
            </label>
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", fontFamily: "'DM Mono', monospace", fontSize: "14px", color: "#475569", pointerEvents: "none" }}>
                @
              </div>
              <input
                type="text"
                value={username}
                onChange={e => handleUsernameChange(e.target.value)}
                placeholder="your_username"
                required
                minLength={3}
                maxLength={20}
                className={`ifield ${username.length >= 3 ? (available === true ? "valid" : available === false ? "invalid" : "") : ""}`}
                style={{ paddingLeft: "28px" }}
              />
              {/* Status indicator */}
              <div style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)" }}>
                {checking && <span style={{ fontSize: "11px", color: "#475569" }}>checking...</span>}
                {!checking && available === true && (
                  <span style={{ fontSize: "11px", color: "#00d395", display: "flex", alignItems: "center", gap: "4px" }}>
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd"/></svg>
                    available
                  </span>
                )}
                {!checking && available === false && (
                  <span style={{ fontSize: "11px", color: "#ff5c5c" }}>taken</span>
                )}
              </div>
            </div>
            <p style={{ fontSize: "11px", color: "#334155", marginTop: "5px" }}>
              3–20 characters · lowercase letters, numbers, underscores only
            </p>
          </div>

          {/* Display name */}
          <div className="fu3">
            <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "#64748b", marginBottom: "6px" }}>
              Display name <span style={{ color: "#334155" }}>(optional)</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your Name"
              maxLength={50}
              className="ifield"
            />
          </div>

          {/* Bio */}
          <div className="fu3">
            <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "#64748b", marginBottom: "6px" }}>
              Bio <span style={{ color: "#334155" }}>(optional)</span>
            </label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="e.g. Growth investor focused on small-cap breakouts"
              maxLength={160}
              rows={2}
              className="ifield"
              style={{ resize: "none", lineHeight: 1.5 }}
            />
            <p style={{ fontSize: "11px", color: "#334155", marginTop: "4px", textAlign: "right" }}>
              {bio.length}/160
            </p>
          </div>

          {error && (
            <div style={{ background: "rgba(255,92,92,0.08)", border: "1px solid rgba(255,92,92,0.2)", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", color: "#ff5c5c" }}>
              {error}
            </div>
          )}

          <div className="fu4">
            <button type="submit" disabled={!isValid || loading} className="sbtn">
              {loading ? "Setting up..." : "Continue to BuyTune →"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
