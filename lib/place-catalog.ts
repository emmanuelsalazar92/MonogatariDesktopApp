import type { PlaceSummary } from "@/lib/studio-domain";
import type { PlaceSceneSummary } from "@/lib/scene-place";
import { isPlaceType, isPlaceStatus, matchesPlaceClassification, type PlaceType, type PlaceStatus } from "@/lib/place-classification";
import { isValidNovelRouteId, isValidPlaceRouteId, routeForPlace } from "@/lib/studio-routes";

export const placeSortLabels = {
  name: "Name", "last-edited": "Last edited", "first-appearance": "First appearance", "scene-count": "Scene count"
} as const;
export type PlaceSort = keyof typeof placeSortLabels;
export type PlaceCatalogState = { query: string; type: PlaceType | "all"; status: PlaceStatus | "all"; sort: PlaceSort };
export const defaultPlaceCatalogState: PlaceCatalogState = { query: "", type: "all", status: "active", sort: "name" };

export function parsePlaceCatalogState(params: Pick<URLSearchParams, "get">): PlaceCatalogState {
  const type = params.get("type");
  const status = params.get("status");
  const sort = params.get("sort");
  return {
    query: params.get("q")?.slice(0, 120) ?? "",
    type: isPlaceType(type) ? type : "all",
    status: status === "all" || isPlaceStatus(status) ? status : "active",
    sort: sort && Object.hasOwn(placeSortLabels, sort) ? sort as PlaceSort : "name"
  };
}

export function serializePlaceCatalogState(state: PlaceCatalogState) {
  const params = new URLSearchParams();
  if (state.query.trim()) params.set("q", state.query.slice(0, 120));
  if (isPlaceType(state.type)) params.set("type", state.type);
  if (state.status === "all" || state.status === "archived") params.set("status", state.status);
  if (state.sort !== "name" && Object.hasOwn(placeSortLabels, state.sort)) params.set("sort", state.sort);
  return params;
}

export function routeForPlaceCatalog(novelId: string, state: PlaceCatalogState, placeId?: string) {
  const path = routeForPlace(novelId, placeId);
  const query = serializePlaceCatalogState(state).toString();
  return query ? `${path}?${query}` : path;
}

// Selection comes from the route, never from the first filtered card or saved settings.
export function resolvePlaceSelection(novelId: string, placeId: string | null, places: PlaceSummary[]) {
  if (!isValidNovelRouteId(novelId) || !placeId || !isValidPlaceRouteId(placeId)) return null;
  return places.find((place) => place.id === placeId && place.novelId === novelId) ?? null;
}

function stableIdentity(left: PlaceSummary, right: PlaceSummary) {
  return left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) || left.id.localeCompare(right.id);
}
function compareAppearances(left?: PlaceSceneSummary | null, right?: PlaceSceneSummary | null) {
  if (!left || !right) return left ? -1 : right ? 1 : 0;
  return left.volumeOrder - right.volumeOrder || left.volumeId.localeCompare(right.volumeId)
    || left.chapterOrder - right.chapterOrder || left.chapterId.localeCompare(right.chapterId)
    || left.sceneOrder - right.sceneOrder || left.id.localeCompare(right.id);
}
function editedAt(place: PlaceSummary) {
  const value = place.updatedAt ? Date.parse(place.updatedAt) : NaN;
  return Number.isFinite(value) ? value : -Infinity;
}

export function filterAndSortPlaces(places: PlaceSummary[], state: PlaceCatalogState) {
  const query = state.query.trim().toLocaleLowerCase();
  return places.filter((place) => place.name.toLocaleLowerCase().includes(query) && matchesPlaceClassification(place, state.type, state.status))
    .sort((left, right) => {
      if (state.sort === "last-edited") return editedAt(right) - editedAt(left) || stableIdentity(left, right);
      if (state.sort === "scene-count") return (right.sceneCount ?? 0) - (left.sceneCount ?? 0) || stableIdentity(left, right);
      if (state.sort === "first-appearance") return compareAppearances(left.firstAppearanceScene, right.firstAppearanceScene) || stableIdentity(left, right);
      return stableIdentity(left, right);
    });
}

export function placeCatalogEmptyState(totalCount: number, resultCount: number) {
  return totalCount === 0 ? "no-places" : resultCount === 0 ? "no-matches" : null;
}
