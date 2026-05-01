"use client";

import { useState, useEffect } from "react";

type NewsItem = {
  id: number; headline: string; source: string; url: string; datetime: number;
};

function timeAgo(unix: number) {
  if (!unix) return "";
  const diff = Date.now() / 1000 - unix;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NewsSidebar() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/research/news")
      .then((r) => r.json())
      .then((d) => setNews(d.news ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
      <div style={{
        padding: "12px 14px", flexShrink: 0,
        borderBottom: "1px solid var(--border-subtle)",
        background: "linear-gradient(135deg, rgba(37,99,235,0.06), rgba(124,58,237,0.03))",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
          Market News
        </div>
        {!loading && news.length > 0 && (
          <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{news.length} stories</span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading ? (
          <div style={{ padding: "16px", fontSize: "12px", color: "var(--text-muted)" }}>Loading...</div>
        ) : news.length === 0 ? (
          <div style={{ padding: "16px", fontSize: "12px", color: "var(--text-muted)" }}>No news available.</div>
        ) : (
          news.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block", padding: "11px 14px",
                borderBottom: "1px solid var(--border-subtle)",
                textDecoration: "none", transition: "background 0.12s",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--card-hover)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
            >
              <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.4, marginBottom: "5px" }}>
                {item.headline}
              </div>
              <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                <span style={{
                  padding: "1px 5px", borderRadius: "3px",
                  background: "var(--bg-surface)", color: "var(--text-tertiary)",
                  fontSize: "9px", fontWeight: 600,
                  textTransform: "uppercase", letterSpacing: "0.04em",
                }}>
                  {item.source}
                </span>
                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>·</span>
                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{timeAgo(item.datetime)}</span>
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
