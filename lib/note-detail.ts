import type { Note } from "./studio-domain";
import { noteLinkTypes } from "./note-contract";
import { isValidNovelRouteId, routeForCharacter, routeForPage, routeForPlace, routeForTimelineEvent } from "./studio-routes";

export type NoteAttachment = NonNullable<Note["links"]>[number];
export function readNoteDetail(value: unknown, novelId: string, id: string): Note | null {
  if (!value || typeof value !== "object") return null;
  const note = value as Note;
  if (note.novelId !== novelId || note.id !== id || !isValidNovelRouteId(id) || !isValidNovelRouteId(novelId) ||
    typeof note.title !== "string" || typeof note.content !== "string" || typeof note.quotedText !== "string" || typeof note.pinned !== "boolean" ||
    typeof note.workflowStatus !== "string" || (note.archivedAt !== null && typeof note.archivedAt !== "string") ||
    (note.createdAt !== undefined && typeof note.createdAt !== "string") ||
    !Number.isSafeInteger(note.revision) || note.revision! < 0 || typeof note.updatedAt !== "string" ||
    !Array.isArray(note.tags) || !note.tags.every(tag => typeof tag === "string") || !Array.isArray(note.links) ||
    !note.links.every(link => link && noteLinkTypes.includes(link.type) && isValidNovelRouteId(link.id) && typeof link.title === "string" && typeof link.archived === "boolean")) return null;
  return note;
}

// Attachments come from the server's same-Novel projection, not an arbitrary client ID.
export function noteAttachmentHref(novelId: string, link: NoteAttachment) {
  if (!isValidNovelRouteId(novelId) || !isValidNovelRouteId(link.id) || link.archived) return null;
  switch (link.type) {
    case "Character": return routeForCharacter(novelId, link.id);
    case "Place": return routeForPlace(novelId, link.id);
    case "TimelineEvent": return routeForTimelineEvent(novelId, link.id);
    case "Scene": return routeForPage("editor", novelId, link.id);
    case "Volume": case "Chapter": return `${routeForPage("structure", novelId)}?kind=${link.type.toLowerCase()}&target=${encodeURIComponent(link.id)}`;
    default: return null;
  }
}
