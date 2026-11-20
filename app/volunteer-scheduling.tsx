import type { FormEvent } from "react";

const roles = ["Check-In Desk", "Event Setup", "Food Service", "Event Cleanup"];

type Participant = { id: number; name: string };

export type Shift = {
  id: number;
  volunteerId: number;
  role: string;
  startTime: string;
  endTime: string;
};

const fieldClass = "mt-2 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-teal-700";

export type Schedule = { shifts: Shift[]; error: string };

export default function VolunteerScheduling({
  participants,
  schedule: { shifts, error },
  setSchedule,
}: {
  participants: Participant[];
  schedule: Schedule;
  setSchedule: (update: (current: Schedule) => Schedule) => void;
}) {
  function addShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const volunteerId = Number(form.get("volunteer"));
    const volunteer = participants.find(({ id }) => id === volunteerId);
    const role = String(form.get("role"));
    const startTime = String(form.get("startTime") ?? "");
    const endTime = String(form.get("endTime") ?? "");

    if (!volunteer || !roles.includes(role) || !startTime || !endTime) {
      setSchedule((current) => ({ ...current, error: "Choose a volunteer, a role, and both shift times." }));
      return;
    }

    if (endTime <= startTime) {
      setSchedule((current) => ({ ...current, error: "End time must be later than start time." }));
      return;
    }

    setSchedule((current) => {
      // Time inputs provide zero-padded HH:mm values that sort in time order.
      const hasConflict = current.shifts.some(
        (shift) =>
          shift.volunteerId === volunteerId &&
          startTime < shift.endTime &&
          shift.startTime < endTime,
      );

      if (hasConflict) {
        return { ...current, error: `${volunteer.name} already has a shift that overlaps these times.` };
      }

      const id = (current.shifts.at(-1)?.id ?? 0) + 1;
      return {
        shifts: [...current.shifts, { id, volunteerId, role, startTime, endTime }],
        error: "",
      };
    });
  }

  function deleteShift(id: number) {
    setSchedule((current) => ({
      shifts: current.shifts.filter((shift) => shift.id !== id),
      error: "",
    }));
  }

  return (
    <section aria-labelledby="scheduling-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="px-4 py-5 sm:px-6">
        <h2 id="scheduling-heading" className="text-lg font-semibold">Volunteer Scheduling</h2>
        <p className="mt-1 text-sm text-slate-600">All shifts take place on the event date in Pacific Time.</p>

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
            className="mt-4 min-h-10 rounded-lg bg-teal-800 px-3 text-sm font-medium text-white hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
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
                <td colSpan={5} className="px-4 py-6 text-slate-600 sm:px-6">No shifts scheduled yet.</td>
              </tr>
            )}
            {shifts.map((shift) => {
              const volunteer = participants.find(({ id }) => id === shift.volunteerId);
              return (
                <tr key={shift.id}>
                  <th scope="row" className="px-4 py-3 font-medium [overflow-wrap:anywhere] sm:px-6">{volunteer?.name}</th>
                  <td className="px-4 py-3">{shift.role}</td>
                  <td className="px-4 py-3 tabular-nums"><time>{shift.startTime}</time></td>
                  <td className="px-4 py-3 tabular-nums"><time>{shift.endTime}</time></td>
                  <td className="px-4 py-3 text-right sm:px-6">
                    <button
                      type="button"
                      aria-label={`Delete ${volunteer?.name}'s ${shift.startTime} shift`}
                      onClick={() => deleteShift(shift.id)}
                      className="min-h-10 rounded-lg border border-slate-300 px-3 font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
