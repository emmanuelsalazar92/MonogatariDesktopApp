import { readTimelinePosition } from "./timeline-position";

export function readTimelineEvent(value: unknown) {
  const position = readTimelinePosition(value);
  if (!position.ok) return position;
  const input = value as Record<string, unknown>;
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 200) return { ok: false as const, error: "Event Title is required (maximum 200 characters)" };
  if (input.description !== undefined && (typeof input.description !== "string" || input.description.length > 5000)) return { ok: false as const, error: "Description must be at most 5000 characters" };
  if (input.isSpoiler !== undefined && typeof input.isSpoiler !== "boolean") return { ok: false as const, error: "Invalid spoiler value" };
  const validId = (id: unknown): id is string => typeof id === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id);
  const locationId = input.locationId === "" || input.locationId == null ? null : input.locationId;
  if (locationId !== null && !validId(locationId)) return { ok: false as const, error: "Invalid Place ID" };
  const locationIds = input.locationIds === undefined ? (locationId ? [locationId] : []) : input.locationIds;
  if (!Array.isArray(locationIds) || locationIds.length > 500 || !locationIds.every(validId)) return { ok: false as const, error: "Invalid Place IDs" };
  if (input.locationIds !== undefined && locationId !== null && (locationIds.length !== 1 || locationIds[0] !== locationId)) return { ok: false as const, error: "Use locationIds for multiple Places" };
  const characterIds = input.characterIds === undefined ? [] : input.characterIds;
  if (!Array.isArray(characterIds) || characterIds.length > 300 || !characterIds.every(validId)) return { ok: false as const, error: "Invalid Character IDs" };
  return { ok: true as const, data: { ...position.data, title: input.title.trim(), description: (input.description as string | undefined)?.trim() ?? "", isSpoiler: input.isSpoiler === true, locationIds: [...new Set(locationIds)] as string[], characterIds: [...new Set(characterIds)] as string[] } };
}

// A synchronous lock also covers two submissions before React has rendered pending=true.
export function createEventSaveLock() {
  let busy = false;
  return { acquire() { if (busy) return false; busy = true; return true; }, release() { busy = false; }, get busy() { return busy; } };
}
