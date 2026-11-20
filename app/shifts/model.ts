export const roles = ["Check-In Desk", "Event Setup", "Food Service", "Event Cleanup"];

export type Shift = {
  id: string;
  volunteerId: string;
  volunteerName: string;
  role: string;
  startTime: string;
  endTime: string;
};

export function validateShiftTimes(startTime: string, endTime: string) {
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!time.test(startTime) || !time.test(endTime)) return "Enter both shift times.";
  if (endTime <= startTime) return "End time must be later than start time.";
  return "";
}
