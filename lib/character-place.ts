import {
  characterPlaceRelationshipTypes,
  type CharacterPlaceRelationshipType
} from "@/lib/studio-domain";

export const defaultCharacterPlaceRelationshipType: CharacterPlaceRelationshipType =
  "Associated with";

export function parseCharacterPlaceRelationshipType(
  value: unknown
): CharacterPlaceRelationshipType | null {
  if (value === undefined) return defaultCharacterPlaceRelationshipType;
  return typeof value === "string" &&
    characterPlaceRelationshipTypes.includes(value as CharacterPlaceRelationshipType)
    ? (value as CharacterPlaceRelationshipType)
    : null;
}

export type PlaceCharacterSummary = {
  characterId: string;
  name: string;
  archived: boolean;
  relationshipType: CharacterPlaceRelationshipType;
};

export function derivePlaceCharacters(
  place: { id: string; novelId: string },
  characters: readonly { id: string; novelId: string; name: string; archivedAt?: string | null }[],
  links: readonly { characterId: string; locationId: string; relationshipType: unknown }[]
): PlaceCharacterSummary[] {
  const owned = new Map(characters.filter((character) => character.novelId === place.novelId).map((character) => [character.id, character]));
  const linked = new Map<string, PlaceCharacterSummary>();
  for (const link of links) {
    if (link.locationId !== place.id) continue;
    const character = owned.get(link.characterId);
    if (!character) continue;
    linked.set(character.id, {
      characterId: character.id, name: character.name, archived: Boolean(character.archivedAt),
      relationshipType: parseCharacterPlaceRelationshipType(link.relationshipType) ?? defaultCharacterPlaceRelationshipType
    });
  }
  return [...linked.values()].sort((a, b) => a.name.localeCompare(b.name) || a.characterId.localeCompare(b.characterId));
}
