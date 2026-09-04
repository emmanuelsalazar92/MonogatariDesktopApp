import type { Location } from "@/lib/studio-domain";
import { isPlaceType, isPlaceStatus } from "@/lib/place-classification";
import { isValidNovelRouteId } from "@/lib/studio-routes";

export const placeTextLimits = {
  name: 120,
  description: 10000,
  visualNotes: 5000,
  atmosphere: 5000,
  rules: 10000,
  notes: 10000
} as const;

export type PlaceMetadataInput = Pick<Location,
  "name" | "type" | "status" | "description" | "visualNotes" | "atmosphere" | "rules" | "notes" | "parentPlaceId"
>;
export type PlaceFieldErrors = Partial<Record<keyof PlaceMetadataInput, string>>;
type Validation<T> = { ok: true; data: T } | { ok: false; error: string; fieldErrors: PlaceFieldErrors };

export function validatePlaceMetadata(value: unknown): Validation<PlaceMetadataInput>;
export function validatePlaceMetadata(value: unknown, partial: true): Validation<Partial<PlaceMetadataInput>>;
export function validatePlaceMetadata(value: unknown, partial = false): Validation<Partial<PlaceMetadataInput>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Invalid place metadata", fieldErrors: {} };
  }
  const input = value as Record<string, unknown>;
  const allowed = new Set([...Object.keys(placeTextLimits), "type", "status", "parentPlaceId"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    return { ok: false, error: "Unknown or derived fields are not editable", fieldErrors: {} };
  }
  const data: Partial<PlaceMetadataInput> = {};
  const fieldErrors: PlaceFieldErrors = {};
  for (const field of Object.keys(placeTextLimits) as Array<keyof typeof placeTextLimits>) {
    if (partial && !Object.hasOwn(input, field)) continue;
    const raw = input[field] ?? (field === "name" ? null : "");
    if (typeof raw !== "string") { fieldErrors[field] = `${field} must be text`; continue; }
    const text = raw.normalize("NFC").trim();
    if (field === "name" && !text) fieldErrors.name = "Name is required";
    else if (text.length > placeTextLimits[field]) fieldErrors[field] = `Maximum ${placeTextLimits[field]} characters`;
    else data[field] = text;
  }
  if (!partial || Object.hasOwn(input, "type")) {
    const type = Object.hasOwn(input, "type") ? input.type : "other";
    if (!isPlaceType(type)) fieldErrors.type = "Type is invalid";
    else data.type = type as Location["type"];
  }
  if (!partial || Object.hasOwn(input, "status")) {
    const status = Object.hasOwn(input, "status") ? input.status : "active";
    if (!isPlaceStatus(status)) fieldErrors.status = "Status is invalid";
    else data.status = status as Location["status"];
  }
  if (!partial || Object.hasOwn(input, "parentPlaceId")) {
    const parent = input.parentPlaceId ?? null;
    if (parent !== null && (typeof parent !== "string" || !isValidNovelRouteId(parent))) {
      fieldErrors.parentPlaceId = "Parent place ID is invalid";
    } else data.parentPlaceId = parent as string | null;
  }
  if (Object.keys(fieldErrors).length) return { ok: false, error: "Review the highlighted fields", fieldErrors };
  if (partial && Object.keys(data).length === 0) return { ok: false, error: "No editable fields provided", fieldErrors };
  return { ok: true, data };
}

export { placeParentError } from "@/lib/place-hierarchy";
