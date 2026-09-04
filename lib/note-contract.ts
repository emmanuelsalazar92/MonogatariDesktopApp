export const noteLinkTypes = ["Volume", "Chapter", "Scene", "Character", "Place", "TimelineEvent"] as const;
export type NoteLinkType = typeof noteLinkTypes[number];
export type NoteLinkInput = { type: NoteLinkType; id: string };
export type NoteInput = { title?: string; content?: string; quotedText?: string; pinned?: boolean; workflowStatus?: "informational" | "open" | "in_progress" | "done"; archivedAt?: Date | null; links?: NoteLinkInput[]; tags?: string[] };
const id = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value);
export function readNoteInput(value: unknown, novelId: string, partial = false): NoteInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || !id(novelId)) return null;
  const v = value as Record<string, unknown>, result: NoteInput = {};
  if (Object.keys(v).some(key => !["novelId", "revision", "title", "content", "quotedText", "pinned", "workflowStatus", "archivedAt", "links", "tags", "linkedType", "linkedId"].includes(key))) return null;
  if (v.novelId !== undefined && v.novelId !== novelId) return null;
  if (v.title !== undefined || !partial) { if (typeof v.title !== "string" || !v.title.trim() || v.title.length > 200) return null; result.title = v.title.trim(); }
  if (v.content !== undefined) { if (typeof v.content !== "string" || v.content.length > 100000) return null; result.content = v.content; }
  if (v.quotedText !== undefined) { if (typeof v.quotedText !== "string" || v.quotedText.length > 100000) return null; result.quotedText = v.quotedText; }
  if (v.pinned !== undefined) { if (typeof v.pinned !== "boolean") return null; result.pinned = v.pinned; }
  if (v.workflowStatus !== undefined) { if (!["informational", "open", "in_progress", "done"].includes(v.workflowStatus as string)) return null; result.workflowStatus = v.workflowStatus as NoteInput["workflowStatus"]; }
  if (v.archivedAt !== undefined) { if (v.archivedAt !== null && (typeof v.archivedAt !== "string" || !/^\d{4}-\d\d-\d\dT/.test(v.archivedAt) || !Number.isFinite(Date.parse(v.archivedAt)))) return null; result.archivedAt = v.archivedAt === null ? null : new Date(v.archivedAt as string); }
  let links = v.links;
  if (v.linkedType !== undefined || v.linkedId !== undefined) {
    if (links !== undefined || typeof v.linkedType !== "string" || !id(v.linkedId)) return null;
    if (v.linkedType === "Novel") { if (v.linkedId !== novelId) return null; links = []; }
    else links = [{ type: v.linkedType, id: v.linkedId }];
  }
  if (links !== undefined) {
    if (!Array.isArray(links) || links.length > 500 || links.some(link => !link || typeof link !== "object" || Array.isArray(link) || Object.keys(link).some(key => !["type", "id"].includes(key)) || !noteLinkTypes.includes(link.type) || !id(link.id))) return null;
    result.links = [...new Map((links as NoteLinkInput[]).map(link => [`${link.type}:${link.id}`, { type: link.type, id: link.id }])).values()];
  }
  if (v.tags !== undefined) {
    if (!Array.isArray(v.tags) || v.tags.length > 50 || v.tags.some(tag => typeof tag !== "string" || !tag.trim() || tag.length > 50)) return null;
    result.tags = [...new Map((v.tags as string[]).map(tag => [tag.trim().toLowerCase(), tag.trim()])).values()];
  }
  return result;
}
