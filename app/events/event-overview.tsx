import CreateEventForm from "./create-event-form";
import type { readEvent } from "./data";

const displayTime = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  // Format the stored event's local date and time without shifting the clock.
  timeZone: "UTC",
});

export default function EventOverview({ result }: { result: Awaited<ReturnType<typeof readEvent>> }) {
  const { data: event, error } = result;
  const dateTime = event ? `${event.event_date}T${event.start_time.slice(0, 5)}` : null;

  return (
    <section aria-labelledby="event-heading" className="rounded-2xl bg-teal-950 p-6 text-white sm:p-7">
      <h2 id="event-heading" className="text-sm font-semibold text-teal-200">Event Overview</h2>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-200">
          {error.code === "42501"
            ? "You don't have permission to view events."
            : "We couldn't load your event. Refresh the page to try again."}
        </p>
      ) : event && dateTime ? (
        <>
          <p className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{event.title}</p>
          <p className="mt-4 text-sm text-teal-100">
            <time dateTime={dateTime}>{displayTime.format(new Date(`${dateTime}Z`))} PT</time>
          </p>
          <p className="mt-1 text-sm text-teal-100">{event.location}</p>
        </>
      ) : (
        <>
          <p className="mt-4 text-sm text-teal-100">You don&apos;t have any events yet.</p>
          <CreateEventForm />
        </>
      )}
    </section>
  );
}
