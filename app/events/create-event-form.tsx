"use client";

import { useActionState } from "react";
import { createSampleEvent } from "./actions";

export default function CreateEventForm() {
  const [state, submit, pending] = useActionState(createSampleEvent, {});

  return (
    <form action={submit} className="mt-4">
      <button
        type="submit"
        disabled={pending}
        className="min-h-10 rounded-lg bg-white px-3 text-sm font-semibold text-teal-950 enabled:hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60"
      >
        {pending ? "Creating event…" : "Create Sample Event"}
      </button>
      {state.error && <p role="alert" className="mt-3 text-sm text-red-200">{state.error}</p>}
    </form>
  );
}
