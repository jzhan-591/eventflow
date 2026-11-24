export const sampleEvent = {
  title: "Neighborhood Garden Day",
  dateTime: "2027-05-15T09:00:00-07:00",
  dateLabel: "Saturday, May 15, 2027 at 9:00 AM PT",
  location: "Cedar Lane Community Garden",
};

export const sampleParticipants = [
  { id: "avery", name: "Avery Reed", checked_in: true },
  { id: "jules", name: "Jules Bennett", checked_in: true },
  { id: "morgan", name: "Morgan Hale", checked_in: false },
  { id: "riley", name: "Riley Park", checked_in: false },
];

export const sampleShifts = [
  { id: "setup", volunteerId: "avery", volunteerName: "Avery Reed", role: "Event Setup", startTime: "09:00", endTime: "10:00" },
  { id: "check-in", volunteerId: "jules", volunteerName: "Jules Bennett", role: "Check-In Desk", startTime: "09:00", endTime: "10:30" },
  { id: "cleanup", volunteerId: "riley", volunteerName: "Riley Park", role: "Event Cleanup", startTime: "10:00", endTime: "11:00" },
];

export const sampleSyncCsv = [
  "Name,Status",
  "Avery Reed,Checked In",
  "Jules Bennett,Checked In",
  "Morgan Hale,Not Checked In",
  "Jordan Vale,Not Checked In",
].join("\r\n") + "\r\n";
