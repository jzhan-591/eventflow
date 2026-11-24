import type { Metadata } from "next";
import Link from "next/link";
import { parseParticipantCsv, serializeParticipantCsv } from "../participant-csv";
import { previewParticipantSync } from "../participant-sync";
import { sampleEvent, sampleParticipants, sampleShifts, sampleSyncCsv } from "./sample-data";

export const metadata: Metadata = {
  title: "EventFlow Demo",
  description: "Explore EventFlow with a sample participant roster and volunteer schedule.",
};

const card = "overflow-hidden rounded-2xl border border-slate-200 bg-white";
const cell = "px-4 py-3 sm:px-6";
const disabledButton = "rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 disabled:cursor-not-allowed";
const outlineButton = "inline-flex min-h-10 items-center rounded-lg border border-teal-800 px-3 text-sm font-medium text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700";

export default function DemoPage() {
  const checkedInCount = sampleParticipants.filter(({ checked_in }) => checked_in).length;
  const preview = previewParticipantSync(sampleParticipants, sampleShifts, parseParticipantCsv(sampleSyncCsv));
  const exportUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(serializeParticipantCsv(sampleParticipants))}`;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-5 sm:px-8">
          <span aria-hidden="true" className="grid size-9 place-items-center rounded-lg bg-teal-800 font-bold text-white">✓</span>
          <h1 className="text-xl font-bold tracking-tight">EventFlow</h1>
          <Link href="/login" prefetch={false} className={`ml-auto ${outlineButton}`}>
            Log In
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-8 sm:py-10">
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-teal-950 sm:px-6">
          <h2 className="font-semibold">Demo Mode — Sample Data</h2>
          <p className="mt-1 text-sm">Explore a read-only example of the event dashboard.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <section aria-labelledby="event-heading" className="rounded-2xl bg-teal-950 p-6 text-white sm:p-7">
            <h2 id="event-heading" className="text-sm font-semibold text-teal-200">Dashboard Overview</h2>
            <p className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{sampleEvent.title}</p>
            <p className="mt-4 text-sm text-teal-100">
              <time dateTime={sampleEvent.dateTime}>{sampleEvent.dateLabel}</time>
            </p>
            <p className="mt-1 text-sm text-teal-100">{sampleEvent.location}</p>
          </section>

          <section aria-labelledby="progress-heading" className={`${card} flex flex-col justify-center p-6`}>
            <h2 id="progress-heading" className="text-sm font-semibold text-slate-600">Check-In Progress</h2>
            <p className="mt-2 text-sm text-slate-600">
              <span className="mr-2 text-3xl font-semibold tracking-tight text-slate-950">{checkedInCount} of {sampleParticipants.length}</span>
              {" "}checked in
            </p>
            <progress
              aria-labelledby="progress-heading"
              value={checkedInCount}
              max={sampleParticipants.length}
              className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100 [&::-moz-progress-bar]:bg-teal-700 [&::-webkit-progress-bar]:bg-slate-100 [&::-webkit-progress-value]:bg-teal-700"
            />
          </section>
        </div>

        <section aria-labelledby="participants-heading" className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
            <h2 id="participants-heading" className="text-lg font-semibold">Participants</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled className={disabledButton}>Add Participant</button>
              <button type="button" disabled className={disabledButton}>Import CSV</button>
              <a href={exportUrl} download="eventflow-demo-participants.csv" className={outlineButton}>Export CSV</a>
            </div>
          </div>
          <details className="px-4 pb-4 text-sm text-slate-600 sm:px-6">
            <summary className="w-fit cursor-pointer font-medium text-teal-800">View sample CSV for import</summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-3">{sampleSyncCsv}</pre>
          </details>
          <table aria-labelledby="participants-heading" className="w-full text-left text-sm">
            <thead className="border-y border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th scope="col" className={cell}>Name</th>
                <th scope="col" className={cell}>Status</th>
                <th scope="col" className={`${cell} text-right`}>Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sampleParticipants.map(({ id, name, checked_in }) => (
                <tr key={id}>
                  <th scope="row" className={`${cell} font-medium`}>{name}</th>
                  <td className={cell}>
                    <span className={`inline-block rounded-full px-2.5 py-1 font-medium ${checked_in ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-700"}`}>
                      {checked_in ? "Checked In" : "Not Checked In"}
                    </span>
                  </td>
                  <td className={`${cell} text-right`}>
                    <button type="button" disabled className={disabledButton} aria-label={`Check in ${name}`}>Check In</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section aria-labelledby="sync-heading" className={`${card} p-4 sm:p-6`}>
          <h2 id="sync-heading" className="text-lg font-semibold">CSV Sync Preview</h2>
          <p className="mt-1 text-sm text-slate-600">Compare the sample CSV with the sample roster.</p>
          <div className="mt-4 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-3">
            <div>
              <h3 className="font-semibold">New Participants ({preview.added.length})</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">{preview.added.map(({ name }) => <li key={name}>{name}</li>)}</ul>
            </div>
            <div>
              <h3 className="font-semibold">Unchanged Participants ({preview.unchanged.length})</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">{preview.unchanged.map(({ id, name }) => <li key={id}>{name}</li>)}</ul>
            </div>
            <div>
              <h3 className="font-semibold">Participants to Remove ({preview.removed.length})</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">{preview.removed.map(({ id, name }) => <li key={id}>{name}</li>)}</ul>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
            <h3 className="font-semibold">Volunteer Shifts to Remove ({preview.removedShifts.length})</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {preview.removedShifts.map(({ id, volunteerName, role, startTime, endTime }) => (
                <li key={id}>{volunteerName} · {role} · {startTime}–{endTime}</li>
              ))}
            </ul>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" disabled className={disabledButton}>Confirm Sync</button>
            <p className="text-sm text-slate-600">Confirmation is disabled in this read-only demo.</p>
          </div>
        </section>

        <section aria-labelledby="schedule-heading" className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
            <h2 id="schedule-heading" className="text-lg font-semibold">Volunteer Scheduling</h2>
            <button type="button" disabled className={disabledButton}>Add Shift</button>
          </div>
          <div role="region" aria-labelledby="schedule-heading" tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-teal-700">
            <table className="w-full text-left text-sm">
              <thead className="border-y border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th scope="col" className={cell}>Volunteer</th>
                  <th scope="col" className={cell}>Role</th>
                  <th scope="col" className={`${cell} whitespace-nowrap`}>Start Time</th>
                  <th scope="col" className={`${cell} whitespace-nowrap`}>End Time</th>
                  <th scope="col" className={`${cell} text-right`}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sampleShifts.map(({ id, volunteerName, role, startTime, endTime }) => (
                  <tr key={id}>
                    <th scope="row" className={`${cell} font-medium`}>{volunteerName}</th>
                    <td className={cell}>{role}</td>
                    <td className={cell}><time>{startTime}</time></td>
                    <td className={cell}><time>{endTime}</time></td>
                    <td className={`${cell} text-right`}>
                      <button type="button" disabled className={disabledButton} aria-label={`Delete ${volunteerName}'s ${startTime} shift`}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
