import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Dashboard from "./dashboard";
import { readEvent } from "./events/data";
import EventOverview from "./events/event-overview";
import { readParticipants } from "./participants/data";
import { readShifts } from "./shifts/data";

async function ProtectedDashboard() {
  // Supabase checks token expiration against the current time.
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims.sub) redirect("/login");

  const result = await readEvent(supabase, data.claims.sub);
  const eventId = result.data?.id ?? null;
  const roster = eventId ? await readParticipants(supabase, eventId) : null;
  const schedule = eventId ? await readShifts(supabase, eventId) : null;

  return (
    <Dashboard
      key={eventId}
      eventId={eventId}
      initialParticipants={roster?.participants ?? []}
      participantLoadFailed={Boolean(roster?.error)}
      initialShifts={schedule?.shifts ?? []}
      shiftLoadFailed={Boolean(schedule?.error)}
      eventOverview={<EventOverview result={result} />}
    />
  );
}

export default function Home() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-5xl p-6">Loading dashboard…</p>}>
      <ProtectedDashboard />
    </Suspense>
  );
}
