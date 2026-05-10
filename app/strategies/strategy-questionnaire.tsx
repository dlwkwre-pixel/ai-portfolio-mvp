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
  onSaved,
  variant = "modal",
}: {
  onClose: () => void;
  onSaved?: (strategyName: string) => void;
  variant?: "modal" | "inline";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi, I'm **Finn** — your AI strategy advisor. I'll ask you a few questions about your goals, then build a complete investing strategy tailored to your answers.\n\nLet's start: **What's your main investing goal?** Are you focused on growing your wealth aggressively, building steady income, protecting capital, or something in between?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedStrategy, setGeneratedStrategy] =
    useState<GeneratedStrategy | null>(null);
  const [editedStrategy, setEditedStrategy] =
    useState<GeneratedStrategy | null>(null);
  const [saveError, setSaveError] = useState("");
  const [animatingIdx, setAnimatingIdx] = useState<number | null>(null);
  const [animatedText, setAnimatedText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevMsgCountRef = useRef(1); // skip initial welcome message
  const animationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, isGenerating, animatedText]);

  useEffect(() => {
    const prev = prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;

    if (messages.length <= prev) return;

    const newIdx = messages.length - 1;
    if (messages[newIdx].role !== "assistant") return;

    const fullText = messages[newIdx].content;
    const msPerChar = Math.max(8, Math.min(22, 2200 / fullText.length));

    if (animationIntervalRef.current) clearInterval(animationIntervalRef.current);
    setAnimatingIdx(newIdx);
    setAnimatedText("");

    let charIdx = 0;
    animationIntervalRef.current = setInterval(() => {
      charIdx += 1;
      setAnimatedText(fullText.slice(0, charIdx));
      if (charIdx >= fullText.length) {
        clearInterval(animationIntervalRef.current!);
        animationIntervalRef.current = null;
        setAnimatingIdx(null);
      }
    }, msPerChar);

    return () => {
      if (animationIntervalRef.current) clearInterval(animationIntervalRef.current);
    };
  }, [messages]);

  async function generateStrategy(conversationMessages: Message[]) {
    setIsGenerating(true);
    try {
      const response = await fetch("/api/strategies/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conversationMessages.map((m) => ({ role: m.role, content: m.content })),
          phase: "generate",
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Generation failed");
      const raw = (data.text ?? "").trim();

      // Strip accidental markdown fences from the model
      const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      const jsonStart = cleaned.indexOf("{");
      const jsonEnd = cleaned.lastIndexOf("}");
      if (jsonStart < 0 || jsonEnd <= jsonStart) throw new Error("Could not parse strategy JSON");

      const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1)) as GeneratedStrategy;
      setGeneratedStrategy(parsed);
      setEditedStrategy(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Something went wrong while building your strategy: ${msg}. Please try sending your last message again.`,
        },
      ]);
    } finally {
      setIsGenerating(false);
    }
  }

  async function sendMessage() {
    if (!input.trim() || isLoading || isGenerating) return;

    const userMessage = input.trim();
    setInput("");

    const updatedMessages: Message[] = [
      ...messages,
      { role: "user", content: userMessage },
    ];
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      const response = await fetch("/api/strategies/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          phase: "chat",
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Request failed");
      const text = data.text ?? "";

      if (text.includes("READY_TO_GENERATE")) {
        // Extract Finn's summary sentence(s) before the signal
        const summaryText = text.split("READY_TO_GENERATE")[0].trim();
        const withSummary: Message[] = summaryText
          ? [...updatedMessages, { role: "assistant", content: summaryText }]
          : updatedMessages;

        // Backward compat: if inline JSON was also returned, parse it directly
        const jsonStart = text.indexOf("{");
        const jsonEnd = text.lastIndexOf("}");
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          try {
            const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as GeneratedStrategy;
            setMessages(withSummary);
            setGeneratedStrategy(parsed);
            setEditedStrategy(parsed);
            return;
          } catch {
            // JSON parse failed — fall through to two-phase generation
          }
        }

        // Two-phase: show summary, then fire generation request
        setMessages(withSummary);
        setIsLoading(false);
        await generateStrategy(withSummary);
        return;
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: text }]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Sorry, something went wrong: ${msg}. Please try again in a moment.`,
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
        formData.set("max_position_pct", editedStrategy.max_position_pct?.toString() ?? "");
        formData.set("min_position_pct", editedStrategy.min_position_pct?.toString() ?? "");
        formData.set("cash_min_pct", editedStrategy.cash_min_pct?.toString() ?? "");
        formData.set("cash_max_pct", editedStrategy.cash_max_pct?.toString() ?? "");
        formData.set("description", editedStrategy.description);
        formData.set("prompt_text", editedStrategy.prompt_text);
        await createStrategy(formData);
        if (onSaved && editedStrategy) {
          onSaved(editedStrategy.name);
        } else {
          router.refresh();
          onClose();
        }
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Failed to save strategy.");
      }
    });
  }

  const isBusy = isLoading || isGenerating;

  const inner = (
    <div className={variant === "inline"
      ? "w-full max-h-[560px] flex flex-col rounded-2xl border border-white/10 bg-[#07090f]"
      : "w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-[#040d1a] shadow-2xl"
    }>

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/8 px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/20">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-blue-400">
                <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.897l-2.051-.684a1 1 0 01-.633-.633L6.95 5.684z" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-white">Finn</h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">Financial Intelligence, No Nonsense</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-white/10 bg-white/4 p-2 text-slate-400 transition hover:text-white"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>

      {/* Messages — shrinks to a recap strip once strategy is generated */}
      <div className={generatedStrategy ? "overflow-y-auto px-6 py-3 space-y-3 border-b border-white/8" : "flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0"} style={generatedStrategy ? { maxHeight: "120px" } : undefined}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
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
              {animatingIdx === i
                ? <p>{animatedText}<span className="inline-block w-0.5 h-3.5 ml-px bg-blue-400 align-middle animate-pulse" /></p>
                : renderMessageContent(msg.content)
              }
            </div>
          </div>
        ))}

        {/* Typing indicator — chat phase only */}
        {isLoading && (
          <div className="flex gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs font-semibold text-blue-400">
              AI
            </div>
            <div className="flex items-center gap-1.5 rounded-2xl bg-white/5 px-4 py-3">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}

        {/* Strategy generation indicator */}
        {isGenerating && (
          <div className="flex gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs font-semibold text-blue-400">
              AI
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-blue-500/8 border border-blue-500/20 px-4 py-3">
              <svg
                className="h-4 w-4 shrink-0 animate-spin text-blue-400"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm text-blue-300">Building your strategy...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Generated strategy review — takes all remaining modal height */}
      {generatedStrategy && editedStrategy && (
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">
            Generated Strategy — Review & Edit
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Name</label>
              <input
                type="text"
                value={editedStrategy.name}
                onChange={(e) => setEditedStrategy((p) => p ? { ...p, name: e.target.value } : p)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Style</label>
              <select
                value={editedStrategy.style}
                onChange={(e) => setEditedStrategy((p) => p ? { ...p, style: e.target.value } : p)}
                className={selectClass}
              >
                {STRATEGY_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Risk Level</label>
              <select
                value={editedStrategy.risk_level}
                onChange={(e) => setEditedStrategy((p) => p ? { ...p, risk_level: e.target.value } : p)}
                className={selectClass}
              >
                {RISK_LEVELS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Turnover</label>
              <select
                value={editedStrategy.turnover_preference}
                onChange={(e) => setEditedStrategy((p) => p ? { ...p, turnover_preference: e.target.value } : p)}
                className={selectClass}
              >
                {TURNOVER_PREFERENCES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Holding Bias</label>
              <select
                value={editedStrategy.holding_period_bias}
                onChange={(e) => setEditedStrategy((p) => p ? { ...p, holding_period_bias: e.target.value } : p)}
                className={selectClass}
              >
                {HOLDING_PERIOD_BIASES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>Max Pos %</label>
                <input
                  type="number"
                  value={editedStrategy.max_position_pct ?? ""}
                  onChange={(e) => setEditedStrategy((p) => p ? { ...p, max_position_pct: e.target.value ? Number(e.target.value) : null } : p)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Min Pos %</label>
                <input
                  type="number"
                  value={editedStrategy.min_position_pct ?? ""}
                  onChange={(e) => setEditedStrategy((p) => p ? { ...p, min_position_pct: e.target.value ? Number(e.target.value) : null } : p)}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Description</label>
              <textarea
                value={editedStrategy.description}
                onChange={(e) => setEditedStrategy((p) => p ? { ...p, description: e.target.value } : p)}
                spellCheck
                className={`${inputClass} min-h-16`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>AI Prompt</label>
              <textarea
                value={editedStrategy.prompt_text}
                onChange={(e) => setEditedStrategy((p) => p ? { ...p, prompt_text: e.target.value } : p)}
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
              placeholder={isGenerating ? "Building your strategy..." : "Type your answer..."}
              disabled={isBusy}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={isBusy || !input.trim()}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: "linear-gradient(135deg,#2563eb,#4f46e5)" }}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
              </svg>
            </button>
          </div>
          <p className="mt-2 text-[10px] text-slate-600">
            Press Enter to send · Powered by AI
          </p>
        </div>
      )}
    </div>
  );

  if (variant === "inline") return inner;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      {inner}
    </div>
  );
}
