const GEMINI_ENDPOINT = (key: string, model = "gemini-2.0-flash") =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

export type GeminiOptions = {
  temperature?: number;
  maxOutputTokens?: number;
  model?: string;
};

function getKeys(): string[] {
  const keys: string[] = [];
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
  if (process.env.GEMINI_API_KEY_2) keys.push(process.env.GEMINI_API_KEY_2);
  return keys;
}

async function tryKey(key: string, prompt: string, opts: GeminiOptions): Promise<string | null> {
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

export async function callGemini(prompt: string, opts: GeminiOptions = {}): Promise<string | null> {
  const keys = getKeys();
  if (keys.length === 0) return null;

  for (const key of keys) {
    const result = await tryKey(key, prompt, opts);
    if (result !== null) return result;
  }

  console.error("[gemini] all keys exhausted — no response");
  return null;
}

export function geminiApiKeys(): string[] {
  return getKeys();
}
