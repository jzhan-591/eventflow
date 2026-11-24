"use server";

import { readShifts } from "../shifts/data";
import { readParticipants } from "./data";
import { buildConfirmedSyncRequest, makePreviewReceipt, readParticipantSyncPlan } from "./sync-plan";

const testSupabaseUrl = "https://akoxbhhvtdxaqtzgbzet.supabase.co";
const unknownOutcome = "We couldn't confirm whether the sync was saved. Reload the Dashboard and check the saved roster and shifts before trying again.";

function isConfirmSyncEnabled() {
  return process.env.EVENTFLOW_ENABLE_CONFIRM_SYNC === "true" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL === testSupabaseUrl;
}

export async function prepareParticipantSync(eventId: string, text: string) {
  const result = await readParticipantSyncPlan(eventId, text);
  if (!result.plan) return { error: result.error };

  const confirmEnabled = isConfirmSyncEnabled();
  return {
    preview: result.preview,
    confirmEnabled,
    receipt: confirmEnabled ? makePreviewReceipt(result.plan) : null,
  };
}

function syncRejection(code: string, message: string) {
  if (code === "PT409") {
    switch (message) {
      case "The sync confirmation has already been used.":
        return "This preview has already been used. Reload the Dashboard before preparing another sync.";
      case "The sync preview expired. Upload the CSV again.":
        return "The sync preview expired. Upload the CSV again.";
      case "Another operation is updating the roster or shifts. Wait a moment, then upload the CSV for a fresh preview.":
        return "Another operation is updating the roster or shifts. Wait a moment, then upload the CSV for a fresh preview.";
      default:
        return "The sync could not proceed with this preview. Reload the Dashboard and upload the CSV for a fresh preview.";
    }
  }
  if (["55P03", "40P01", "40001"].includes(code)) {
    return "The database is busy. Wait a moment, then upload the CSV for a fresh preview.";
  }
  if (code === "42501" || code === "PGRST301" || code === "PGRST303") {
    return "The database rejected the sync authorization. Check your session and event access.";
  }
  if (["PT412", "PT503", "PGRST202", "42883"].includes(code)) {
    return "Database sync is unavailable. Contact the application administrator.";
  }
  if (code.startsWith("23") || code === "22023") {
    return "The database rejected the sync. No changes from this confirmation were saved.";
  }
  return unknownOutcome;
}

export async function confirmParticipantSync(eventId: string, text: string, receipt: string) {
  if (!isConfirmSyncEnabled()) {
    return { error: "Confirm Sync is disabled for this environment." };
  }

  const request = await buildConfirmedSyncRequest(eventId, text, receipt).catch(() => null);
  if (!request) return { error: "We couldn't validate the sync preview. Upload the CSV again." };
  if (!request.rpcArgs) return { error: request.error ?? "The sync preview is invalid." };

  const { supabase, rpcArgs } = request;
  try {
    const { data, error } = await supabase.schema("public").rpc("sync_event_participants", rpcArgs);
    if (error) return { error: syncRejection(error.code, error.message) };
    if (data !== true) return { error: unknownOutcome };
  } catch {
    return { error: unknownOutcome };
  }

  try {
    const [roster, schedule] = await Promise.all([
      readParticipants(supabase, eventId),
      readShifts(supabase, eventId),
    ]);
    if (!roster.error && !schedule.error) {
      return { saved: true, participants: roster.participants, shifts: schedule.shifts };
    }
  } catch {
    // The RPC already confirmed the commit.
  }
  return { saved: true, reloadRequired: true };
}
