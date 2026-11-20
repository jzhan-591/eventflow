import { createHash } from "node:crypto";

export function participantNameKey(name: string) {
  return name.trim().toLowerCase();
}

export function participantIdForName(eventId: string, name: string) {
  // PostgreSQL's UUID primary key guards against two requests inserting the same name.
  const key = JSON.stringify(["eventflow:participant", eventId, participantNameKey(name)]);
  const hex = createHash("sha256").update(key).digest("hex");
  const variant = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
