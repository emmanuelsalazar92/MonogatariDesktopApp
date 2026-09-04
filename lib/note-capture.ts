import { noteLinkTypes, type NoteLinkInput } from "./note-contract";
import { isValidNovelRouteId } from "./studio-routes";

export type NoteCaptureTarget = NoteLinkInput & { novelId: string; title: string };
export type NoteCaptureDraft = { novelId: string; target: NoteCaptureTarget; title: string; content: string; quotedText: string };
// MD-170 uses this same boundary. Selection positions never become part of a Note payload.
export function createNoteCapture(novelId: string, target: NoteCaptureTarget, selectedText?: string): NoteCaptureDraft | null {
  if (target.novelId !== novelId || !isValidNovelRouteId(novelId) || !isValidNovelRouteId(target.id) || !noteLinkTypes.includes(target.type) || typeof target.title !== "string") return null;
  if (selectedText !== undefined && (typeof selectedText !== "string" || !selectedText.trim() || selectedText.length > 100000)) return null;
  return { novelId, target: { novelId, type: target.type, id: target.id, title: target.title }, content: "", quotedText: selectedText ?? "",
    title: selectedText ? selectedText.trim().replace(/\s+/g, " ").slice(0, 120) : "" };
}
