import type { Relationship, RelationshipSummary } from "@/lib/studio-domain";

// One policy for catalog, graph, counts and detail: hide completely, never redact.
export function relationshipIsVisible(relationship: { novelId: string; isSpoiler: boolean }, from: { novelId: string; isSpoiler?: boolean } | undefined,
  to: { novelId: string; isSpoiler?: boolean } | undefined, showSpoilers: boolean) {
  return Boolean(from && to && from.novelId === relationship.novelId && to.novelId === relationship.novelId
    && (showSpoilers || (!relationship.isSpoiler && !from.isSpoiler && !to.isSpoiler)));
}

export function relationshipSummary(relationship: RelationshipSummary): RelationshipSummary {
  const { id, novelId, revision, archivedAt, fromCharacterId, toCharacterId, relationshipType, category, direction, isSpoiler, labelFromTo, labelToFrom } = relationship;
  return { id, novelId, revision, archivedAt, fromCharacterId, toCharacterId, relationshipType, category, direction, isSpoiler, labelFromTo, labelToFrom };
}

function defineType<Key extends string>(key: Key, name: string, category: Relationship["category"],
  directionality: "directional" | "symmetric", inverseLabel: string = name,
  inverseTypeId: string | null = null, canonicalTypeId: string = key) {
  return { key, name, category, directionality, inverseTypeId, canonicalTypeId, active: true,
    direction: directionality === "symmetric" ? "Bidirectional" as const : "Directional" as const,
    labelFromTo: name, labelToFrom: inverseLabel };
}

// One library shared by validation, presentation and the SQLite data migration.
// Labels describe the subject: A --Mentor of--> B; B --Student of--> A.
export const relationshipDefinitions = [
  defineType("father_of", "Father of", "Family", "directional", "Child of"),
  defineType("mother_of", "Mother of", "Family", "directional", "Child of"),
  defineType("parent_of", "Parent of", "Family", "directional", "Child of", "child_of"),
  defineType("child_of", "Child of", "Family", "directional", "Parent of", "parent_of", "parent_of"),
  defineType("sibling_of", "Sibling of", "Family", "symmetric"),
  defineType("cousin_of", "Cousin of", "Family", "symmetric"),
  defineType("friend_of", "Friend of", "Social", "symmetric"),
  defineType("mentor_of", "Mentor of", "Social", "directional", "Student of", "student_of"),
  defineType("student_of", "Student of", "Social", "directional", "Mentor of", "mentor_of", "mentor_of"),
  defineType("in_love_with", "In love with", "Romance", "directional", "Loved by"),
  defineType("partner_of", "Partner of", "Romance", "symmetric"),
  defineType("spouse_of", "Spouse of", "Romance", "symmetric"),
  defineType("rival_of", "Rival of", "Conflict", "symmetric"),
  defineType("enemy_of", "Enemy of", "Conflict", "symmetric"),
  defineType("distrusts", "Distrusts", "Conflict", "directional", "Distrusted by")
] as const;

export type RelationshipTypeKey = (typeof relationshipDefinitions)[number]["key"];

export function getRelationshipDefinition(value: unknown) {
  return relationshipDefinitions.find((definition) => definition.key === value) ?? null;
}

// Legacy pair selectors treated the source as parent/mentor. Migrate that
// orientation, correcting their old target-role labels without swapping people.
const legacyCodes: Record<string, RelationshipTypeKey> = {
  spouses: "spouse_of", siblings: "sibling_of", "parent-child": "parent_of", "mentor-student": "mentor_of",
  friends: "friend_of", rivals: "rival_of", "is in love with": "in_love_with"
};
export function getStoredRelationshipDefinition(type: string) {
  const value = type.normalize("NFC").trim().toLowerCase();
  return getRelationshipDefinition(value)
    ?? (Object.hasOwn(legacyCodes, value) ? getRelationshipDefinition(legacyCodes[value]) : null)
    ?? relationshipDefinitions.find((definition) => definition.name.toLowerCase() === value) ?? null;
}

export function resolveRelationshipSemantics(type: string, direction: string) {
  const definition = getStoredRelationshipDefinition(type);
  if (definition) return definition;
  const symmetric = direction === "Bidirectional";
  return {
    key: type,
    name: `Legacy: ${type}`,
    category: "Unclassified" as const,
    active: false,
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
  const canonical = canonicalRelationship(characterAId, characterBId, type);
  return JSON.stringify([novelId, canonical.fromCharacterId, canonical.toCharacterId, canonical.relationshipType]);
}

export function canonicalRelationship(fromCharacterId: string, toCharacterId: string, type: string) {
  const definition = getStoredRelationshipDefinition(type);
  if (!definition) return { fromCharacterId, toCharacterId, relationshipType: type };
  if (definition.canonicalTypeId !== definition.key) [fromCharacterId, toCharacterId] = [toCharacterId, fromCharacterId];
  if (definition.directionality === "symmetric") [fromCharacterId, toCharacterId] = [fromCharacterId, toCharacterId].sort();
  return { fromCharacterId, toCharacterId, relationshipType: definition.canonicalTypeId };
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

export type RelationshipSince = {
  sinceKind: "unknown" | "before_story" | "custom" | "volume" | "chapter" | "scene";
  sinceTargetId: string | null;
  since: string;
};

export function readRelationshipSince(input: Record<string, unknown>): RelationshipSince | null {
  const text = input.since === undefined ? "" : typeof input.since === "string" ? input.since.normalize("NFC").trim() : null;
  if (text === null || text.length > 120) return null;
  // Old clients/records with only text remain explicitly custom, never guessed IDs.
  const kind = input.sinceKind ?? (text ? "custom" : "unknown");
  const target = input.sinceTargetId ?? null;
  if (kind === "volume" || kind === "chapter" || kind === "scene") {
    if (text || typeof target !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(target)) return null;
    return { sinceKind: kind, sinceTargetId: target, since: "" };
  }
  if (target !== null) return null;
  if (kind === "custom") return text ? { sinceKind: kind, sinceTargetId: null, since: text } : null;
  if ((kind === "unknown" || kind === "before_story") && !text) return { sinceKind: kind, sinceTargetId: null, since: "" };
  return null;
}

export function validateRelationshipInput(value: unknown):
  | { ok: true; data: { novelId: string; fromCharacterId: string; toCharacterId: string; relationshipType: RelationshipTypeKey; description: string; notes: string; status: string; isSpoiler: boolean } & RelationshipSince }
  | { ok: false; error: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false, error: "Invalid relationship" };
  const input = value as Record<string, unknown>;
  const allowed = new Set(["novelId", "fromCharacterId", "toCharacterId", "relationshipType", "description", "notes", "status", "since", "sinceKind", "sinceTargetId", "isSpoiler"]);
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
  const since = readRelationshipSince(input);
  if (!novelId || !fromCharacterId || !toCharacterId) return { ok: false, error: "Novel and both characters are required" };
  if (fromCharacterId === toCharacterId) return { ok: false, error: "A character cannot be related to itself" };
  if (!definition?.active) return { ok: false, error: "Relationship type is invalid" };
  if (description === null || notes === null || status === null || since === null) return { ok: false, error: "Relationship metadata is invalid or too long" };
  if (input.isSpoiler !== undefined && typeof input.isSpoiler !== "boolean") return { ok: false, error: "isSpoiler is invalid" };
  return { ok: true, data: { novelId, fromCharacterId, toCharacterId, relationshipType: definition.key, description, notes, status, ...since, isSpoiler: input.isSpoiler === true } };
}
