"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStrategy } from "./actions";

type Message = {
  role: "assistant" | "user";
  content: string;
};

type GeneratedStrategy = {
  name: string;
  style: string;
  risk_level: string;
  turnover_preference: string;
  holding_period_bias: string;
  max_position_pct: number | null;
  min_position_pct: number | null;
  cash_min_pct: number | null;
  cash_max_pct: number | null;
  description: string;
  prompt_text: string;
};

const STRATEGY_STYLES = [
  "Growth", "Value", "Blend", "Dividend / Income", "Quality",
  "Index / Passive", "Sector / Thematic", "Momentum", "Swing",
  "Mean Reversion", "Defensive", "Balanced", "Speculative", "Custom",
];
const RISK_LEVELS = ["Conservative", "Moderate", "Aggressive"];
const TURNOVER_PREFERENCES = ["Low", "Moderate", "High"];
const HOLDING_PERIOD_BIASES = [
  "Short-term", "Swing", "Medium-term", "Long-term", "Very Long-term", "Flexible",
];

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
const selectClass =
  "w-full rounded-xl border border-white/10 bg-[#040d1a] px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
const labelClass =
  "mb-1.5 block text-xs font-medium uppercase tracking-widest text-slate-500";

function renderMessageContent(content: string) {
  return content.split("\n").map((line, i) => {
    const parts = line.split(/\*\*(.*?)\*\*/g);
    return (
      <p key={i} className={i > 0 ? "mt-1" : ""}>
        {parts.map((part, j) =>
          j % 2 === 1 ? (
            <strong key={j} className="font-semibold text-white">
              {part}
            </strong>
          ) : (
            part
          )
        )}
      </p>
    );
  });
}

export default function StrategyQuestionnaire({
  onClose,
}: {
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm going to help you build a personalized investing strategy. I'll ask you a few questions and then generate a complete strategy tailored to your answers.\n\nLet's start: **What's your main investing goal?** Are you focused on growing your wealth aggressively, building steady income, protecting capital, or something in between?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [generatedStrategy, setGeneratedStrategy] =
    useState<GeneratedStrategy | null>(null);
  const [editedStrategy, setEditedStrategy] =
    useState<GeneratedStrategy | null>(null);
  const [saveError, setSaveError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/strategies/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            ...messages.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: userMessage },
          ],
        }),
      });

      if (!response.ok) throw new Error("Request failed");

      const data = await response.json();
      const text = data.text ?? "";

      if (text.includes("READY_TO_GENERATE")) {
        const jsonStart = text.indexOf("{");
        const jsonEnd = text.lastIndexOf("}");
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          const jsonStr = text.slice(jsonStart, jsonEnd + 1);
          const parsed = JSON.parse(jsonStr) as GeneratedStrategy;
          setGeneratedStrategy(parsed);
          setEditedStrategy(parsed);
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content:
                "I've built your strategy based on our conversation. Review it below and make any adjustments before saving!",
            },
          ]);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: text },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sorry, I hit a snag connecting to the AI. Check your internet and try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  function handleSaveStrategy() {
    if (!editedStrategy) return;
    setSaveError("");
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("name", editedStrategy.name);
        formData.set("style", editedStrategy.style);
        formData.set("risk_level", editedStrategy.risk_level);
        formData.set("turnover_preference", editedStrategy.turnover_preference);
        formData.set("holding_period_bias", editedStrategy.holding_period_bias);
        formData.set(
          "max_position_pct",
          editedStrategy.max_position_pct?.toString() ?? ""
        );
        formData.set(
          "min_position_pct",
          editedStrategy.min_position_pct?.toString() ?? ""
        );
        formData.set(
          "cash_min_pct",
          editedStrategy.cash_min_pct?.toString() ?? ""
        );
        formData.set(
          "cash_max_pct",
          editedStrategy.cash_max_pct?.toString() ?? ""
        );
        formData.set("description", editedStrategy.description);
        formData.set("prompt_text", editedStrategy.prompt_text);
        await createStrategy(formData);
        router.refresh();
        onClose();
      } catch (error) {
        setSaveError(
          error instanceof Error ? error.message : "Failed to save strategy."
        );
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-[#040d1a] shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/8 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/20">
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4 text-blue-400"
                >
                  <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.897l-2.051-.684a1 1 0 01-.633-.633L6.95 5.684z" />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-white">
                AI Strategy Builder
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Answer a few questions and I'll build your strategy
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/4 p-2 text-slate-400 transition hover:text-white"
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  msg.role === "assistant"
                    ? "bg-blue-500/20 text-blue-400"
                    : "bg-white/10 text-slate-300"
                }`}
              >
                {msg.role === "assistant" ? "AI" : "You"}
              </div>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                  msg.role === "assistant"
                    ? "bg-white/5 text-slate-200"
                    : "bg-blue-600/30 text-white border border-blue-500/20"
                }`}
              >
                {renderMessageContent(msg.content)}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs font-semibold text-blue-400">
                AI
              </div>
              <div className="flex items-center gap-1.5 rounded-2xl bg-white/5 px-4 py-3">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Generated strategy review */}
        {generatedStrategy && editedStrategy && (
          <div className="border-t border-white/8 px-6 py-4 space-y-3 max-h-64 overflow-y-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">
              Generated Strategy — Review & Edit
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Name</label>
                <input
                  type="text"
                  value={editedStrategy.name}
                  onChange={(e) =>
                    setEditedStrategy((p) =>
                      p ? { ...p, name: e.target.value } : p
                    )
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Style</label>
                <select
                  value={editedStrategy.style}
                  onChange={(e) =>
                    setEditedStrategy((p) =>
                      p ? { ...p, style: e.target.value } : p
                    )
                  }
                  className={selectClass}
                >
                  {STRATEGY_STYLES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Risk Level</label>
                <select
                  value={editedStrategy.risk_level}
                  onChange={(e) =>
                    setEditedStrategy((p) =>
                      p ? { ...p, risk_level: e.target.value } : p
                    )
                  }
                  className={selectClass}
                >
                  {RISK_LEVELS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Turnover</label>
                <select
                  value={editedStrategy.turnover_preference}
                  onChange={(e) =>
                    setEditedStrategy((p) =>
                      p ? { ...p, turnover_preference: e.target.value } : p
                    )
                  }
                  className={selectClass}
                >
                  {TURNOVER_PREFERENCES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Holding Bias</label>
                <select
                  value={editedStrategy.holding_period_bias}
                  onChange={(e) =>
                    setEditedStrategy((p) =>
                      p ? { ...p, holding_period_bias: e.target.value } : p
                    )
                  }
                  className={selectClass}
                >
                  {HOLDING_PERIOD_BIASES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Max Pos %</label>
                  <input
                    type="number"
                    value={editedStrategy.max_position_pct ?? ""}
                    onChange={(e) =>
                      setEditedStrategy((p) =>
                        p
                          ? {
                              ...p,
                              max_position_pct: e.target.value
                                ? Number(e.target.value)
                                : null,
                            }
                          : p
                      )
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Min Pos %</label>
                  <input
                    type="number"
                    value={editedStrategy.min_position_pct ?? ""}
                    onChange={(e) =>
                      setEditedStrategy((p) =>
                        p
                          ? {
                              ...p,
                              min_position_pct: e.target.value
                                ? Number(e.target.value)
                                : null,
                            }
                          : p
                      )
                    }
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Description</label>
                <textarea
                  value={editedStrategy.description}
                  onChange={(e) =>
                    setEditedStrategy((p) =>
                      p ? { ...p, description: e.target.value } : p
                    )
                  }
                  spellCheck
                  className={`${inputClass} min-h-16`}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>AI Prompt</label>
                <textarea
                  value={editedStrategy.prompt_text}
                  onChange={(e) =>
                    setEditedStrategy((p) =>
                      p ? { ...p, prompt_text: e.target.value } : p
                    )
                  }
                  spellCheck
                  className={`${inputClass} min-h-20`}
                />
              </div>
            </div>

            {saveError && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {saveError}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleSaveStrategy}
                disabled={isPending}
                className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#2563eb,#4f46e5)" }}
              >
                {isPending ? "Saving..." : "Save Strategy"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/10 bg-white/4 px-5 py-2.5 text-sm text-slate-400 transition hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Input */}
        {!generatedStrategy && (
          <div className="border-t border-white/8 px-6 py-4">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Type your answer..."
                disabled={isLoading}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,#2563eb,#4f46e5)" }}
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                >
                  <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
                </svg>
              </button>
            </div>
            <p className="mt-2 text-[10px] text-slate-600">
              Press Enter to send · Powered by Gemini
            </p>
          </div>
        )}
      </div>
    </div>
  );
}