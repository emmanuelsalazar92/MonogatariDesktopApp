// Chronology is always ordered manually; relative values describe time, never override sortIndex.
export const TIMELINE_ORDER_LIMIT = 1_000_000_000;
export type TimelinePosition = {
  sortIndex: number; chronologyKind: "manual" | "relative";
  relativeDay: number | null; relativeMinute: number | null;
  internalDate: string; volumeId: string | null; chapterId: string | null; sceneId: string | null;
};
export const validTimelineOrder = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && Math.abs(value) <= TIMELINE_ORDER_LIMIT;

export function readTimelinePosition(value: unknown): { ok: true; data: Omit<TimelinePosition, "sortIndex"> & { sortIndex?: number } } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Invalid timeline position" };
  const input = value as Record<string, unknown>;
  if (input.sortIndex !== undefined && !validTimelineOrder(input.sortIndex)) return { ok: false, error: "Order must be an integer between -1000000000 and 1000000000" };
  const chronologyKind = input.chronologyKind ?? "manual";
  if (chronologyKind !== "manual" && chronologyKind !== "relative") return { ok: false, error: "Invalid chronology kind" };
  const relativeDay = input.relativeDay ?? null, relativeMinute = input.relativeMinute ?? null;
  if ((relativeDay !== null && !validTimelineOrder(relativeDay)) || (relativeMinute !== null && (!Number.isInteger(relativeMinute) || typeof relativeMinute !== "number" || relativeMinute < 0 || relativeMinute > 1439))) return { ok: false, error: "Invalid relative day or minute" };
  if ((chronologyKind === "manual" && (relativeDay !== null || relativeMinute !== null)) || (chronologyKind === "relative" && relativeDay === null)) return { ok: false, error: "Relative chronology requires a day; manual chronology has no date" };
  const internalDate = input.internalDate ?? "";
  if (typeof internalDate !== "string" || internalDate.length > 200) return { ok: false, error: "Display label must be at most 200 characters" };
  const ids: Record<"volumeId" | "chapterId" | "sceneId", string | null> = { volumeId: null, chapterId: null, sceneId: null };
  for (const key of ["volumeId", "chapterId", "sceneId"] as const) {
    const id = input[key];
    if (id !== undefined && id !== null && (typeof id !== "string" || (id !== "" && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id)))) return { ok: false, error: `Invalid ${key}` };
    ids[key] = typeof id === "string" && id ? id : null;
  }
  return { ok: true, data: { sortIndex: input.sortIndex as number | undefined, chronologyKind, relativeDay: relativeDay as number | null, relativeMinute: relativeMinute as number | null, internalDate: internalDate.trim(), ...ids } };
}

// Invalid legacy indices fall back deterministically, never to a label/date comparison.
export function compareChronology(a: { id: string; sortIndex?: number }, b: { id: string; sortIndex?: number }) {
  const order = (validTimelineOrder(a.sortIndex) ? a.sortIndex : 0) - (validTimelineOrder(b.sortIndex) ? b.sortIndex : 0);
  return order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
