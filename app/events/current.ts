import { createClient } from "@/lib/supabase/server";
import { readEvent } from "./data";

export async function getCurrentEvent(eventId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub) return { error: "Your session has expired. Log in again and retry." };

  const event = await readEvent(supabase, data.claims.sub);
  if (event.error) return { error: "We couldn't verify the current event. Refresh the page and try again." };
  if (!eventId || event.data?.id !== eventId) {
    return { error: "This event is no longer available. Refresh the page and try again." };
  }

  return { supabase };
}
