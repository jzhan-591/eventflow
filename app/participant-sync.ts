import type { ImportedParticipant } from "./participant-csv";
import type { Shift } from "./shifts/model";

import type { Participant } from "./participants/data";

export function previewParticipantSync(
  participants: Participant[],
  shifts: Shift[],
  csvParticipants: ImportedParticipant[],
) {
  const csvByName = new Map<string, ImportedParticipant>();
  for (const participant of csvParticipants) {
    const name = participant.name.trim().toLowerCase();
    if (!csvByName.has(name)) csvByName.set(name, participant);
  }

  const currentNames = new Set(participants.map(({ name }) => name.trim().toLowerCase()));
  const added = [...csvByName.entries()]
    .filter(([name]) => !currentNames.has(name))
    .map(([, participant]) => participant);
  const removed = participants.filter(({ name }) => !csvByName.has(name.trim().toLowerCase()));
  const removedIds = new Set(removed.map(({ id }) => id));
  const removedShifts = shifts.filter(({ volunteerId }) => removedIds.has(volunteerId));
  const unchanged = participants.filter(({ id }) => !removedIds.has(id));

  return { added, removed, removedShifts, unchanged };
}
