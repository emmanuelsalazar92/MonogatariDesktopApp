import type { Relationship, RelationshipSummary } from "./studio-domain";
import { isValidNovelRouteId } from "./studio-routes";
import { relationshipSummary } from "./character-relationship";

function validSummary(value: unknown, novelId: string, showSpoilers: boolean): value is RelationshipSummary {
  if (!value || typeof value !== "object") return false;
  const row = value as RelationshipSummary;
  return row.novelId === novelId && typeof row.id === "string" && typeof row.fromCharacterId === "string" && typeof row.toCharacterId === "string"
    && isValidNovelRouteId(row.id) && isValidNovelRouteId(row.fromCharacterId) && isValidNovelRouteId(row.toCharacterId)
    && row.fromCharacterId !== row.toCharacterId && typeof row.isSpoiler === "boolean" && (showSpoilers || !row.isSpoiler)
    && typeof row.relationshipType === "string" && typeof row.labelFromTo === "string" && typeof row.labelToFrom === "string"
    && (row.direction === "Directional" || row.direction === "Bidirectional") && typeof row.revision === "number" && Number.isSafeInteger(row.revision) && row.revision >= 0;
}

export async function loadRelationshipCatalog(novelId: string, showSpoilers: boolean, lifecycle: "active" | "archived" | "all", signal: AbortSignal) {
  if (!isValidNovelRouteId(novelId)) throw new Error("Invalid novel ID");
  const params = new URLSearchParams({ novelId, lifecycle, ...(showSpoilers ? { spoilers: "true" } : {}) });
  const response = await fetch(`/api/relationships?${params}`, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("Relationship catalog unavailable");
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) throw new Error("Invalid relationship catalog");
  // Fail closed for malformed, stale or wrong-scope rows; strip any unexpected private fields.
  return rows.filter((row) => validSummary(row, novelId, showSpoilers)).map(relationshipSummary);
}

export async function loadRelationshipDetail(novelId: string, id: string, showSpoilers: boolean, signal: AbortSignal): Promise<Relationship> {
  if (!isValidNovelRouteId(novelId) || !isValidNovelRouteId(id)) throw new Error("Invalid relationship IDs");
  const params = new URLSearchParams({ novelId, ...(showSpoilers ? { spoilers: "true" } : {}) });
  const response = await fetch(`/api/relationships/${encodeURIComponent(id)}?${params}`, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("Relationship detail unavailable");
  const row = await response.json();
  if (!validSummary(row, novelId, showSpoilers) || row.id !== id || !["description", "notes", "status", "since"].every((key) => typeof (row as unknown as Record<string, unknown>)[key] === "string")) throw new Error("Invalid relationship detail");
  return row as Relationship;
}
