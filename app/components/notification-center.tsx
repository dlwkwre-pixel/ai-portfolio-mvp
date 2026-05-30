"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type Notification = {
  id: string;
  title: string;
  body: string;
  created_at: string;
};

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoaded(true); return; }
      setUserId(user.id);

      const [{ data: notifs }, { data: reads }] = await Promise.all([
        supabase
          .from("app_notifications")
          .select("id, title, body, created_at")
          .or(`target_user_id.is.null,target_user_id.eq.${user.id}`)
          .order("created_at", { ascending: false }),
        supabase
          .from("user_notification_reads")
          .select("notification_id")
          .eq("user_id", user.id),
      ]);

      setNotifications(notifs ?? []);
      setReadIds(new Set((reads ?? []).map((r) => r.notification_id)));
      setLoaded(true);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleToggle() {
    const opening = !open;
    setOpen(opening);

    if (opening && userId && unreadCount > 0) {
      const unread = notifications.filter((n) => !readIds.has(n.id));
      await supabase.from("user_notification_reads").insert(
        unread.map((n) => ({ user_id: userId, notification_id: n.id }))
      );
      setReadIds((prev) => {
        const next = new Set(prev);
        unread.forEach((n) => next.add(n.id));
        return next;
      });
    }
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  if (!loaded) return null;

  return (
    <div ref={dropdownRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={handleToggle}
        aria-label="Notifications"
        style={{
          position: "relative",
          width: "32px",
          height: "32px",
          borderRadius: "8px",
          border: "1px solid var(--card-border)",
          background: open ? "rgba(255,255,255,0.06)" : "var(--card-bg)",
          color: "var(--text-secondary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          transition: "var(--transition-fast)",
          flexShrink: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: "absolute",
            top: "-3px",
            right: "-3px",
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "#ef4444",
            border: "1.5px solid var(--bg-base)",
            display: "block",
          }} />
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          width: "300px",
          background: "var(--sidebar-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: "12px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
          zIndex: 200,
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <span style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--text-primary)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}>
              What&apos;s New
            </span>
            {unreadCount === 0 && notifications.length > 0 && (
              <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>All caught up</span>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: "380px", overflowY: "auto" }}>
            {notifications.length === 0 ? (
              <div style={{ padding: "24px 16px", textAlign: "center" }}>
                <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>No updates yet.</p>
              </div>
            ) : (
              notifications.map((n) => {
                const isRead = readIds.has(n.id);
                return (
                  <div
                    key={n.id}
                    style={{
                      padding: "11px 14px",
                      borderBottom: "1px solid var(--border-subtle)",
                      background: isRead ? "transparent" : "rgba(37,99,235,0.06)",
                      display: "flex",
                      gap: "10px",
                      alignItems: "flex-start",
                    }}
                  >
                    {/* Unread dot */}
                    <div style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: isRead ? "transparent" : "#3b82f6",
                      marginTop: "5px",
                      flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        marginBottom: "3px",
                      }}>
                        {n.title}
                      </p>
                      <p style={{
                        fontSize: "11px",
                        color: "var(--text-secondary)",
                        lineHeight: "1.55",
                      }}>
                        {n.body}
                      </p>
                      <p style={{
                        fontSize: "10px",
                        color: "var(--text-muted)",
                        marginTop: "5px",
                        fontFamily: "var(--font-mono)",
                      }}>
                        {formatDate(n.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
