import { noteLinkTypes, type NoteLinkInput } from "./note-contract";

export type NoteDraftFields = { title: string; content: string; quotedText: string; tags: string[]; newTag: string; links: NoteLinkInput[]; workflowStatus?: "informational" | "open" | "in_progress" | "done" };
export type NoteDraft = { version: 1; sessionId: string; novelId: string; noteId: string | null; baseRevision: number | null; savedAt: number; attemptedSave: boolean; fields: NoteDraftFields };
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
export const NOTE_DRAFT_PREFIX = "monogatari:note-draft:v1:";
export const NOTE_DRAFT_LIMIT = 800000;
const validId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
export const noteDraftKey = (draft: Pick<NoteDraft, "novelId" | "noteId" | "sessionId">) => `${NOTE_DRAFT_PREFIX}${draft.novelId}:${draft.noteId ?? "create"}:${draft.sessionId}`;
export function readNoteDraft(raw: string | null): NoteDraft | null {
  if (!raw || raw.length > NOTE_DRAFT_LIMIT) return null;
  try {
    const d = JSON.parse(raw), f = d.fields;
    if (d.version !== 1 || !validId(d.sessionId) || !validId(d.novelId) || (d.noteId !== null && !validId(d.noteId)) ||
      (d.baseRevision !== null && (!Number.isSafeInteger(d.baseRevision) || d.baseRevision < 0)) || !Number.isSafeInteger(d.savedAt) || d.savedAt < 0 || typeof d.attemptedSave !== "boolean" || !f ||
      typeof f.title !== "string" || f.title.length > 200 || typeof f.content !== "string" || f.content.length > 100000 || (f.quotedText !== undefined && (typeof f.quotedText !== "string" || f.quotedText.length > 100000)) || typeof f.newTag !== "string" || f.newTag.length > 50 ||
      !Array.isArray(f.tags) || f.tags.length > 50 || !f.tags.every((tag: unknown) => typeof tag === "string" && tag.length <= 50) ||
      !Array.isArray(f.links) || f.links.length > 500 || !f.links.every((link: NoteLinkInput) => link && noteLinkTypes.includes(link.type) && validId(link.id))) return null;
    if (f.workflowStatus !== undefined && !["informational", "open", "in_progress", "done"].includes(f.workflowStatus)) return null;
    // Project only allowed fields: never restore arbitrary storage keys, tokens or UI state.
    return { version: 1, sessionId: d.sessionId, novelId: d.novelId, noteId: d.noteId, baseRevision: d.baseRevision, savedAt: d.savedAt, attemptedSave: d.attemptedSave,
      fields: { title: f.title, content: f.content, quotedText: f.quotedText ?? "", tags: [...f.tags], newTag: f.newTag, links: f.links.map(({ type, id }: NoteLinkInput) => ({ type, id })), ...(f.workflowStatus !== undefined ? { workflowStatus: f.workflowStatus } : {}) } };
  } catch { return null; }
}
export function listNoteDrafts(storage: DraftStorage, novelId: string, noteId: string | null) {
  const drafts: NoteDraft[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(NOTE_DRAFT_PREFIX)) continue;
    const draft = readNoteDraft(storage.getItem(key));
    if (draft && noteDraftKey(draft) === key && draft.novelId === novelId && draft.noteId === noteId) drafts.push(draft);
  }
  return drafts.sort((a, b) => b.savedAt - a.savedAt || a.sessionId.localeCompare(b.sessionId));
}
export function storeNoteDraft(storage: DraftStorage, draft: NoteDraft) {
  const validated = readNoteDraft(JSON.stringify(draft));
  if (!validated) throw new Error("Draft exceeds local limits");
  const key = noteDraftKey(draft);
  // Each writer owns a unique session key. setItem atomically replaces that one snapshot.
  if (!storage.getItem(key)) {
    let count = 0;
    for (let i = 0; i < storage.length; i++) if (storage.key(i)?.startsWith(NOTE_DRAFT_PREFIX)) count++;
    if (count >= 20) throw new Error("Local draft limit reached");
  }
  storage.setItem(key, JSON.stringify(validated));
}
export function removeNoteDraft(storage: DraftStorage, draft: NoteDraft) {
  const key = noteDraftKey(draft), current = readNoteDraft(storage.getItem(key));
  // Never delete a snapshot another tab updated after the recovery prompt was shown.
  if (current && JSON.stringify(current) !== JSON.stringify(readNoteDraft(JSON.stringify(draft)))) return false;
  storage.removeItem(key); return true;
}
export const noteDraftConflict = (draft: NoteDraft, revision: number | null) => draft.noteId !== null && draft.baseRevision !== revision;
