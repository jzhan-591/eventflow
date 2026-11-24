import "server-only";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getCurrentEvent } from "../events/current";
import { parseParticipantCsv } from "../participant-csv";
import { previewParticipantSync } from "../participant-sync";
import { readShifts } from "../shifts/data";
import { readParticipants } from "./data";
import { participantIdForName, participantNameKey } from "./write";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function readParticipantSyncPlan(eventId: string, text: string) {
  if (typeof eventId !== "string" || !uuidPattern.test(eventId)) {
    return { error: "Choose a valid event before syncing." };
  }
  if (typeof text !== "string" || !text.trim() || text.includes("\0")) {
    return { error: "Choose a nonempty CSV file with valid text." };
  }
  const { supabase, error, ownerId } = await getCurrentEvent(eventId);
  if (!supabase) return { error: error ?? "We couldn't verify this event." };

  const incoming = new Map<string, ReturnType<typeof parseParticipantCsv>[number]>();
  try {
    for (const row of parseParticipantCsv(text)) {
      const key = participantNameKey(row.name);
      const previous = incoming.get(key);
      if (previous && previous.checkedIn !== row.checkedIn) {
        return { error: `The CSV lists conflicting statuses for ${row.name}. Keep one status and upload it again.` };
      }
      if (!previous) incoming.set(key, row);
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The CSV could not be parsed." };
  }

  if (incoming.size === 0) return { error: "The CSV must contain at least one participant to sync." };

  const [roster, schedule] = await Promise.all([
    readParticipants(supabase, eventId),
    readShifts(supabase, eventId),
  ]);
  if (roster.error || schedule.error) {
    return { error: "We couldn't load the saved roster and shifts for sync." };
  }

  const names = new Set(roster.participants.map(({ name }) => participantNameKey(name)));
  if (names.size !== roster.participants.length) {
    return { error: "The saved roster contains duplicate names. Resolve them before syncing." };
  }

  const preview = previewParticipantSync(roster.participants, schedule.shifts, [...incoming.values()]);
  const byId = ([left]: [string, unknown], [right]: [string, unknown]) => left.localeCompare(right);
  return {
    supabase,
    preview,
    plan: {
      owner_id: ownerId,
      event_id: eventId,
      csv_sha256: createHash("sha256").update(text, "utf8").digest("hex"),
      removals: preview.removed.map(({ id }) => id).sort(),
      additions: preview.added.map(({ name, checkedIn }) => ({
        id: participantIdForName(eventId, name),
        full_name: name,
        checked_in: checkedIn,
      })),
      expected: {
        participants: Object.fromEntries(roster.participants.map(
          ({ id, name, checked_in }): [string, unknown] => [id, [name, checked_in]],
        ).sort(byId)),
        shifts: Object.fromEntries(Object.entries(schedule.versions).sort(byId)),
      },
    },
  };
}

type Plan = NonNullable<Awaited<ReturnType<typeof readParticipantSyncPlan>>["plan"]>;
const receiptLifetimeSeconds = 600;
const previewDomain = "eventflow:sync:preview:v1:";
const confirmDomain = "eventflow:sync:confirm:v1:";

function signingKey() {
  const key = process.env.EVENTFLOW_SYNC_SIGNING_KEY;
  return key && /^[a-f0-9]{64}$/i.test(key) ? Buffer.from(key, "hex") : null;
}

function manifest(plan: Plan, expiresAt: number, nonce: string) {
  return JSON.stringify({ version: 1, ...plan, expires_at: expiresAt, nonce });
}

function sign(key: Buffer, domain: string, body: string) {
  return createHmac("sha256", key).update(domain + body, "utf8").digest("hex");
}

export function makePreviewReceipt(plan: Plan) {
  const key = signingKey();
  if (!key) return null;

  const expiresAt = Math.floor(Date.now() / 1000) + receiptLifetimeSeconds;
  const nonce = randomUUID();
  const tag = sign(key, previewDomain, manifest(plan, expiresAt, nonce));
  return `${expiresAt}.${nonce}.${tag}`;
}

// Keep the verified client and the write signature inside the server.
export async function buildConfirmedSyncRequest(eventId: string, text: string, receipt: string) {
  const key = signingKey();
  if (!key) return { error: "Database sync signing is unavailable." };
  if (typeof receipt !== "string" || receipt.length > 120) {
    return { error: "The sync preview is invalid. Upload the CSV again." };
  }

  const [expiry, nonce, tag, extra] = receipt.split(".");
  if (extra !== undefined || !/^\d{1,12}$/.test(expiry) || !uuidPattern.test(nonce) || !/^[a-f0-9]{64}$/.test(tag)) {
    return { error: "The sync preview is invalid. Upload the CSV again." };
  }
  const expiresAt = Number(expiry);
  if (expiresAt <= Math.floor(Date.now() / 1000)) {
    return { error: "The sync preview expired. Upload the CSV again." };
  }

  // Reverify identity, reparse the original CSV, and reread the saved snapshot.
  const result = await readParticipantSyncPlan(eventId, text);
  if (!result.plan || !result.supabase) return { error: result.error };

  const body = manifest(result.plan, expiresAt, nonce);
  const expectedTag = sign(key, previewDomain, body);
  if (!timingSafeEqual(Buffer.from(tag, "hex"), Buffer.from(expectedTag, "hex"))) {
    return { error: "The CSV, saved roster, or shifts changed. Upload the CSV again for a fresh preview." };
  }

  return {
    supabase: result.supabase,
    rpcArgs: { p_manifest: body, p_signature: sign(key, confirmDomain, body) },
  };
}
