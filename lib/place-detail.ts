import type { Location } from "@/lib/studio-domain";
import { isValidNovelRouteId, isValidPlaceRouteId } from "@/lib/studio-routes";

export async function loadPlaceDetail(novelId: string, placeId: string, signal: AbortSignal): Promise<Location> {
  if (!isValidNovelRouteId(novelId) || !isValidPlaceRouteId(placeId)) throw new Error("Place unavailable in this novel.");
  const response = await fetch(`/api/places/${encodeURIComponent(placeId)}?novelId=${encodeURIComponent(novelId)}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error(response.status === 404 ? "Place unavailable in this novel." : "Could not load this place. You can retry or choose another place.");
  const place: Location = await response.json();
  if (!place || place.id !== placeId || place.novelId !== novelId) throw new Error("Place unavailable in this novel.");
  return place;
}
