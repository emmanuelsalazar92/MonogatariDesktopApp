export const placeTypeLabels = {
  country: "Country", region: "Region", city_town: "City/Town", district_area: "District/Area",
  building: "Building", room_interior: "Room/Interior", natural_location: "Natural Location", other: "Other"
} as const;
export const placeStatusLabels = { active: "Active", archived: "Archived" } as const;
export type PlaceType = keyof typeof placeTypeLabels;
export type PlaceStatus = keyof typeof placeStatusLabels;
export const placeTypes = Object.keys(placeTypeLabels) as PlaceType[];
export const placeStatuses = Object.keys(placeStatusLabels) as PlaceStatus[];
export const isPlaceType = (value: unknown): value is PlaceType => typeof value === "string" && Object.hasOwn(placeTypeLabels, value);
export const isPlaceStatus = (value: unknown): value is PlaceStatus => typeof value === "string" && Object.hasOwn(placeStatusLabels, value);

// Read/migration compatibility only. New writes must use canonical codes.
export const legacyPlaceTypes: Record<string, PlaceType> = {
  Country: "country", Kingdom: "country", Region: "region", City: "city_town", "City/Town": "city_town",
  "District/Area": "district_area", House: "building", School: "building", Temple: "building", Shop: "building",
  Building: "building", Room: "room_interior", "Room/Interior": "room_interior", Forest: "natural_location",
  "Natural Location": "natural_location", Dungeon: "other", "Other World": "other", Other: "other"
};
export const legacyPlaceStatuses: Record<string, PlaceStatus> = { Active: "active", Inactive: "active", Archived: "archived" };
export function normalizePlaceType(value: unknown): PlaceType {
  return isPlaceType(value) ? value : typeof value === "string" && Object.hasOwn(legacyPlaceTypes, value) ? legacyPlaceTypes[value] : "other";
}
export function normalizePlaceStatus(value: unknown): PlaceStatus {
  return isPlaceStatus(value) ? value : typeof value === "string" && Object.hasOwn(legacyPlaceStatuses, value) ? legacyPlaceStatuses[value] : "active";
}
export function matchesPlaceClassification(place: { type: unknown; status: unknown }, type: string, status: string) {
  return (!isPlaceType(type) || normalizePlaceType(place.type) === type)
    && (status === "all" || normalizePlaceStatus(place.status) === (isPlaceStatus(status) ? status : "active"));
}
