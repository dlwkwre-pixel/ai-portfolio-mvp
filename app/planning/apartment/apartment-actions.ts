"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ListingStatus = "considering" | "touring" | "applied" | "offer" | "pass" | "rejected";

export type ApartmentListing = {
  id: string;
  user_id: string;
  name: string;
  website: string | null;
  address: string | null;
  status: ListingStatus;
  floorplan_name: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_feet: number | null;
  available_date: string | null;
  base_rent: number;
  lease_term_months: number;
  concession_text: string | null;
  concession_monthly_savings: number;
  concession_explanation: string | null;
  application_fee: number;
  admin_fee: number;
  security_deposit: number;
  has_pets: boolean;
  pet_count: number;
  pet_deposit: number;
  pet_rent_monthly: number;
  parking_monthly: number;
  commute_minutes: number | null;
  commute_cost_monthly: number | null;
  notes: string | null;
  user_score: number | null;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
};

type ListingInput = Omit<ApartmentListing, "id" | "user_id" | "created_at" | "updated_at">;

export async function saveApartmentListing(
  data: ListingInput,
  existingId?: string,
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  if (existingId) {
    const { error } = await supabase
      .from("apartment_listings")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", existingId)
      .eq("user_id", user.id);
    if (error) return { error: error.message };
    revalidatePath("/planning/apartment");
    revalidatePath("/planning");
    return { id: existingId };
  }

  const { data: row, error } = await supabase
    .from("apartment_listings")
    .insert({ ...data, user_id: user.id })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/planning/apartment");
  revalidatePath("/planning");
  return { id: row.id };
}

export async function deleteApartmentListing(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };
  const { error } = await supabase
    .from("apartment_listings")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/planning/apartment");
  revalidatePath("/planning");
  return {};
}

export async function toggleApartmentFavorite(id: string, isFavorite: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };
  const { error } = await supabase
    .from("apartment_listings")
    .update({ is_favorite: isFavorite, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/planning/apartment");
  return {};
}
