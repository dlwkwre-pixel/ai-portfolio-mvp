"use client";

import { useState, useTransition } from "react";
import { createStrategy } from "./actions";
import { STRATEGY_STYLES, RISK_LEVELS, TURNOVER_PREFS, HOLDING_BIASES } from "./strategies-hub";

const inp = "bt-input";
const lbl = "mb-2 block text-[11px] font-medium uppercase tracking-wide text-slate-500 leading-tight";

type ParsedStrategy = {
  name: string;
  style: string;
  risk_level: string;
  turnover_preference: string;
  holding_period_bias: string;
  max_position_pct: string;
  cash_min_pct: string;
  cash_max_pct: string;
  description: string;
  prompt_text: string;
};

function closestMatch(value: string, options: readonly string[], fallback: string): string {
  const norm = value.trim().toLowerCase();
  const exact = options.find((o) => o.toLowerCase() === norm);
  if (exact) return exact;
  const partial = options.find((o) => norm.includes(o.toLowerCase()) || o.toLowerCase().includes(norm));
  return partial ?? fallback;
}

function buildGuidedPrompt(context: string): string {
  return `I want you to design an investment strategy for an app called BuyTune, which uses this to guide an AI when it analyzes stocks for me. Think it through, then give me your final answer using EXACTLY this format — keep the field labels as-is, replace only the bracketed parts:

===BUYTUNE_STRATEGY===
NAME: [a short strategy name]
STYLE: [one of: Growth, Value, Blend, Dividend / Income, Quality, Index / Passive, Sector / Thematic, Momentum, Swing, Mean Reversion, Defensive, Balanced, Speculative]
RISK_LEVEL: [Conservative, Moderate, or Aggressive]
TURNOVER: [Low, Moderate, or High]
HOLDING_PERIOD: [Short-term, Swing, Medium-term, Long-term, Very Long-term, or Flexible]
MAX_POSITION_PCT: [a number 1-100, the max % of the portfolio in one holding]
CASH_MIN_PCT: [a number 0-100]
CASH_MAX_PCT: [a number 0-100]
DESCRIPTION: [1-2 sentence summary]
AI_INSTRUCTIONS:
[the full qualitative strategy — this is the actual text BuyTune's AI will read every time it evaluates a stock under this strategy, so be specific and complete: what to look for, what to avoid, how to weigh tradeoffs, when to sell]
===END_BUYTUNE_STRATEGY===

What I want this strategy to do: ${context.trim() || "[describe your goals, risk tolerance, and what kind of stocks/approach you want here]"}`;
}

function parseByoStrategy(raw: string): { parsed: ParsedStrategy | null; error: string | null } {
  const blockMatch = raw.match(/===BUYTUNE_STRATEGY===([\s\S]*?)===END_BUYTUNE_STRATEGY===/i);
  const block = blockMatch ? blockMatch[1] : raw;

  function field(label: string): string {
    const m = block.match(new RegExp(`^${label}:\\s*(.+)$`, "im"));
    return m ? m[1].trim() : "";
  }

  const name = field("NAME");
  const aiInstrMatch = block.match(/AI_INSTRUCTIONS:\s*([\s\S]*?)(?:\n===|$)/i);
  const prompt_text = aiInstrMatch ? aiInstrMatch[1].trim() : "";

  if (!name || !prompt_text) {
    return {
      parsed: null,
      error: "Couldn't find NAME and AI_INSTRUCTIONS in that — make sure you pasted the AI's full response, in the exact format from the prompt above.",
    };
  }

  return {
    parsed: {
      name,
      style: closestMatch(field("STYLE"), STRATEGY_STYLES, "Growth"),
      risk_level: closestMatch(field("RISK_LEVEL"), RISK_LEVELS, "Moderate"),
      turnover_preference: closestMatch(field("TURNOVER"), TURNOVER_PREFS, "Moderate"),
      holding_period_bias: closestMatch(field("HOLDING_PERIOD"), HOLDING_BIASES, "Long-term"),
      max_position_pct: field("MAX_POSITION_PCT").replace(/[^\d.]/g, ""),
      cash_min_pct: field("CASH_MIN_PCT").replace(/[^\d.]/g, ""),
      cash_max_pct: field("CASH_MAX_PCT").replace(/[^\d.]/g, ""),
      description: field("DESCRIPTION"),
      prompt_text,
    },
    error: null,
  };
}

export default function BringYourOwnAiPanel({ onCreated }: { onCreated: (id: string | undefined, name: string) => void }) {
  const [step, setStep] = useState<"prompt" | "paste" | "review">("prompt");
  const [context, setContext] = useState("");
  const [copied, setCopied] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [parseError, setParseError] = useState("");
  const [parsed, setParsed] = useState<ParsedStrategy | null>(null);
  const [createError, setCreateError] = useState("");
  const [isPending, startCreate] = useTransition();

  const guidedPrompt = buildGuidedPrompt(context);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(guidedPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail without permission — user can still select-all manually.
    }
  }

  function handleParse() {
    setParseError("");
    const { parsed: result, error } = parseByoStrategy(pasteText);
    if (error || !result) {
      setParseError(error ?? "Could not parse that response.");
      return;
    }
    setParsed(result);
    setStep("review");
  }

  function handleCreate(fd: FormData) {
    setCreateError("");
    startCreate(async () => {
      try {
        const name = (fd.get("name") as string) || "New Strategy";
        const res = await createStrategy(fd);
        onCreated(res?.id, name);
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="bt-card" style={{ padding: "18px" }}>
      {/* ── Step indicator ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "14px" }}>
        {(["prompt", "paste", "review"] as const).map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{
              width: "18px", height: "18px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "10px", fontWeight: 700, fontFamily: "var(--font-mono)",
              background: step === s ? "var(--brand-gradient)" : "var(--card-bg)",
              border: step === s ? "none" : "1px solid var(--card-border)",
              color: step === s ? "#fff" : "var(--text-muted)",
            }}>{i + 1}</div>
            <span style={{ fontSize: "11px", color: step === s ? "var(--text-primary)" : "var(--text-muted)", fontWeight: step === s ? 600 : 400 }}>
              {s === "prompt" ? "Copy prompt" : s === "paste" ? "Paste response" : "Review & create"}
            </span>
            {i < 2 && <span style={{ color: "var(--text-muted)", margin: "0 4px" }}>→</span>}
          </div>
        ))}
      </div>

      {step === "prompt" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <p style={{ fontSize: "12px", color: "var(--text-tertiary)", lineHeight: 1.6, margin: 0 }}>
            Use whichever AI model you trust most — Claude, ChatGPT, wherever — to design the strategy, then bring the result back here. Optionally describe what you want first, then copy the prompt below and paste it into your AI.
          </p>
          <div>
            <label className={lbl}>What do you want this strategy to do? (optional, but helps)</label>
            <textarea className={`${inp} min-h-[56px]`} value={context} onChange={(e) => setContext(e.target.value)}
              placeholder="e.g. Dividend-focused, low-turnover strategy for a retirement account, avoid high-volatility sectors..." />
          </div>
          <div>
            <label className={lbl}>Prompt to copy</label>
            <textarea readOnly className={`${inp} min-h-[160px]`} style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }} value={guidedPrompt} onClick={(e) => (e.target as HTMLTextAreaElement).select()} />
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" onClick={copyPrompt}
              style={{ padding: "8px 16px", borderRadius: "var(--radius-xl)", fontSize: "12px", fontWeight: 600, color: "#fff", background: "var(--brand-gradient)", border: "none", cursor: "pointer" }}>
              {copied ? "Copied ✓" : "Copy prompt"}
            </button>
            <button type="button" onClick={() => setStep("paste")}
              style={{ padding: "8px 16px", borderRadius: "var(--radius-xl)", fontSize: "12px", color: "var(--text-tertiary)", background: "var(--card-bg)", border: "1px solid var(--card-border)", cursor: "pointer" }}>
              I have a response, skip to paste →
            </button>
          </div>
        </div>
      )}

      {step === "paste" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <p style={{ fontSize: "12px", color: "var(--text-tertiary)", lineHeight: 1.6, margin: 0 }}>
            Paste your AI&apos;s full response below — extra text around the structured block is fine, BuyTune will pull out just the strategy fields.
          </p>
          <textarea className={`${inp} min-h-[180px]`} value={pasteText} onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste the AI's response here..." />
          {parseError && (
            <div style={{ fontSize: "12px", color: "var(--red)", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: "var(--radius-md)", padding: "8px 12px" }}>{parseError}</div>
          )}
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" onClick={handleParse} disabled={!pasteText.trim()}
              style={{ padding: "8px 16px", borderRadius: "var(--radius-xl)", fontSize: "12px", fontWeight: 600, color: "#fff", background: "var(--brand-gradient)", border: "none", cursor: pasteText.trim() ? "pointer" : "default", opacity: pasteText.trim() ? 1 : 0.5 }}>
              Parse response
            </button>
            <button type="button" onClick={() => setStep("prompt")}
              style={{ padding: "8px 16px", borderRadius: "var(--radius-xl)", fontSize: "12px", color: "var(--text-tertiary)", background: "var(--card-bg)", border: "1px solid var(--card-border)", cursor: "pointer" }}>
              ← Back
            </button>
          </div>
        </div>
      )}

      {step === "review" && parsed && (
        <form
          style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "16px 12px" }}
          className="manual-form-grid"
          action={handleCreate}
        >
          <p style={{ gridColumn: "1 / -1", fontSize: "12px", color: "var(--text-tertiary)", margin: "0 0 2px", lineHeight: 1.6 }}>
            Parsed from your AI&apos;s response — review and adjust anything before creating. Nothing is saved yet.
          </p>
          <div>
            <label className={lbl}>Strategy name *</label>
            <input name="name" type="text" defaultValue={parsed.name} className={inp} required />
          </div>
          <div>
            <label className={lbl}>Style</label>
            <select name="style" defaultValue={parsed.style} className={inp}>
              {STRATEGY_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Risk level</label>
            <select name="risk_level" defaultValue={parsed.risk_level} className={inp}>
              {RISK_LEVELS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Trading frequency</label>
            <select name="turnover_preference" defaultValue={parsed.turnover_preference} className={inp}>
              {TURNOVER_PREFS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Time horizon</label>
            <select name="holding_period_bias" defaultValue={parsed.holding_period_bias} className={inp}>
              {HOLDING_BIASES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Max single holding %</label>
            <input name="max_position_pct" type="number" step="1" min="0" max="100" defaultValue={parsed.max_position_pct} className={inp} />
          </div>
          <div>
            <label className={lbl}>Keep in cash (min) %</label>
            <input name="cash_min_pct" type="number" step="1" min="0" defaultValue={parsed.cash_min_pct} className={inp} />
          </div>
          <div>
            <label className={lbl}>Keep in cash (max) %</label>
            <input name="cash_max_pct" type="number" step="1" min="0" defaultValue={parsed.cash_max_pct} className={inp} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label className={lbl}>Description</label>
            <textarea name="description" defaultValue={parsed.description} className={`${inp} min-h-[56px]`} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label className={lbl}>AI instructions</label>
            <p style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "5px" }}>
              Sent to the AI when analyzing portfolios using this strategy.
            </p>
            <textarea name="prompt_text" defaultValue={parsed.prompt_text} className={`${inp} min-h-[140px]`} />
          </div>
          {createError && (
            <div style={{ gridColumn: "1 / -1", fontSize: "12px", color: "var(--red)", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: "var(--radius-md)", padding: "8px 12px" }}>{createError}</div>
          )}
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: "8px" }}>
            <button type="submit" disabled={isPending}
              style={{ padding: "8px 18px", borderRadius: "var(--radius-xl)", fontSize: "13px", fontWeight: 600, color: "#fff", background: "var(--brand-gradient)", border: "none", cursor: "pointer", opacity: isPending ? 0.6 : 1 }}>
              {isPending ? "Creating..." : "Create strategy"}
            </button>
            <button type="button" onClick={() => setStep("paste")}
              style={{ padding: "8px 14px", borderRadius: "var(--radius-xl)", fontSize: "13px", color: "var(--text-tertiary)", background: "var(--card-bg)", border: "1px solid var(--card-border)", cursor: "pointer" }}>
              ← Back
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
