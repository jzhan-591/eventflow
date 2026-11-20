"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { parseParticipantCsv } from "./participant-csv";

const initialParticipants = [
  { id: 1, name: "Avery Morgan" },
  { id: 2, name: "Jordan Lee" },
  { id: 3, name: "Taylor Brooks" },
  { id: 4, name: "Cameron Patel" },
  { id: 5, name: "Riley Chen" },
];

export default function Dashboard() {
  const [{ participants, checkedInIds, importMessage }, setRoster] = useState({
    participants: initialParticipants,
    checkedInIds: [] as number[],
    importMessage: "",
  });
  const [participantName, setParticipantName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [nameError, setNameError] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const csvInput = useRef<HTMLInputElement>(null);

  const checkedInCount = checkedInIds.length;
  const total = participants.length;
  const searchName = searchQuery.trim().toLowerCase();
  const visibleParticipants = participants.filter((participant) =>
    participant.name.toLowerCase().includes(searchName),
  );

  function addParticipant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = participantName.trim().replace(/\s+/g, " ");

    if (!name) {
      setNameError("Enter a participant name.");
      return;
    }

    const nameExists = participants.some(
      (participant) => participant.name.toLowerCase() === name.toLowerCase(),
    );

    if (nameExists) {
      setNameError("A participant with this name is already on the list.");
      return;
    }

    setRoster((current) => ({
      ...current,
      participants: [
        ...current.participants,
        { id: current.participants.length + 1, name },
      ],
    }));
    setParticipantName("");
    setNameError("");
    setSearchQuery("");
  }

  function checkIn(id: number) {
    setRoster((current) =>
      current.checkedInIds.includes(id)
        ? current
        : { ...current, checkedInIds: [...current.checkedInIds, id] },
    );
  }

  async function importParticipantsCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setRoster((current) => ({ ...current, importMessage: "Choose a .csv file to import." }));
      return;
    }

    setIsImporting(true);
    try {
      const text = await file.text().catch(() => {
        throw new Error("The file could not be read. Select the CSV file and try again.");
      });
      const importedParticipants = parseParticipantCsv(text);

      setRoster((current) => {
        const names = new Set(
          current.participants.map(({ name }) => name.trim().toLowerCase()),
        );
        const participants = [...current.participants];
        const checkedInIds = [...current.checkedInIds];
        let added = 0;
        let duplicates = 0;

        for (const participant of importedParticipants) {
          const nameKey = participant.name.toLowerCase();
          if (names.has(nameKey)) {
            duplicates++;
            continue;
          }

          names.add(nameKey);
          const id = participants.length + 1;
          participants.push({ id, name: participant.name });
          if (participant.checkedIn) checkedInIds.push(id);
          added++;
        }

        return {
          participants,
          checkedInIds,
          importMessage: `Import complete. Added: ${added}. Duplicates skipped: ${duplicates}.`,
        };
      });
    } catch (error) {
      setRoster((current) => ({
        ...current,
        importMessage: error instanceof Error ? error.message : "The CSV could not be imported.",
      }));
    } finally {
      setIsImporting(false);
    }
  }

  function exportParticipantsCsv() {
    if (participants.length === 0) {
      setExportMessage("There are no participants to export. Add a participant first.");
      return;
    }

    setExportMessage("");
    const rows = participants.map(({ id, name }) => {
      // Quoted CSV fields preserve commas and newlines. Double any quotes inside.
      const csvName = `"${name.replace(/"/g, '""')}"`;
      const status = checkedInIds.includes(id) ? "Checked In" : "Not Checked In";
      return `${csvName},${status}`;
    });
    const csv = ["Name,Status", ...rows].join("\r\n") + "\r\n";
    const file = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = "eventflow-participants.csv";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-5 sm:px-8">
          <span aria-hidden="true" className="grid size-9 place-items-center rounded-lg bg-teal-800 font-bold text-white">
            ✓
          </span>
          <h1 className="text-xl font-bold tracking-tight">EventFlow</h1>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-8 sm:py-10">
        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <section aria-labelledby="event-heading" className="rounded-2xl bg-teal-950 p-6 text-white sm:p-7">
            <h2 id="event-heading" className="text-sm font-semibold text-teal-200">
              Event Overview
            </h2>
            <p className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Community Volunteer Day
            </p>
            <p className="mt-4 text-sm text-teal-100">
              <time dateTime="2026-12-05T09:00:00-08:00">Saturday, December 5, 2026 · 9:00 AM PT</time>
            </p>
            <p className="mt-1 text-sm text-teal-100">Maplewood Community Center · Seattle, WA</p>
          </section>

          <section aria-labelledby="progress-heading" className="flex flex-col justify-center rounded-2xl border border-slate-200 bg-white p-6">
            <h2 id="progress-heading" className="text-sm font-semibold text-slate-600">
              Check-In Progress
            </h2>
            <p role="status" className="mt-2 text-sm text-slate-600">
              <span className="mr-2 text-3xl font-semibold tabular-nums tracking-tight text-slate-950">
                {checkedInCount} of {total}
              </span>
              {" "}checked in
            </p>
            <progress
              aria-labelledby="progress-heading"
              className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100 [&::-moz-progress-bar]:bg-teal-700 [&::-webkit-progress-bar]:bg-slate-100 [&::-webkit-progress-value]:bg-teal-700"
              value={checkedInCount}
              max={total}
            />
          </section>
        </div>

        <section aria-labelledby="participants-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
            <h2 id="participants-heading" className="text-lg font-semibold">
              Participants
            </h2>
            <div className="flex flex-wrap gap-2">
              <input
                ref={csvInput}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={importParticipantsCsv}
              />
              <button
                type="button"
                onClick={() => csvInput.current?.click()}
                disabled={isImporting}
                className="min-h-10 rounded-lg border border-teal-800 px-3 text-sm font-medium text-teal-800 enabled:hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-60"
              >
                {isImporting ? "Importing…" : "Import CSV"}
              </button>
              <button
                type="button"
                onClick={exportParticipantsCsv}
                className="min-h-10 rounded-lg border border-teal-800 px-3 text-sm font-medium text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                Export CSV
              </button>
            </div>
          </div>
          <p role="status" className={importMessage ? "px-4 pb-4 text-sm text-slate-600 sm:px-6" : "sr-only"}>
            {importMessage}
          </p>
          <p role="status" className={exportMessage ? "px-4 pb-4 text-sm text-slate-600 sm:px-6" : "sr-only"}>
            {exportMessage}
          </p>
          <div className="grid gap-5 px-4 pb-5 sm:grid-cols-[3fr_2fr] sm:px-6">
            <form onSubmit={addParticipant}>
              <label htmlFor="participant-name" className="block text-sm font-medium text-slate-700">
                Participant Name
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  id="participant-name"
                  type="text"
                  value={participantName}
                  onChange={(event) => {
                    setParticipantName(event.target.value);
                    setNameError("");
                  }}
                  placeholder="Enter a full name"
                  aria-invalid={Boolean(nameError)}
                  aria-describedby={nameError ? "participant-name-error" : undefined}
                  className="min-h-10 min-w-36 flex-1 rounded-lg border border-slate-300 px-3 text-sm focus-visible:outline-2 focus-visible:outline-teal-700 aria-invalid:border-red-600"
                />
                <button
                  type="submit"
                  className="min-h-10 rounded-lg bg-teal-800 px-3 text-sm font-medium text-white hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                >
                  Add Participant
                </button>
              </div>
              {nameError && (
                <p id="participant-name-error" role="alert" className="mt-2 text-sm text-red-700">
                  {nameError}
                </p>
              )}
            </form>

            <div>
              <label htmlFor="participant-search" className="block text-sm font-medium text-slate-700">
                Search Participants
              </label>
              <input
                id="participant-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by name"
                className="mt-2 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus-visible:outline-2 focus-visible:outline-teal-700"
              />
            </div>
          </div>
          <table aria-labelledby="participants-heading" className="w-full text-left text-sm">
            <thead className="border-y border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th scope="col" className="px-3 py-3 font-semibold sm:px-6">Name</th>
                <th scope="col" className="px-2 py-3 font-semibold sm:px-6">Status</th>
                <th scope="col" className="px-3 py-3 text-right font-semibold sm:px-6">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleParticipants.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-slate-600 sm:px-6">
                    No participants match your search.
                  </td>
                </tr>
              )}
              {visibleParticipants.map((participant) => {
                const isCheckedIn = checkedInIds.includes(participant.id);

                return (
                  <tr key={participant.id}>
                    <th scope="row" className="px-3 py-3 font-medium [overflow-wrap:anywhere] sm:px-6">
                      {participant.name}
                    </th>
                    <td className="px-2 py-3 sm:px-6">
                      <span className={isCheckedIn
                        ? "inline-block rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800"
                        : "inline-block rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                      }>
                        {isCheckedIn ? "Checked In" : "Not Checked In"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right sm:px-6">
                      <button
                        type="button"
                        aria-label={`Check in ${participant.name}`}
                        disabled={isCheckedIn}
                        onClick={() => checkIn(participant.id)}
                        className="min-h-10 whitespace-nowrap rounded-lg bg-teal-800 px-3 text-sm font-medium text-white enabled:hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:bg-slate-100 disabled:text-slate-500"
                      >
                        Check In
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
