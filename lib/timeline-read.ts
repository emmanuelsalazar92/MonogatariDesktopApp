import type { TimelineEvent, TimelineEventSummary } from "./studio-domain";
import { isValidNovelRouteId } from "./studio-routes";
import { validTimelineOrder } from "./timeline-position";

export function readTimelineSummary(value: unknown, novelId: string, spoilers: boolean): TimelineEventSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = (v: unknown): v is string => typeof v === "string" && isValidNovelRouteId(v);
  const ids = (v: unknown, limit: number): v is string[] => Array.isArray(v) && v.length <= limit && v.every(id);
  if (!id(row.id) || row.novelId !== novelId || typeof row.title !== "string" || row.title.length > 200
    || typeof row.isSpoiler !== "boolean" || (!spoilers && row.isSpoiler) || !ids(row.characterIds, 300) || !ids(row.locationIds, 500)
    || !Number.isSafeInteger(row.positionRevision) || (row.positionRevision as number) < 0) return null;
  const target = (v: unknown) => id(v) ? v : "";
  return { id: row.id, novelId, title: row.title, isSpoiler: row.isSpoiler,
    sortIndex: validTimelineOrder(row.sortIndex) ? row.sortIndex : 0,
    chronologyKind: row.chronologyKind === "relative" ? "relative" : "manual",
    relativeDay: validTimelineOrder(row.relativeDay) ? row.relativeDay : null,
    relativeMinute: typeof row.relativeMinute === "number" && Number.isInteger(row.relativeMinute) && row.relativeMinute >= 0 && row.relativeMinute < 1440 ? row.relativeMinute : null,
    internalDate: typeof row.internalDate === "string" ? row.internalDate.slice(0, 200) : "",
    positionRevision: row.positionRevision as number, archivedAt: typeof row.archivedAt === "string" ? row.archivedAt : null,
    volumeId: target(row.volumeId), chapterId: target(row.chapterId), sceneId: target(row.sceneId),
    characterIds: [...new Set(row.characterIds)], locationIds: [...new Set(row.locationIds)] };
}
export function readTimelineDetail(value: unknown, novelId: string, eventId: string, spoilers: boolean): TimelineEvent | null {
  const summary = readTimelineSummary(value, novelId, spoilers);
  const description = value && typeof value === "object" && "description" in value ? value.description : null;
  return summary?.id === eventId && typeof description === "string" && description.length <= 5000 ? { ...summary, description } : null;
}

export const TIMELINE_PAGE_SIZE = 50;
export function timelineWindow<T>(events: T[], requestedPage: number) {
  const pages = Math.max(1, Math.ceil(events.length / TIMELINE_PAGE_SIZE));
  const page = Math.min(Math.max(0, Number.isSafeInteger(requestedPage) ? requestedPage : 0), pages - 1);
  return { page, pages, events: events.slice(page * TIMELINE_PAGE_SIZE, (page + 1) * TIMELINE_PAGE_SIZE) };
}
