import { getRelationshipDefinition, getStoredRelationshipDefinition, relationshipDefinitions, resolveRelationshipSemantics } from "./character-relationship";
import type { RelationshipSummary } from "./studio-domain";
import { isValidNovelRouteId, routeForPage } from "./studio-routes";

export const relationshipCategories = { family: "Family", romance: "Romance", social: "Social", conflict: "Conflict", secret: "Secret/Spoiler", unclassified: "Unclassified" } as const;
export type RelationshipCatalogState = { category: string; type: string; character: string; direction: "all" | "directional" | "symmetric"; lifecycle: "active" | "archived" | "all"; spoilers: boolean };
export const defaultRelationshipCatalog: RelationshipCatalogState = { category: "all", type: "all", character: "All characters", direction: "all", lifecycle: "active", spoilers: false };
export function parseRelationshipCatalog(params: Pick<URLSearchParams, "get">): RelationshipCatalogState {
  const category = params.get("category") ?? "all", type = params.get("type") ?? "all", character = params.get("character");
  const direction = params.get("direction"), lifecycle = params.get("lifecycle");
  return { category: Object.hasOwn(relationshipCategories, category) ? category : "all", type: getRelationshipDefinition(type) ? type : "all",
    character: character && isValidNovelRouteId(character) ? character : "All characters",
    direction: direction === "directional" || direction === "symmetric" ? direction : "all",
    lifecycle: lifecycle === "archived" || lifecycle === "all" ? lifecycle : "active", spoilers: params.get("spoilers") === "true" };
}
export function serializeRelationshipCatalog(state: RelationshipCatalogState) {
  const params = new URLSearchParams();
  if (state.category !== "all") params.set("category", state.category);
  if (state.type !== "all") params.set("type", state.type);
  if (state.character !== "All characters") params.set("character", state.character);
  if (state.direction !== "all") params.set("direction", state.direction);
  if (state.lifecycle !== "active") params.set("lifecycle", state.lifecycle);
  if (state.spoilers) params.set("spoilers", "true");
  return params;
}
export function relationshipCatalogRoute(novelId: string, state: RelationshipCatalogState) {
  const base = routeForPage("relationships", novelId), query = serializeRelationshipCatalog(state).toString();
  return query ? `${base}?${query}` : base;
}
export function filterRelationships<T extends RelationshipSummary>(relationships: T[], state: RelationshipCatalogState) {
  return relationships.filter((r) => {
    const semantics = resolveRelationshipSemantics(r.relationshipType, r.direction);
    return (state.category === "all" || relationshipCategories[state.category as keyof typeof relationshipCategories] === semantics.category)
      && (state.type === "all" || semantics.key === state.type)
      && (state.character === "All characters" || r.fromCharacterId === state.character || r.toCharacterId === state.character)
      && (state.spoilers || !r.isSpoiler)
      && (state.direction === "all" || semantics.direction === (state.direction === "symmetric" ? "Bidirectional" : "Directional"))
      && (state.lifecycle === "all" || (state.lifecycle === "archived" ? Boolean(r.archivedAt) : !r.archivedAt));
  });
}
export function searchRelationshipTypes(query: string) {
  const value = query.slice(0, 120).normalize("NFC").trim().toLocaleLowerCase();
  return relationshipDefinitions.filter((type) => type.active && `${type.name} ${type.category}`.toLocaleLowerCase().includes(value));
}
const phrases: Record<string, string> = {
  father_of: "is the father of", mother_of: "is the mother of", parent_of: "is a parent of", child_of: "is a child of",
  sibling_of: "is a sibling of", cousin_of: "is a cousin of", friend_of: "is friends with", mentor_of: "mentors", student_of: "is a student of",
  in_love_with: "is in love with", partner_of: "is partnered with", spouse_of: "is married to", rival_of: "is a rival of", enemy_of: "is an enemy of", distrusts: "distrusts"
};
export function relationshipSentence(from: string, type: string, to: string) {
  const definition = getStoredRelationshipDefinition(type);
  return definition ? `${from} ${phrases[definition.key]} ${to}` : `${from} — ${type} — ${to}`;
}
