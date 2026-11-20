"use server";

import { getCurrentEvent } from "../events/current";
import { participantColumns, readParticipants } from "./data";
import { participantIdForName, participantNameKey } from "./write";

export async function saveParticipant(eventId: string, rawName: string) {
  const name = rawName.trim().replace(/\s+/g, " ");
  if (!name) return { error: "Enter a participant name." };

  const { supabase, error } = await getCurrentEvent(eventId);
  if (!supabase) return { error };

  const roster = await readParticipants(supabase, eventId);
  if (roster.error) return { error: "We couldn't check for duplicate names. Try again." };

  const duplicateError = "A participant with this name is already on the list.";
  if (roster.participants.some((participant) => participantNameKey(participant.name) === participantNameKey(name))) {
    return { error: duplicateError };
  }

  const result = await supabase
    .schema("public")
    .from("participants")
    .upsert(
      { id: participantIdForName(eventId, name), event_id: eventId, full_name: name, checked_in: false },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select(participantColumns)
    .maybeSingle();

  if (result.error) {
    return { error: result.error.code === "23505" ? duplicateError : "We couldn't save the participant. Try again." };
  }

  return result.data ? { participant: result.data } : { error: duplicateError };
}

export async function saveCheckIn(eventId: string, participantId: string) {
  const { supabase, error } = await getCurrentEvent(eventId);
  if (!supabase) return { error };

  const participants = supabase.schema("public").from("participants");
  const result = await participants
    .update({ checked_in: true })
    .eq("event_id", eventId)
    .eq("id", participantId)
    .eq("checked_in", false)
    .select("id")
    .maybeSingle();

  const checkInError = "We couldn't check in this participant. Refresh the page and try again.";
  if (result.error) return { error: checkInError };
  if (result.data) return { ok: true };

  // Another tab may already have checked in this participant.
  const existing = await participants.select("checked_in")
    .eq("event_id", eventId).eq("id", participantId).maybeSingle();
  return !existing.error && existing.data?.checked_in ? { ok: true } : { error: checkInError };
}
