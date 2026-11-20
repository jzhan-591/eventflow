import type { createClient } from "@/lib/supabase/server";

export type Participant = { id: string; name: string };
export type SavedParticipant = Participant & { checked_in: boolean };

// Give the database column the name used by the Dashboard and CSV helpers.
export const participantColumns = "id,name:full_name,checked_in";

export async function readParticipants(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
) {
  const participants: SavedParticipant[] = [];
  const pageSize = 200;

  while (true) {
    const offset = participants.length;
    const { data, error, status } = await supabase
      .schema("public")
      .from("participants")
      .select(participantColumns)
      .eq("event_id", eventId)
      .order("full_name")
      .order("id")
      .range(offset, offset + pageSize - 1);

    if (error) {
      // Keep database diagnostics on the server without logging request credentials.
      console.error(
        `[participants] Could not read public.participants. ${JSON.stringify({
          status, code: error.code, message: error.message, offset,
        })}`,
      );
      return { participants: [], error };
    }
    if (data.length === 0) return { participants, error: null };
    participants.push(...data);
  }
}
