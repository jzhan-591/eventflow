import type { createClient } from "@/lib/supabase/server";
import type { Shift } from "./model";

type ShiftRow = {
  id: string | number;
  participant_id: string;
  role: string;
  start_time: string;
  end_time: string;
};

type ShiftWithVolunteer = ShiftRow & { participants: { full_name: string } };

export const shiftColumns = "id,participant_id,role,start_time,end_time";

export function toShift(row: ShiftRow, volunteerName: string): Shift {
  return {
    id: String(row.id),
    volunteerId: row.participant_id,
    volunteerName,
    role: row.role,
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
  };
}

export async function readShifts(supabase: Awaited<ReturnType<typeof createClient>>, eventId: string) {
  const shifts: Shift[] = [];
  const pageSize = 200;

  while (true) {
    const offset = shifts.length;
    const { data, error } = await supabase
      .schema("public")
      .from("shifts")
      .select(`${shiftColumns},participants!inner(full_name,event_id)`)
      .eq("participants.event_id", eventId)
      .order("start_time")
      .order("id")
      .range(offset, offset + pageSize - 1)
      .overrideTypes<ShiftWithVolunteer[], { merge: false }>();

    if (error) return { shifts: [], error };
    if (data.length === 0) return { shifts, error: null };

    for (const row of data) {
      shifts.push(toShift(row, row.participants.full_name));
    }
  }
}
