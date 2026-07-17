"use client";

import { useState, useTransition } from "react";
import { sendAppNotification } from "./notify-actions";

const input: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", background: "var(--bg-surface, #0a1424)",
  border: "1px solid var(--card-border, rgba(255,255,255,0.1))", borderRadius: "10px",
  padding: "10px 12px", fontSize: "14px", color: "var(--text-primary, #fff)", outline: "none",
};
const label: React.CSSProperties = {
  display: "block", fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em",
  textTransform: "uppercase", color: "var(--text-tertiary, #64748b)", marginBottom: "6px",
};

export default function NotifyForm() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  function send() {
    if (!title.trim() || !body.trim() || isPending) return;
    setError("");
    setSent(false);
    const fd = new FormData();
    fd.set("title", title.trim());
    fd.set("body", body.trim());
    startTransition(async () => {
      const res = await sendAppNotification(fd);
      if (res?.error) setError(res.error);
      else { setSent(true); setTitle(""); setBody(""); }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "560px" }}>
      <div>
        <label style={label}>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="New: 401(k) Planner" style={input} />
        <div style={{ textAlign: "right", fontSize: "10px", color: "var(--text-muted, #475569)", marginTop: "3px" }}>{title.length}/120</div>
      </div>
      <div>
        <label style={label}>Message</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={600} rows={5} placeholder="What's new — keep it short and benefit-focused." style={{ ...input, resize: "vertical", lineHeight: 1.5 }} />
        <div style={{ textAlign: "right", fontSize: "10px", color: "var(--text-muted, #475569)", marginTop: "3px" }}>{body.length}/600</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button
          type="button" onClick={send} disabled={isPending || !title.trim() || !body.trim()}
          style={{
            background: isPending || !title.trim() || !body.trim() ? "var(--bg-surface, #1e293b)" : "linear-gradient(135deg,#2563eb,#4f46e5)",
            color: "#fff", border: "none", borderRadius: "10px", padding: "10px 20px",
            fontSize: "14px", fontWeight: 600, cursor: isPending || !title.trim() || !body.trim() ? "not-allowed" : "pointer",
          }}
        >
          {isPending ? "Sending…" : "Send to all users"}
        </button>
        {sent && <span style={{ fontSize: "13px", color: "var(--green)" }}>Sent — it&apos;s live in everyone&apos;s bell ✓</span>}
        {error && <span style={{ fontSize: "13px", color: "var(--red)" }}>{error}</span>}
      </div>

      <p style={{ fontSize: "12px", color: "var(--text-tertiary, #64748b)", lineHeight: 1.6, marginTop: "4px" }}>
        This posts to the in-app notification bell for every user. It can&apos;t be unsent, so double-check the wording first.
      </p>
    </div>
  );
}
