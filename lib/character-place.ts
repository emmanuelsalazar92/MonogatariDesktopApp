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
