import { defaultNoteFilters, noteFilterParams, parseNoteFilters, type NoteCatalogFilter } from "./note-catalog";
import { isValidNovelRouteId, routeForNote } from "./studio-routes";
import { noteLinkTypes, type NoteLinkInput } from "./note-contract";

// Search may include private Note text: keep it in memory, never in browser URLs/history.
export function noteCatalogHref(novelId: string, filter: NoteCatalogFilter = defaultNoteFilters, noteId?: string) {
  if (!isValidNovelRouteId(novelId) || (noteId !== undefined && !isValidNovelRouteId(noteId))) return null;
  const safe = parseNoteFilters(noteFilterParams({ ...filter, search: "" }));
  const query = noteFilterParams(safe).toString();
  return `${routeForNote(novelId, noteId)}${query ? `?${query}` : ""}`;
}
export function relatedNotesHref(novelId: string, target: NoteLinkInput, noteId?: string) {
  if (!noteLinkTypes.includes(target.type) || !isValidNovelRouteId(target.id)) return null;
  return noteCatalogHref(novelId, { ...defaultNoteFilters, archived: "all", entityType: target.type, entity: target.id }, noteId);
}
