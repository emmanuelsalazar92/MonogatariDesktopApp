import { genreFilters, statusFilters } from "@/lib/studio-domain";
import type { Novel } from "@/lib/studio-domain";

export const librarySortOptions = ["updated", "title", "created", "words"] as const;
export const librarySearchLimit = 160;
export const libraryNarrativeStatuses = statusFilters.filter(status => status !== "Archived");
export type LibraryLifecycle = "active" | "archived";
export const libraryViewOptions = ["grid", "list"] as const;

export type LibrarySort = (typeof librarySortOptions)[number];
export type LibraryView = (typeof libraryViewOptions)[number];

export type LibraryNavigationState = {
  status: string;
  genre: string;
  sort: LibrarySort;
  lifecycle: LibraryLifecycle;
};

export const defaultLibraryNavigationState: LibraryNavigationState = {
  status: "All statuses",
  genre: "All genres",
  sort: "updated",
  lifecycle: "active"
};

function parameterValue(value: string) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "-");
}

function allowedOption(value: string | null, options: readonly string[], fallback: string) {
  if (!value) return fallback;
  return options.find((option) => parameterValue(option) === parameterValue(value)) ?? fallback;
}

function allowedGenre(value: string | null, options: readonly string[]) {
  if (!value || value.length > 120) return "All genres";
  const exact = options.find(option => searchKey(option) === searchKey(value));
  if (exact) return exact;
  const legacy = options.filter(option => parameterValue(option) === parameterValue(value));
  return legacy.length === 1 ? legacy[0] : "All genres";
}

export function parseLibraryNavigationState(
  searchParams: Pick<URLSearchParams, "get">,
  genres: readonly string[] = genreFilters
): LibraryNavigationState {
  // Preserve old archived links without treating archival as a narrative stage.
  const lifecycle = searchParams.get("lifecycle") === "archived" || searchParams.get("status")?.toLowerCase() === "archived" ? "archived" : "active";
  return {
    lifecycle,
    status: lifecycle === "archived" ? "All statuses" : allowedOption(
      searchParams.get("status"),
      libraryNarrativeStatuses,
      defaultLibraryNavigationState.status
    ),
    genre: allowedGenre(searchParams.get("genre"), genres),
    sort: allowedOption(
      searchParams.get("sort"),
      librarySortOptions,
      defaultLibraryNavigationState.sort
    ) as LibrarySort
  };
}

export function serializeLibraryNavigationState(state: LibraryNavigationState) {
  const params = new URLSearchParams();
  if (state.lifecycle === "archived") params.set("lifecycle", "archived");

  if (state.lifecycle !== "archived" && state.status !== defaultLibraryNavigationState.status) {
    params.set("status", parameterValue(state.status));
  }
  if (state.genre !== defaultLibraryNavigationState.genre) {
    params.set("genre", searchKey(state.genre));
  }
  if (state.sort !== defaultLibraryNavigationState.sort) {
    params.set("sort", state.sort);
  }

  return params;
}

export function boundedLibrarySearch(value: string) {
  return Array.from(value).slice(0, librarySearchLimit).join("");
}

function searchKey(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
const stableId = (a: Novel, b: Novel) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export function libraryGenres(novels: readonly Novel[]) {
  const unique = new Map<string, string>();
  for (const novel of novels) {
    const label = novel.genre.trim().normalize("NFKC");
    if (label && label.length <= 120 && !unique.has(searchKey(label))) unique.set(searchKey(label), label);
  }
  return ["All genres", ...Array.from(unique.values()).filter(label => searchKey(label) !== "all genres").sort(collator.compare)];
}

export function filterAndSortNovels(novels: readonly Novel[], query: string, state: LibraryNavigationState) {
  const search = searchKey(boundedLibrarySearch(query));
  const timestamp = (value: string) => Date.parse(value) || 0;
  return novels.filter(novel =>
    (state.lifecycle === "archived" ? novel.status === "Archived" : novel.status !== "Archived") &&
    (state.lifecycle === "archived" || state.status === "All statuses" || novel.status === state.status) &&
    (state.genre === "All genres" || searchKey(novel.genre) === searchKey(state.genre)) &&
    searchKey(novel.title).includes(search)
  ).sort((a, b) => {
    const order = state.sort === "title" ? collator.compare(a.title.normalize("NFKC"), b.title.normalize("NFKC"))
      : state.sort === "created" ? timestamp(b.createdAt) - timestamp(a.createdAt)
      : state.sort === "words" ? b.wordCount - a.wordCount
      : timestamp(b.updatedAt) - timestamp(a.updatedAt);
    return order || stableId(a, b);
  });
}
