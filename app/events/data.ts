import type { createClient } from "@/lib/supabase/server";

export function readEvent(supabase: Awaited<ReturnType<typeof createClient>>, ownerId: string) {
  return supabase
    .schema("public")
    .from("events")
    .select("id,title,event_date,start_time,location")
    .eq("owner_id", ownerId)
    .order("event_date")
    .order("start_time")
    .order("id")
    .limit(1)
    .maybeSingle();
}
