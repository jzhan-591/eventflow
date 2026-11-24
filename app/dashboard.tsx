"use client";

import { useActionState, useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { logOut } from "./auth/actions";
import { saveCheckIn, saveParticipant } from "./participants/actions";
import { exportSavedParticipants, importSavedParticipants } from "./participants/csv-actions";
import type { Participant, SavedParticipant } from "./participants/data";
import { confirmParticipantSync, prepareParticipantSync } from "./participants/sync-actions";
import VolunteerScheduling from "./volunteer-scheduling";
import type { Shift } from "./shifts/model";

type SyncPreview = Extract<Awaited<ReturnType<typeof prepareParticipantSync>>, { preview: unknown }>;
type RosterOperation = "add-participant" | "check-in" | "import" | "preview" | "sync" | "shift";

export default function Dashboard({
  eventOverview,
  eventId,
  initialParticipants,
  participantLoadFailed,
  initialShifts,
  shiftLoadFailed,
}: {
  eventOverview: ReactNode;
  eventId: string | null;
  initialParticipants: SavedParticipant[];
  participantLoadFailed: boolean;
  initialShifts: Shift[];
  shiftLoadFailed: boolean;
}) {
  const [logoutState, submitLogout, isLoggingOut] = useActionState(logOut, {});
  const [{ participants, checkedInIds, importMessage }, setRoster] = useState({
    participants: initialParticipants as Participant[],
    checkedInIds: initialParticipants.filter(({ checked_in }) => checked_in).map(({ id }) => id),
    importMessage: "",
  });
  const [shifts, setShifts] = useState(initialShifts);
  const [participantName, setParticipantName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [nameError, setNameError] = useState("");
  const [rosterOperation, setOperation] = useState<{ operation: RosterOperation | "reload-required" | null }>({ operation: null });
  const { operation } = rosterOperation;
  const rosterLocked = useRef(false);
  const [pendingCheckIn, setPendingCheckIn] = useState<string | null>(null);
  const [checkInError, setCheckInError] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const csvInput = useRef<HTMLInputElement>(null);
  const syncInput = useRef<HTMLInputElement>(null);
  const [syncFile, setSyncFile] = useState<(SyncPreview & { text: string }) | null>(null);
  const [syncMessage, setSyncMessage] = useState("");
  const syncPreview = syncFile?.preview;
  const isRosterBusy = operation !== null;
  const isSavingParticipant = operation === "add-participant";
  const isImporting = operation === "import";
  const isReadingSync = operation === "preview";

  useLayoutEffect(() => {
    // Release the lock after React has committed the roster and schedule updates.
    if (rosterOperation.operation === null) rosterLocked.current = false;
  }, [rosterOperation]);

  function beginOperation(nextOperation: RosterOperation) {
    if (rosterLocked.current) return false;
    rosterLocked.current = true;
    setOperation({ operation: nextOperation });
    return true;
  }

  function finishOperation(reloadRequired = false) {
    setOperation({ operation: reloadRequired ? "reload-required" : null });
  }

  const checkedInCount = checkedInIds.length;
  const total = participants.length;
  const searchName = searchQuery.trim().toLowerCase();
  const visibleParticipants = participants.filter((participant) =>
    participant.name.toLowerCase().includes(searchName),
  );

  async function addParticipant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!eventId || participantLoadFailed || rosterLocked.current) return;
    const name = participantName.trim().replace(/\s+/g, " ");

    if (!name) {
      setNameError("Enter a participant name.");
      return;
    }

    const nameExists = participants.some(
      (participant) => participant.name.trim().toLowerCase() === name.toLowerCase(),
    );

    if (nameExists) {
      setNameError("A participant with this name is already on the list.");
      return;
    }

    if (!beginOperation("add-participant")) return;
    setNameError("");
    try {
      const result = await saveParticipant(eventId, name);
      if (!result.participant) {
        setNameError(result.error ?? "We couldn't save the participant. Try again.");
        return;
      }

      const { id, name: savedName } = result.participant;
      setRoster((current) => ({
        ...current,
        participants: [...current.participants, { id, name: savedName }],
      }));
      setParticipantName("");
      setSearchQuery("");
    } catch {
      setNameError("We couldn't save the participant. Try again.");
    } finally {
      finishOperation();
    }
  }

  async function checkIn(id: string) {
    if (!eventId || checkedInIds.includes(id) || !beginOperation("check-in")) return;
    setCheckInError("");
    setPendingCheckIn(id);
    try {
      const result = await saveCheckIn(eventId, id);
      if (!result.ok) {
        setCheckInError(result.error ?? "We couldn't check in this participant. Try again.");
        return;
      }
      setRoster((current) => current.checkedInIds.includes(id)
        ? current
        : { ...current, checkedInIds: [...current.checkedInIds, id] });
    } catch {
      setCheckInError("We couldn't check in this participant. Try again.");
      return;
    } finally {
      setPendingCheckIn(null);
      finishOperation();
    }
  }

  async function importParticipantsCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !eventId || rosterLocked.current) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setRoster((current) => ({ ...current, importMessage: "Choose a .csv file to import." }));
      return;
    }

    if (!beginOperation("import")) return;
    try {
      const text = await file.text().catch(() => {
        throw new Error("The file could not be read. Select the CSV file and try again.");
      });
      const result = await importSavedParticipants(eventId, text);
      if (!result.added) {
        setRoster((current) => ({ ...current, importMessage: result.error ?? "The CSV could not be imported." }));
        return;
      }

      const { added, duplicates, failed, errors } = result;
      const summary = `Added: ${added.length}. Duplicates skipped: ${duplicates}. Failed: ${failed}.`;
      const details = errors.length ? ` Database errors: ${errors.join("; ")}` : "";
      setRoster((current) => ({
        ...current,
        participants: [...current.participants, ...added],
        checkedInIds: [...current.checkedInIds, ...added.filter(({ checked_in }) => checked_in).map(({ id }) => id)],
        importMessage: summary + details,
      }));
    } catch (error) {
      setRoster((current) => ({
        ...current,
        importMessage: error instanceof Error ? error.message : "The CSV could not be imported.",
      }));
    } finally {
      finishOperation();
    }
  }

  async function readSyncCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !eventId || rosterLocked.current) return;

    setSyncFile(null);
    setSyncMessage("");
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setSyncMessage("Choose a .csv file to sync.");
      return;
    }

    if (!beginOperation("preview")) return;
    try {
      const text = await file.text();
      const result = await prepareParticipantSync(eventId, text);
      if (!result.preview) {
        setSyncMessage(result.error ?? "We couldn't prepare the sync preview.");
        return;
      }
      setSyncFile({ ...result, text });
    } catch {
      setSyncMessage("The CSV could not be read for syncing.");
    } finally {
      finishOperation();
    }
  }

  async function confirmSync() {
    if (!eventId || !syncFile?.confirmEnabled || !syncFile.receipt || !beginOperation("sync")) return;

    let reloadRequired = false;
    setSyncMessage("");
    setSyncFile(null);
    try {
      const result = await confirmParticipantSync(eventId, syncFile.text, syncFile.receipt);
      if (!result.saved) {
        setSyncMessage(result.error ?? "We couldn't complete the sync.");
        return;
      }
      if (!result.participants || !result.shifts) {
        reloadRequired = true;
        setSyncMessage("Sync was saved. Reload the Dashboard to see the updated roster and shifts.");
        return;
      }
      const { participants: savedParticipants, shifts: savedShifts } = result;
      setRoster((current) => ({
        ...current,
        participants: savedParticipants,
        checkedInIds: savedParticipants.filter(({ checked_in }) => checked_in).map(({ id }) => id),
      }));
      setShifts(savedShifts);
      setSyncMessage("Participant list synced successfully.");
    } catch {
      setSyncMessage("We couldn't confirm whether the sync was saved. Reload the Dashboard and check the saved roster and shifts before trying again.");
    } finally {
      finishOperation(reloadRequired);
    }
  }

  async function exportParticipantsCsv() {
    if (!eventId || isExporting) return;

    setExportMessage("");
    setIsExporting(true);
    try {
      const result = await exportSavedParticipants(eventId);
      if (!result.csv) {
        setExportMessage(result.error ?? "The CSV could not be exported.");
        return;
      }

      const file = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const downloadUrl = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = "eventflow-participants.csv";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
    } catch {
      setExportMessage("The CSV could not be exported. Try again.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-5 sm:px-8">
          <span aria-hidden="true" className="grid size-9 place-items-center rounded-lg bg-teal-800 font-bold text-white">
            ✓
          </span>
          <h1 className="text-xl font-bold tracking-tight">EventFlow</h1>
          <form action={submitLogout} className="ml-auto text-right">
            <button
              type="submit"
              disabled={isLoggingOut}
              className="min-h-10 rounded-lg border border-teal-800 px-3 text-sm font-medium text-teal-800 enabled:hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-60"
            >
              {isLoggingOut ? "Logging out…" : "Log Out"}
            </button>
            {logoutState.error && <p role="alert" className="mt-2 text-sm text-red-700">{logoutState.error}</p>}
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-8 sm:py-10">
        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          {eventOverview}

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
                max={Math.max(1, total)}
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
                disabled={!eventId || isRosterBusy}
                className="min-h-10 rounded-lg border border-teal-800 px-3 text-sm font-medium text-teal-800 enabled:hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-60"
              >
                {isImporting ? "Importing…" : "Import CSV"}
              </button>
              <button
                type="button"
                onClick={exportParticipantsCsv}
                disabled={!eventId || isExporting || isImporting}
                className="min-h-10 rounded-lg border border-teal-800 px-3 text-sm font-medium text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                {isExporting ? "Exporting…" : "Export CSV"}
              </button>
              <input
                ref={syncInput}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={readSyncCsv}
              />
              <button
                type="button"
                onClick={() => syncInput.current?.click()}
                disabled={!eventId || isRosterBusy}
                className="min-h-10 rounded-lg border border-teal-800 px-3 text-sm font-medium text-teal-800 enabled:hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-60"
              >
                {isReadingSync ? "Reading CSV…" : "Sync CSV"}
              </button>
            </div>
          </div>
          <p className="px-4 pb-4 text-sm text-slate-600 sm:px-6">
            Sync CSV compares your file with the saved roster. Review the changes before confirming.
          </p>
          {participantLoadFailed && (
            <p role="alert" className="px-4 pb-4 text-sm text-red-700 sm:px-6">
              We couldn&apos;t load saved participants. Refresh the page to try again.
            </p>
          )}
          {!eventId && (
            <p className="px-4 pb-4 text-sm text-slate-600 sm:px-6">
              An event is required to save participants.
            </p>
          )}
          {checkInError && <p role="alert" className="px-4 pb-4 text-sm text-red-700 sm:px-6">{checkInError}</p>}
          <p role="status" className={importMessage ? "px-4 pb-4 text-sm text-slate-600 sm:px-6" : "sr-only"}>
            {importMessage}
          </p>
          <p role="status" className={exportMessage ? "px-4 pb-4 text-sm text-slate-600 sm:px-6" : "sr-only"}>
            {exportMessage}
          </p>
          <p role="status" className={syncMessage ? "px-4 pb-4 text-sm text-slate-700 sm:px-6" : "sr-only"}>
            {syncMessage}
          </p>
          {syncFile && syncPreview && (
            <section aria-labelledby="sync-preview-heading" className="mx-4 mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:mx-6">
              <h3 id="sync-preview-heading" className="font-semibold">Sync Preview</h3>
              <details className="mt-2 text-sm text-slate-600">
                <summary className="cursor-pointer font-semibold">Unchanged Participants ({syncPreview.unchanged.length})</summary>
                {syncPreview.unchanged.length ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 [overflow-wrap:anywhere]">
                    {syncPreview.unchanged.map(({ id, name }) => <li key={id}>{name}</li>)}
                  </ul>
                ) : <p className="mt-2">None</p>}
              </details>
              <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <h4 className="font-semibold">New Participants ({syncPreview.added.length})</h4>
                  {syncPreview.added.length ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 [overflow-wrap:anywhere]">
                      {syncPreview.added.map(({ name }) => <li key={name}>{name}</li>)}
                    </ul>
                  ) : <p className="mt-2 text-slate-600">None</p>}
                </div>
                <div>
                  <h4 className="font-semibold">Participants to Remove ({syncPreview.removed.length})</h4>
                  {syncPreview.removed.length ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 [overflow-wrap:anywhere]">
                      {syncPreview.removed.map(({ id, name }) => <li key={id}>{name}</li>)}
                    </ul>
                  ) : <p className="mt-2 text-slate-600">None</p>}
                </div>
              </div>
              {syncPreview.removedShifts.length > 0 && (
                <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
                  <p className="font-semibold">Volunteer shifts to remove ({syncPreview.removedShifts.length}).</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 [overflow-wrap:anywhere]">
                    {syncPreview.removedShifts.map((shift) => (
                      <li key={shift.id}>
                        {syncPreview.removed.find(({ id }) => id === shift.volunteerId)?.name}
                        {" · "}{shift.role}{" · "}{shift.startTime}–{shift.endTime}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p role="status" className="mt-4 text-sm text-amber-950">
                {!syncFile.confirmEnabled
                  ? "Confirm Sync is disabled for this environment. You can preview or cancel."
                  : !syncFile.receipt
                    ? "Database sync signing is unavailable. You can preview or cancel."
                    : "Review the changes above. Confirm Sync will permanently remove any listed participants and shifts."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={confirmSync}
                  disabled={!syncFile.confirmEnabled || !syncFile.receipt || isRosterBusy}
                  className="min-h-10 rounded-lg bg-teal-800 px-3 text-sm font-medium text-white enabled:hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-60"
                >
                  Confirm Sync
                </button>
                <button
                  type="button"
                  onClick={() => setSyncFile(null)}
                  className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                >
                  Cancel
                </button>
              </div>
            </section>
          )}
          <div className="grid gap-5 px-4 pb-5 sm:grid-cols-[3fr_2fr] sm:px-6">
            <form onSubmit={addParticipant}>
              <label htmlFor="participant-name" className="block text-sm font-medium text-slate-700">
                Participant Name
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  id="participant-name"
                  type="text"
                  disabled={!eventId || participantLoadFailed || isRosterBusy}
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
                  disabled={!eventId || participantLoadFailed || isRosterBusy}
                  className="min-h-10 rounded-lg bg-teal-800 px-3 text-sm font-medium text-white enabled:hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-60"
                >
                  {isSavingParticipant ? "Saving…" : "Add Participant"}
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
                    {participantLoadFailed ? "Saved participants are unavailable."
                      : participants.length === 0 ? "No participants yet."
                      : "No participants match your search."}
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
                        disabled={isCheckedIn || isRosterBusy}
                        onClick={() => checkIn(participant.id)}
                        className="min-h-10 whitespace-nowrap rounded-lg bg-teal-800 px-3 text-sm font-medium text-white enabled:hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:bg-slate-100 disabled:text-slate-500"
                      >
                        {pendingCheckIn === participant.id ? "Checking in…" : "Check In"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <VolunteerScheduling
          eventId={eventId}
          participants={participants}
          shifts={shifts}
          setShifts={setShifts}
          isRosterBusy={isRosterBusy}
          beginMutation={() => beginOperation("shift")}
          finishMutation={finishOperation}
          shiftLoadFailed={shiftLoadFailed}
        />
      </main>
    </div>
  );
}
