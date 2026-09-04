export const placeImpactKeys = ["children", "scenes", "characters", "events"] as const;
export type PlaceReferenceCounts = Record<(typeof placeImpactKeys)[number], number>;
export type PlaceDeleteImpact = PlaceReferenceCounts & {
  id: string; novelId: string; name: string; status: "active" | "archived"; revision: number; canDelete: boolean;
};
export type PlaceDeleteConfirmation = { revision: number; impact: PlaceReferenceCounts };

export function readPlaceLifecycleConfirmation(value: unknown): { revision: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["novelId", "confirmed", "revision"].includes(key))) return null;
  return body.confirmed === true && Number.isSafeInteger(body.revision) && (body.revision as number) >= 0
    ? { revision: body.revision as number } : null;
}

export function readPlaceDeleteConfirmation(value: unknown): PlaceDeleteConfirmation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { impact, ...confirmation } = value as Record<string, unknown>;
  const parsed = readPlaceLifecycleConfirmation(confirmation);
  if (!parsed || !impact || typeof impact !== "object" || Array.isArray(impact)) return null;
  const counts = impact as Record<string, unknown>;
  if (Object.keys(counts).length !== placeImpactKeys.length || placeImpactKeys.some((key) => !Number.isSafeInteger(counts[key]) || (counts[key] as number) < 0)) return null;
  return { ...parsed, impact: Object.fromEntries(placeImpactKeys.map((key) => [key, counts[key]])) as PlaceReferenceCounts };
}

export function canDeletePlace(counts: PlaceReferenceCounts) {
  return placeImpactKeys.every((key) => counts[key] === 0);
}
