"use server";

import { createClient } from "@/lib/supabase/server";
import { checkAndAwardBadges } from "@/lib/badges/check";

// ─── US federal bank holiday helpers ─────────────────────────────────────────

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): string {
  // month: 1-12, weekday: 0=Sun…6=Sat, n: 1=first…
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  let diff = weekday - firstDow;
  if (diff < 0) diff += 7;
  return fmt(new Date(Date.UTC(year, month - 1, 1 + diff + (n - 1) * 7)));
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)); // last day of month
  let diff = lastDay.getUTCDay() - weekday;
  if (diff < 0) diff += 7;
  return fmt(new Date(Date.UTC(year, month - 1, lastDay.getUTCDate() - diff)));
}

function observedDate(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day));
  const dow = d.getUTCDay();
  if (dow === 6) return fmt(new Date(Date.UTC(year, month - 1, day - 1))); // Sat → Fri
  if (dow === 0) return fmt(new Date(Date.UTC(year, month - 1, day + 1))); // Sun → Mon
  return fmt(d);
}

function getUSBankHolidays(year: number): Set<string> {
  return new Set([
    observedDate(year, 1, 1),                      // New Year's Day
    nthWeekdayOfMonth(year, 1, 1, 3),              // MLK Day (3rd Mon Jan)
    nthWeekdayOfMonth(year, 2, 1, 3),              // Presidents Day (3rd Mon Feb)
    lastWeekdayOfMonth(year, 5, 1),                // Memorial Day (last Mon May)
    observedDate(year, 6, 19),                     // Juneteenth
    observedDate(year, 7, 4),                      // Independence Day
    nthWeekdayOfMonth(year, 9, 1, 1),              // Labor Day (1st Mon Sep)
    nthWeekdayOfMonth(year, 10, 1, 2),             // Columbus Day (2nd Mon Oct)
    observedDate(year, 11, 11),                    // Veterans Day
    nthWeekdayOfMonth(year, 11, 4, 4),             // Thanksgiving (4th Thu Nov)
    observedDate(year, 12, 25),                    // Christmas Day
  ]);
}

// A "required" day is one whose absence breaks the streak:
// weekday (Mon–Fri) that is NOT a US federal bank holiday.
function isRequiredDay(dateStr: string): boolean {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false; // weekend — never breaks streak
  return !getUSBankHolidays(d.getUTCFullYear()).has(dateStr);
}

// Returns true if any required day exists strictly between lastDate and today.
function missedRequiredDay(lastDate: string, today: string): boolean {
  const cursor = new Date(lastDate + "T12:00:00Z");
  cursor.setUTCDate(cursor.getUTCDate() + 1); // start the day after lastDate
  const end = new Date(today + "T12:00:00Z");
  while (cursor < end) {
    if (isRequiredDay(fmt(cursor))) return true;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return false;
}

// ─── Server action ────────────────────────────────────────────────────────────

export async function recordDailyActivity(): Promise<number> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const today = new Date().toISOString().slice(0, 10);

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("login_streak, longest_streak, last_active_date")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return 0;

  const lastDate = (profile as { last_active_date?: string | null }).last_active_date ?? null;
  const currentStreak = (profile as { login_streak?: number | null }).login_streak ?? 0;
  const longestStreak = (profile as { longest_streak?: number | null }).longest_streak ?? 0;

  // Already recorded today — nothing to do
  if (lastDate === today) return currentStreak;

  // If there's no previous date, or a required weekday was missed → reset to 1
  const missed = !lastDate || missedRequiredDay(lastDate, today);
  const newStreak = missed ? 1 : currentStreak + 1;
  const newLongest = Math.max(longestStreak, newStreak);

  await supabase
    .from("user_profiles")
    .update({
      login_streak: newStreak,
      longest_streak: newLongest,
      last_active_date: today,
    } as Record<string, unknown>)
    .eq("id", user.id);

  void checkAndAwardBadges(user.id).catch(() => {});

  return newStreak;
}
