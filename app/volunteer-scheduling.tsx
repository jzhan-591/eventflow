import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import type { Participant } from "./participants/data";
import { removeShift, saveShift } from "./shifts/actions";
import { roles, validateShiftTimes, type Shift } from "./shifts/model";

const fieldClass = "mt-2 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-teal-700";

export default function VolunteerScheduling({
  eventId,
  participants,
  shifts,
  setShifts,
  isRosterBusy,
  beginMutation,
  finishMutation,
  shiftLoadFailed,
}: {
  eventId: string | null;
  participants: Participant[];
  shifts: Shift[];
  setShifts: Dispatch<SetStateAction<Shift[]>>;
  isRosterBusy: boolean;
  beginMutation: () => boolean;
  finishMutation: () => void;
  shiftLoadFailed: boolean;
}) {
  const [error, setError] = useState("");

  async function addShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!eventId || isRosterBusy || shiftLoadFailed) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const volunteerId = String(form.get("volunteer") ?? "");
    const volunteer = participants.find(({ id }) => id === volunteerId);
    const role = String(form.get("role") ?? "");
    const startTime = String(form.get("startTime") ?? "");
    const endTime = String(form.get("endTime") ?? "");

    if (!volunteer || !roles.includes(role)) {
      setError("Choose a saved volunteer and a role.");
      return;
    }

    const timeError = validateShiftTimes(startTime, endTime);
    if (timeError) {
      setError(timeError);
      return;
    }

    const hasConflict = shifts.some((shift) =>
      shift.volunteerId === volunteerId &&
      startTime < shift.endTime &&
      shift.startTime < endTime,
    );
    if (hasConflict) {
      setError(`${volunteer.name} already has a shift that overlaps these times.`);
      return;
    }

    if (!beginMutation()) return;
    setError("");
    try {
      const result = await saveShift(eventId, volunteerId, role, startTime, endTime);
      const shift = result.shift;
      if (!shift) {
        setError(result.error ?? "We couldn't save the shift. Try again.");
        return;
      }

      setShifts((current) => [...current, shift].sort((a, b) => a.startTime.localeCompare(b.startTime)));
      formElement.reset();
    } catch {
      setError("We couldn't save the shift. Try again.");
    } finally {
      finishMutation();
    }
  }

  async function deleteShift(id: string) {
    if (!eventId || isRosterBusy || !beginMutation()) return;

    setError("");
    try {
      const result = await removeShift(eventId, id);
      if (!result.ok) {
        setError(result.error ?? "We couldn't delete the shift. Try again.");
        return;
      }
      setShifts((current) => current.filter((shift) => shift.id !== id));
    } catch {
      setError("We couldn't delete the shift. Try again.");
    } finally {
      finishMutation();
    }
  }

  return (
    <section aria-labelledby="scheduling-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="px-4 py-5 sm:px-6">
        <h2 id="scheduling-heading" className="text-lg font-semibold">Volunteer Scheduling</h2>
        <p className="mt-1 text-sm text-slate-600">Shifts use Pacific Time on the event date. Only saved participants can be scheduled.</p>

        {shiftLoadFailed && (
          <p role="alert" className="mt-3 text-sm text-red-700">We couldn&apos;t load saved shifts. Refresh the page to try again.</p>
        )}

        <form onSubmit={addShift} noValidate className="mt-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_2fr_1fr_1fr]">
            <label className="min-w-0 text-sm font-medium text-slate-700">
              Volunteer
              <select name="volunteer" defaultValue="" required className={fieldClass}>
                <option value="" disabled>Select a volunteer</option>
                {participants.map(({ id, name }) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </label>

            <label className="min-w-0 text-sm font-medium text-slate-700">
              Role
              <select name="role" defaultValue="" required className={fieldClass}>
                <option value="" disabled>Select a role</option>
                {roles.map((role) => <option key={role}>{role}</option>)}
              </select>
            </label>

            <label className="text-sm font-medium text-slate-700">
              Start Time
              <input name="startTime" type="time" required className={fieldClass} />
            </label>

            <label className="text-sm font-medium text-slate-700">
              End Time
              <input name="endTime" type="time" required className={fieldClass} />
            </label>
          </div>

          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={!eventId || participants.length === 0 || isRosterBusy || shiftLoadFailed}
            className="mt-4 min-h-10 rounded-lg bg-teal-800 px-3 text-sm font-medium text-white enabled:hover:bg-teal-900 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            Add Shift
          </button>
        </form>
      </div>

      <div className="overflow-x-auto">
        <table aria-labelledby="scheduling-heading" className="w-full text-left text-sm">
          <thead className="border-y border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold sm:px-6">Volunteer</th>
              <th scope="col" className="px-4 py-3 font-semibold">Role</th>
              <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">Start Time</th>
              <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">End Time</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold sm:px-6">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shifts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-slate-600 sm:px-6">{shiftLoadFailed ? "Saved shifts are unavailable." : "No shifts scheduled yet."}</td>
              </tr>
            )}
            {shifts.map((shift) => (
              <tr key={shift.id}>
                <th scope="row" className="px-4 py-3 font-medium [overflow-wrap:anywhere] sm:px-6">{shift.volunteerName}</th>
                <td className="px-4 py-3">{shift.role}</td>
                <td className="px-4 py-3 tabular-nums"><time>{shift.startTime}</time></td>
                <td className="px-4 py-3 tabular-nums"><time>{shift.endTime}</time></td>
                <td className="px-4 py-3 text-right sm:px-6">
                  <button
                    type="button"
                    aria-label={`Delete ${shift.volunteerName}'s ${shift.startTime} shift`}
                    onClick={() => deleteShift(shift.id)}
                    disabled={isRosterBusy}
                    className="min-h-10 rounded-lg border border-slate-300 px-3 font-medium text-slate-700 enabled:hover:bg-slate-100 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
