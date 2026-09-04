import type { Location, PlaceSummary, TimelineEvent, TimelineEventSummary } from "@/lib/studio-domain";
import { isValidNovelRouteId } from "@/lib/studio-routes";
import { compareChronology } from "./timeline-position";

// Both Timeline and Places consume the same Event–Place join projection.
export type StoryEventSummary = Pick<TimelineEvent, "id" | "novelId" | "title" | "internalDate" | "sortIndex" | "isSpoiler">;
export type TimelinePlaceChange = { locationId: string; linked: boolean; expectedLinked: boolean };

export function readTimelinePlaceChange(value: unknown): TimelinePlaceChange | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["novelId", "locationId", "linked", "expectedLinked"].includes(key))) return null;
  return typeof body.locationId === "string" && isValidNovelRouteId(body.locationId) && typeof body.linked === "boolean" && typeof body.expectedLinked === "boolean"
    ? { locationId: body.locationId, linked: body.linked, expectedLinked: body.expectedLinked } : null;
}

export const compareTimelineEvents = compareChronology;

export function derivePlaceStoryEvents(place: Pick<Location, "id" | "novelId">, events: TimelineEventSummary[]): StoryEventSummary[] {
  return events
    .filter((event) => event.novelId === place.novelId && event.locationIds.includes(place.id) && isValidNovelRouteId(event.id))
    .map(({ id, novelId, title, internalDate, sortIndex, isSpoiler }) => ({ id, novelId, title, internalDate, sortIndex, isSpoiler }))
    .sort(compareTimelineEvents);
}

export function resolveTimelinePlaces(event: Pick<TimelineEvent, "novelId" | "locationIds">, places: Pick<PlaceSummary, "id" | "novelId" | "name">[]) {
  const ids = new Set(event.locationIds);
  return places.filter(place => place.novelId === event.novelId && ids.has(place.id) && isValidNovelRouteId(place.id));
}
