"use server";

import { getCurrentEvent } from "../events/current";
import { roles, validateShiftTimes } from "./model";
import { shiftColumns, toShift } from "./data";

export async function saveShift(
  eventId: string,
  volunteerId: string,
  role: string,
  startTime: string,
  endTime: string,
) {
  if (!roles.includes(role)) return { error: "Choose one of the listed roles." };
  const timeError = validateShiftTimes(startTime, endTime);
  if (timeError) return { error: timeError };

  const { supabase, error } = await getCurrentEvent(eventId);
  if (!supabase) return { error };

  const db = supabase.schema("public");
  const volunteer = await db.from("participants").select("full_name")
    .eq("id", volunteerId).eq("event_id", eventId).maybeSingle();

  if (volunteer.error || !volunteer.data) return { error: "Choose a saved participant for this event." };

  const conflict = await db.from("shifts").select("id").eq("participant_id", volunteerId)
    .lt("start_time", endTime).gt("end_time", startTime).limit(1).maybeSingle();
  const conflictError = `${volunteer.data.full_name} already has a shift that overlaps these times.`;

  if (conflict.error) return { error: "We couldn't check for overlapping shifts. Try again." };
  if (conflict.data) return { error: conflictError };

  const result = await db.from("shifts").insert({
    participant_id: volunteerId,
    role,
    start_time: startTime,
    end_time: endTime,
  }).select(shiftColumns).single();

  if (result.error?.code === "23P01") return { error: conflictError };
  if (result.error?.code === "23514" || result.error?.code === "22P02") {
    return { error: "The database rejected this role or shift time. Check the event's scheduling settings." };
  }
  if (result.error) return { error: "We couldn't save the shift. Try again." };

  return { shift: toShift(result.data, volunteer.data.full_name) };
}

export async function removeShift(eventId: string, shiftId: string) {
  const { supabase, error } = await getCurrentEvent(eventId);
  if (!supabase) return { error };

  const table = supabase.schema("public").from("shifts");
  const existing = await table.select("participant_id,participants!inner(event_id)")
    .eq("id", shiftId).eq("participants.event_id", eventId).maybeSingle();
  const deleteError = "We couldn't delete this shift. Refresh the page and try again.";

  if (existing.error || !existing.data) return { error: deleteError };

  const result = await table.delete().eq("id", shiftId)
    .eq("participant_id", existing.data.participant_id).select("id").maybeSingle();

  if (result.error || !result.data) return { error: deleteError };

  return { ok: true };
}
