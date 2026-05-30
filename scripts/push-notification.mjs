/**
 * Push an app notification to all users.
 * Usage: node scripts/push-notification.mjs --title "Title" --body "Description"
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse .env.local
let supabaseUrl = "", serviceKey = "";
try {
  const env = readFileSync(join(__dirname, "../.env.local"), "utf-8");
  for (const line of env.split("\n")) {
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (k === "NEXT_PUBLIC_SUPABASE_URL") supabaseUrl = v;
    if (k === "SUPABASE_SERVICE_ROLE_KEY") serviceKey = v;
  }
} catch {
  console.error("Could not read .env.local");
  process.exit(1);
}

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

// Parse CLI args
const args = process.argv.slice(2);
let title = "", body = "";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--title") title = args[++i] ?? "";
  if (args[i] === "--body") body = args[++i] ?? "";
}

if (!title || !body) {
  console.error('Usage: node scripts/push-notification.mjs --title "Title" --body "Description"');
  process.exit(1);
}

// Insert via Supabase REST API (no SDK dependency needed)
const res = await fetch(`${supabaseUrl}/rest/v1/app_notifications`, {
  method: "POST",
  headers: {
    "apikey": serviceKey,
    "Authorization": `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
  },
  body: JSON.stringify({ title, body }),
});

if (!res.ok) {
  const text = await res.text();
  console.error("Failed to push notification:", text);
  process.exit(1);
}

console.log(`Notification pushed: "${title}"`);
