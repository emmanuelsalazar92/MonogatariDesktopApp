import type { Relationship } from "@/lib/studio-domain";

export const relationshipDefinitions = [
  { key: "spouses", name: "Spouses", category: "Romance", direction: "Bidirectional", labelFromTo: "Spouse", labelToFrom: "Spouse" },
  { key: "siblings", name: "Siblings", category: "Family", direction: "Bidirectional", labelFromTo: "Sibling", labelToFrom: "Sibling" },
  { key: "parent-child", name: "Parent / Child", category: "Family", direction: "Directional", labelFromTo: "Child", labelToFrom: "Parent" },
  { key: "mentor-student", name: "Mentor / Student", category: "Social", direction: "Directional", labelFromTo: "Student", labelToFrom: "Mentor" },
  { key: "friends", name: "Friends", category: "Social", direction: "Bidirectional", labelFromTo: "Friend", labelToFrom: "Friend" },
  { key: "rivals", name: "Rivals", category: "Conflict", direction: "Bidirectional", labelFromTo: "Rival", labelToFrom: "Rival" }
] as const satisfies ReadonlyArray<{
  key: string;
  name: string;
  category: Relationship["category"];
  direction: Relationship["direction"];
  labelFromTo: string;
  labelToFrom: string;
}>;

export type RelationshipTypeKey = (typeof relationshipDefinitions)[number]["key"];

export function getRelationshipDefinition(value: unknown) {
  return relationshipDefinitions.find((definition) => definition.key === value) ?? null;
}

export function resolveRelationshipSemantics(type: string, direction: string) {
  const definition = getRelationshipDefinition(type);
  if (definition) return definition;
  const symmetric = direction === "Bidirectional";
  return {
    key: type,
    name: type,
    category: "Social" as const,
    direction: symmetric ? "Bidirectional" as const : "Directional" as const,
    labelFromTo: type,
    labelToFrom: symmetric ? type : `Receives: ${type}`
  };
}

export function relationshipViewForCharacter(
  relationship: Pick<Relationship, "fromCharacterId" | "toCharacterId" | "labelFromTo" | "labelToFrom">,
  characterId: string
) {
  if (relationship.fromCharacterId === characterId) {
    return { otherCharacterId: relationship.toCharacterId, label: relationship.labelFromTo };
  }
  if (relationship.toCharacterId === characterId) {
    return { otherCharacterId: relationship.fromCharacterId, label: relationship.labelToFrom };
  }
  return null;
}

export function relationshipIdentity(novelId: string, characterAId: string, characterBId: string, type: string) {
  const pair = [characterAId, characterBId].sort();
  return JSON.stringify([novelId, pair[0], pair[1], type]);
}

export function charactersBelongToNovel(
  characters: Array<{ id: string; novelId: string }>,
  novelId: string,
  characterIds: [string, string]
) {
  return characterIds[0] !== characterIds[1] && characterIds.every((id) =>
    characters.some((character) => character.id === id && character.novelId === novelId)
  );
}

export function validateRelationshipInput(value: unknown):
  | { ok: true; data: { novelId: string; fromCharacterId: string; toCharacterId: string; relationshipType: RelationshipTypeKey; description: string; notes: string; status: string; since: string; isSpoiler: boolean } }
  | { ok: false; error: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false, error: "Invalid relationship" };
  const input = value as Record<string, unknown>;
  const allowed = new Set(["novelId", "fromCharacterId", "toCharacterId", "relationshipType", "description", "notes", "status", "since", "isSpoiler"]);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length) return { ok: false, error: `Fields are not editable: ${unknown.join(", ")}` };
  const text = (field: string, max: number, required = false) => {
    const raw = input[field];
    if (raw === undefined && !required) return "";
    if (typeof raw !== "string") return null;
    const normalized = raw.normalize("NFC").trim();
    if ((required && !normalized) || normalized.length > max) return null;
    return normalized;
  };
  const novelId = text("novelId", 128, true);
  const fromCharacterId = text("fromCharacterId", 128, true);
  const toCharacterId = text("toCharacterId", 128, true);
  const definition = getRelationshipDefinition(input.relationshipType);
  const description = text("description", 2_000);
  const notes = text("notes", 5_000);
  const status = text("status", 80);
  const since = text("since", 120);
  if (!novelId || !fromCharacterId || !toCharacterId) return { ok: false, error: "Novel and both characters are required" };
  if (fromCharacterId === toCharacterId) return { ok: false, error: "A character cannot be related to itself" };
  if (!definition) return { ok: false, error: "Relationship type is invalid" };
  if (description === null || notes === null || status === null || since === null) return { ok: false, error: "Relationship metadata is invalid or too long" };
  if (input.isSpoiler !== undefined && typeof input.isSpoiler !== "boolean") return { ok: false, error: "isSpoiler is invalid" };
  return { ok: true, data: { novelId, fromCharacterId, toCharacterId, relationshipType: definition.key, description, notes, status, since, isSpoiler: input.isSpoiler === true } };
}
