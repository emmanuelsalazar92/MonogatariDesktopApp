import { genreFilters, statusFilters } from "@/lib/studio-domain";

export const librarySortOptions = ["updated", "title", "created"] as const;
export const libraryViewOptions = ["grid", "list"] as const;

export type LibrarySort = (typeof librarySortOptions)[number];
export type LibraryView = (typeof libraryViewOptions)[number];

export type LibraryNavigationState = {
  status: string;
  genre: string;
  sort: LibrarySort;
  view: LibraryView;
};

export const defaultLibraryNavigationState: LibraryNavigationState = {
  status: "All statuses",
  genre: "All genres",
  sort: "updated",
  view: "grid"
};

function parameterValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function allowedOption(value: string | null, options: readonly string[], fallback: string) {
  if (!value) return fallback;
  return options.find((option) => parameterValue(option) === value.toLowerCase()) ?? fallback;
}

export function parseLibraryNavigationState(
  searchParams: Pick<URLSearchParams, "get">
): LibraryNavigationState {
  return {
    status: allowedOption(
      searchParams.get("status"),
      statusFilters,
      defaultLibraryNavigationState.status
    ),
    genre: allowedOption(
      searchParams.get("genre"),
      genreFilters,
      defaultLibraryNavigationState.genre
    ),
    sort: allowedOption(
      searchParams.get("sort"),
      librarySortOptions,
      defaultLibraryNavigationState.sort
    ) as LibrarySort,
    view: allowedOption(
      searchParams.get("view"),
      libraryViewOptions,
      defaultLibraryNavigationState.view
    ) as LibraryView
  };
}

export function serializeLibraryNavigationState(state: LibraryNavigationState) {
  const params = new URLSearchParams();

  if (state.status !== defaultLibraryNavigationState.status) {
    params.set("status", parameterValue(state.status));
  }
  if (state.genre !== defaultLibraryNavigationState.genre) {
    params.set("genre", parameterValue(state.genre));
  }
  if (state.sort !== defaultLibraryNavigationState.sort) {
    params.set("sort", state.sort);
  }
  if (state.view !== defaultLibraryNavigationState.view) {
    params.set("view", state.view);
  }

  return params;
}
