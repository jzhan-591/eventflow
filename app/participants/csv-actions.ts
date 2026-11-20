"use server";

import { getCurrentEvent } from "../events/current";
import { parseParticipantCsv, serializeParticipantCsv } from "../participant-csv";
import { participantColumns, readParticipants, type SavedParticipant } from "./data";
import { participantIdForName, participantNameKey } from "./write";

export async function importSavedParticipants(eventId: string, text: string) {
  const { supabase, error } = await getCurrentEvent(eventId);
  if (!supabase) return { error };

  let rows;
  try {
    rows = parseParticipantCsv(text);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The CSV could not be parsed." };
  }

  const roster = await readParticipants(supabase, eventId);
  if (roster.error) {
    return { error: "We couldn't check for duplicates in the saved roster. Nothing was imported." };
  }

  const names = new Set(roster.participants.map(({ name }) => participantNameKey(name)));
  let duplicates = 0;
  const candidates = [];

  for (const { name, checkedIn } of rows) {
    const key = participantNameKey(name);
    if (names.has(key)) {
      duplicates++;
      continue;
    }

    names.add(key);
    candidates.push({
      id: participantIdForName(eventId, name),
      event_id: eventId,
      full_name: name,
      checked_in: checkedIn,
    });
  }

  const added: SavedParticipant[] = [];
  const errors = new Set<string>();
  let failed = 0;
  const batchSize = 100;

  for (let offset = 0; offset < candidates.length; offset += batchSize) {
    const batch = candidates.slice(offset, offset + batchSize);
    const result = await supabase.schema("public").from("participants")
      .upsert(batch, { onConflict: "id", ignoreDuplicates: true })
      .select(participantColumns);

    if (result.error) {
      failed += batch.length;
      errors.add(result.error.code ? `${result.error.code}: ${result.error.message}` : result.error.message);
      continue;
    }

    added.push(...result.data);
    duplicates += batch.length - result.data.length;
  }

  return { added, duplicates, failed, errors: [...errors] };
}

export async function exportSavedParticipants(eventId: string) {
  const { supabase, error } = await getCurrentEvent(eventId);
  if (!supabase) return { error };

  const roster = await readParticipants(supabase, eventId);
  if (roster.error) return { error: "We couldn't load saved participants for export. Try again." };
  if (roster.participants.length === 0) {
    return { error: "There are no saved participants to export." };
  }

  return { csv: serializeParticipantCsv(roster.participants) };
}
