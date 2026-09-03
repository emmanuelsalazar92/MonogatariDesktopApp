import {
  characterRoles,
  characterStatuses,
  matchesCharacterClassification
} from "@/lib/character-metadata";
import type { Character } from "@/lib/studio-domain";

export const characterSortOptions = [
  "Name",
  "Last edited",
  "First appearance",
  "Scene count"
] as const;

export type CharacterSort = (typeof characterSortOptions)[number];

export type CharacterCatalogState = {
  query: string;
  role: string;
  status: string;
  sort: CharacterSort;
  showArchived: boolean;
};

export const defaultCharacterCatalogState: CharacterCatalogState = {
  query: "",
  role: "All roles",
  status: "All statuses",
  sort: "Name",
  showArchived: false
};

const sortParams: Record<CharacterSort, string> = {
  Name: "name",
  "Last edited": "last-edited",
  "First appearance": "first-appearance",
  "Scene count": "scene-count"
};

function allowlistedValue(value: string | null, options: readonly string[], fallback: string) {
  if (!value) return fallback;
  return options.find((option) => option.toLowerCase() === value.toLowerCase()) ?? fallback;
}

export function parseCharacterCatalogState(params: URLSearchParams): CharacterCatalogState {
  const status = allowlistedValue(
    params.get("status"),
    ["All statuses", ...characterStatuses],
    defaultCharacterCatalogState.status
  );
  return {
    query: params.get("q")?.slice(0, 120) ?? "",
    role: allowlistedValue(
      params.get("role"),
      ["All roles", ...characterRoles],
      defaultCharacterCatalogState.role
    ),
    status,
    sort:
      characterSortOptions.find(
        (option) => sortParams[option] === params.get("sort")?.toLowerCase()
      ) ??
      defaultCharacterCatalogState.sort,
    showArchived: params.get("archived") === "true" || status === "Archived"
  };
}

export function serializeCharacterCatalogState(state: CharacterCatalogState) {
  const params = new URLSearchParams();
  if (state.query.trim()) params.set("q", state.query.slice(0, 120));
  if (state.role !== defaultCharacterCatalogState.role) {
    params.set("role", state.role.toLowerCase());
  }
  if (state.status !== defaultCharacterCatalogState.status) {
    params.set("status", state.status.toLowerCase());
  }
  if (state.sort !== defaultCharacterCatalogState.sort) {
    params.set("sort", sortParams[state.sort]);
  }
  if (state.showArchived) params.set("archived", "true");
  return params;
}

function stableIdentity(left: Character, right: Character) {
  return left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) ||
    left.id.localeCompare(right.id);
}

export function filterAndSortCharacters(
  characters: Character[],
  state: CharacterCatalogState
) {
  const normalizedQuery = state.query.toLocaleLowerCase();
  return characters
    .filter(
      (character) =>
        (state.showArchived || character.status !== "Archived") &&
        character.name.toLocaleLowerCase().includes(normalizedQuery) &&
        matchesCharacterClassification(character, state.role, state.status)
    )
    .sort((left, right) => {
      if (state.sort === "Last edited") {
        return right.updatedAt.localeCompare(left.updatedAt) || stableIdentity(left, right);
      }
      if (state.sort === "First appearance") {
        if (left.firstAppearanceOrder === null && right.firstAppearanceOrder !== null) return 1;
        if (left.firstAppearanceOrder !== null && right.firstAppearanceOrder === null) return -1;
        return (
          (left.firstAppearanceOrder ?? 0) - (right.firstAppearanceOrder ?? 0) ||
          stableIdentity(left, right)
        );
      }
      if (state.sort === "Scene count") {
        return right.scenes - left.scenes || stableIdentity(left, right);
      }
      return stableIdentity(left, right);
    });
}
