import { noteLinkTypes, type NoteLinkInput } from "./note-contract";

export type NoteCatalogFilter = {
  search: string; tag: string; pinned: boolean; status: "all" | "open" | "resolved";
  archived: "active" | "archived" | "all"; entityType: "" | NoteLinkInput["type"]; entity: string;
  pinnedFirst: boolean; page: number;
};
export const defaultNoteFilters: NoteCatalogFilter = { search: "", tag: "", pinned: false, status: "all", archived: "active", entityType: "", entity: "", pinnedFirst: false, page: 1 };
export const normalizeNoteSearch = (value: string) => value.normalize("NFC").toLowerCase();
export const encodePrivateNoteSearch = (value: string) => encodeURIComponent(value.slice(0, 200));
export function decodePrivateNoteSearch(value: string | null) {
  if (!value || value.length > 1800) return "";
  try { return decodeURIComponent(value).slice(0, 200); } catch { return ""; }
}
const validId = (value: string) => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value);
export function parseNoteFilters(params: URLSearchParams): NoteCatalogFilter {
  const type = params.get("entityType") ?? "", tag = params.get("tag") ?? "", entity = params.get("entity") ?? "";
  const entityType = noteLinkTypes.find(item => item === type) ?? "";
  const page = Number(params.get("page") ?? 1);
  return { search: (params.get("search") ?? "").slice(0, 200), tag: tag === "untagged" || validId(tag) ? tag : "",
    pinned: params.get("pinned") === "true", pinnedFirst: params.get("pinnedFirst") === "true",
    status: params.get("status") === "open" ? "open" : params.get("status") === "resolved" ? "resolved" : "all",
    archived: params.get("archived") === "all" ? "all" : params.get("archived") === "archived" ? "archived" : "active",
    entityType, entity: entityType && validId(entity) ? entity : "", page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100000) : 1 };
}
export function noteFilterParams(filter: NoteCatalogFilter) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) if (value !== defaultNoteFilters[key as keyof NoteCatalogFilter]) params.set(key, String(value));
  return params;
}
export type NoteCatalogItem = {
  id: string; novelId: string; title: string; snippet: string; pinned: boolean; workflowStatus: string;
  archivedAt: string | null; updatedAt: string; revision: number;
  tags: string[]; tagSummaries: { id: string; name: string }[];
  links: { type: NoteLinkInput["type"]; id: string; title: string; archived: boolean }[];
};
export type NoteCatalogResult = { items: NoteCatalogItem[]; total: number; matched: number; hasUntagged: boolean; page: number; pages: number; tags: { id: string; name: string }[]; entityType: NoteCatalogFilter["entityType"]; entities: { id: string; title: string }[] };
