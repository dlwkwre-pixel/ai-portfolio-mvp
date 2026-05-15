"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type FinnProfile = {
  id: string;
  user_id: string;
  archetype: string;
  traits: string[];
  updated_at: string;
};

export async function saveFinnProfile(archetype: string, traits: string[]): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { error } = await supabase
    .from("finn_profiles")
    .upsert(
      { user_id: user.id, archetype, traits, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

  if (error) throw new Error(error.message);
  revalidatePath("/strategies");
}

export async function getFinnProfile(): Promise<FinnProfile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("finn_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return data as FinnProfile | null;
}
