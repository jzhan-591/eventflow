# EventFlow

**Event Check-in & Volunteer Management Web Application**

EventFlow is a dashboard for managing event participants and tracking check-ins. The current version focuses on participant check-in, with volunteer scheduling planned for a future release.

## Features

- **Event Overview Dashboard** — View the event name, date, time, and location.
- **Participant Check-In** — Mark participants as checked in directly from the roster.
- **Add Participants** — Add new participants by name and check them in from the same roster.
- **Search Participants** — Filter the roster by name as you type.
- **Real-Time Check-In Progress** — See the checked-in count and total participant count update as participants are added or checked in.
- **Input Validation** — Reject blank names and duplicate names, ignoring capitalization and extra spaces.

## Tech Stack

- **Next.js** for the application framework
- **React** for the interactive interface and local state
- **TypeScript** for type checking
- **Tailwind CSS** for styling

## Getting Started

You’ll need Node.js 20.9 or newer and npm. Clone the repository, install dependencies, and start the development server.

```bash
git clone https://github.com/jzhan-591/eventflow.git
cd eventflow
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Data and Persistence

EventFlow uses mock data for one event and five participants. New participants and check-ins are stored in React state. Refreshing the page restores the original roster and resets all check-ins.

## Future Improvements

- **CSV Import/Export** — Import participant rosters and export check-in records.
- **Volunteer Scheduling** — Create shifts and assign volunteers.
- **Database Integration** — Save events, participants, and check-in records across sessions.
- **Authentication** — Let event organizers sign in to manage their events.
