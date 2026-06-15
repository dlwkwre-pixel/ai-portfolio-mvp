// Shared free-AI helper.
//
// Default chain: Gemini Flash keys (in order) → Groq (model fallback).
// Options let specific routes opt out of Gemini entirely (groqOnly) or try
// Groq first (groqFirst) when Gemini's tight free quota is a bottleneck.
//
// The export is named callGemini for historical reasons / to avoid churn.

const GEMINI_ENDPOINT = (key: string, model = "gemini-2.0-flash") =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

// 70B for quality, 8B-instant as a high-throughput fallback when 70B is rate-limited.
const GROQ_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

export type GeminiOptions = {
  temperature?: number;
  maxOutputTokens?: number;
  model?: string;
  groqFirst?: boolean; // try Groq before Gemini
  groqOnly?: boolean;  // skip Gemini entirely (e.g. research page)
};

function getGeminiKeys(): string[] {
  const keys: string[] = [];
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
  if (process.env.GEMINI_API_KEY_2) keys.push(process.env.GEMINI_API_KEY_2);
  if (process.env.GEMINI_API_KEY_3) keys.push(process.env.GEMINI_API_KEY_3);
  return keys;
}

async function tryGeminiKey(key: string, prompt: string, opts: GeminiOptions): Promise<string | null> {
  try {
    const res = await fetch(GEMINI_ENDPOINT(key, opts.model), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: opts.temperature ?? 0.4,
          maxOutputTokens: opts.maxOutputTokens ?? 800,
        },
      }),
    });
    if (!res.ok) {
      console.warn(`[gemini] key ...${key.slice(-6)} → HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch (err) {
    console.warn(`[gemini] key ...${key.slice(-6)} → fetch error:`, err);
    return null;
  }
}

async function tryGroqModel(model: string, prompt: string, opts: GeminiOptions): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.maxOutputTokens ?? 800,
      }),
    });
    if (!res.ok) {
      console.warn(`[groq:${model}] → HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    console.warn(`[groq:${model}] fetch error:`, err);
    return null;
  }
}

async function tryGroq(prompt: string, opts: GeminiOptions): Promise<string | null> {
  for (const model of GROQ_MODELS) {
    const result = await tryGroqModel(model, prompt, opts);
    if (result !== null) return result;
  }
  return null;
}

async function tryAllGemini(prompt: string, opts: GeminiOptions): Promise<string | null> {
  for (const key of getGeminiKeys()) {
    const result = await tryGeminiKey(key, prompt, opts);
    if (result !== null) return result;
  }
  return null;
}

export async function callGemini(prompt: string, opts: GeminiOptions = {}): Promise<string | null> {
  // Research and other heavy routes set groqOnly to skip Gemini's maxed-out free quota.
  if (opts.groqOnly) {
    const groqResult = await tryGroq(prompt, opts);
    if (groqResult !== null) return groqResult;
    console.error("[ai] Groq exhausted (groqOnly) — no response");
    return null;
  }

  if (opts.groqFirst) {
    const groqResult = await tryGroq(prompt, opts);
    if (groqResult !== null) return groqResult;
    const geminiResult = await tryAllGemini(prompt, opts);
    if (geminiResult !== null) return geminiResult;
  } else {
    const geminiResult = await tryAllGemini(prompt, opts);
    if (geminiResult !== null) return geminiResult;
    const groqResult = await tryGroq(prompt, opts);
    if (groqResult !== null) return groqResult;
  }

  console.error("[ai] all providers exhausted — no response");
  return null;
}

/**
 * Robustly pull a JSON object out of an LLM response that may be wrapped in
 * markdown fences, prefixed with prose, or (when truncated) missing its
 * closing brace. Returns the parsed object or null.
 */
export function extractJsonObject<T = Record<string, unknown>>(raw: string | null): T | null {
  if (!raw) return null;
  // Strip markdown code fences
  let s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = s.indexOf("{");
  if (start === -1) return null;
  s = s.slice(start);

  // Try a straight parse of the {...} span first
  const end = s.lastIndexOf("}");
  if (end !== -1) {
    const span = s.slice(0, end + 1);
    try { return JSON.parse(span) as T; } catch { /* fall through to repair */ }
  }

  // Repair attempt: balance braces for a truncated object
  let depth = 0, inStr = false, esc = false, lastComplete = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') inStr = !inStr;
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) lastComplete = i; }
  }
  if (lastComplete !== -1) {
    try { return JSON.parse(s.slice(0, lastComplete + 1)) as T; } catch { /* give up */ }
  }
  return null;
}
