"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readEvent } from "./data";

const sampleEvent = {
  title: "Community Volunteer Day",
  event_date: "2026-12-05",
  start_time: "09:00",
  location: "Maplewood Community Center, Seattle, WA",
};

function sampleEventId(ownerId: string) {
  // Always use the same UUID for this user's sample, even across concurrent requests.
  const hex = createHash("sha256").update(`eventflow:community-volunteer-day:${ownerId}`).digest("hex");
  const variant = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

type CreateEventState = { error?: string };

export async function createSampleEvent(): Promise<CreateEventState> {
  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getClaims();
  const ownerId = data?.claims.sub;
  if (authError || !ownerId) redirect("/login");

  const existing = await readEvent(supabase, ownerId);
  if (existing.error) {
    return { error: "We couldn't check for an existing event. Refresh the page and try again." };
  }

  if (!existing.data) {
    const { error } = await supabase.schema("public").from("events").upsert(
      { ...sampleEvent, id: sampleEventId(ownerId), owner_id: ownerId },
      { onConflict: "id", ignoreDuplicates: true },
    );

    if (error) {
      return { error: error.code === "42501"
        ? "You don't have permission to create an event."
        : "We couldn't save the sample event. Try again." };
    }

    const saved = await readEvent(supabase, ownerId);
    if (saved.error || !saved.data) {
      return { error: "We couldn't verify the saved event. Refresh the page before trying again." };
    }
  }

  revalidatePath("/");
  return {};
}
