import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Dashboard from "./dashboard";

async function ProtectedDashboard() {
  // Supabase checks token expiration against the current time.
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims.sub) redirect("/login");

  return <Dashboard />;
}

export default function Home() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-5xl p-6">Loading dashboard…</p>}>
      <ProtectedDashboard />
    </Suspense>
  );
}
