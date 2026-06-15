const GEMINI_ENDPOINT = (key: string, model = "gemini-2.0-flash") =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

export type GeminiOptions = {
  temperature?: number;
  maxOutputTokens?: number;
  model?: string;
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

async function tryGroq(prompt: string, opts: GeminiOptions): Promise<string | null> {
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
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.maxOutputTokens ?? 800,
      }),
    });
    if (!res.ok) {
      console.warn(`[groq] → HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    console.warn("[groq] fetch error:", err);
    return null;
  }
}

export async function callGemini(prompt: string, opts: GeminiOptions = {}): Promise<string | null> {
  // Try Gemini keys in order
  for (const key of getGeminiKeys()) {
    const result = await tryGeminiKey(key, prompt, opts);
    if (result !== null) return result;
  }

  // All Gemini keys exhausted — fall back to Groq (free, 14,400 RPD)
  const groqResult = await tryGroq(prompt, opts);
  if (groqResult !== null) return groqResult;

  console.error("[ai] all providers exhausted — no response");
  return null;
}

export function geminiApiKeys(): string[] {
  return getGeminiKeys();
}
