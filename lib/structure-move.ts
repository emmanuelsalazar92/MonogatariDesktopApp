export const structureMovePositions = ["start", "end", "before", "after"] as const;

export type StructureMovePosition = (typeof structureMovePositions)[number];

/** Builds a normalized sibling order without mutating the input list. */
export function insertStructureItem(
  orderedIds: readonly string[],
  sourceId: string,
  position: StructureMovePosition,
  referenceId?: string
) {
  const siblings = orderedIds.filter((id) => id !== sourceId);

  if ((position === "before" || position === "after") && !referenceId) {
    throw new Error("a reference item is required for this position");
  }
  if (referenceId === sourceId) throw new Error("an item cannot be its own move reference");

  let index = position === "start" ? 0 : siblings.length;
  if (position === "before" || position === "after") {
    const referenceIndex = siblings.indexOf(referenceId!);
    if (referenceIndex < 0) throw new Error("move reference is not in the destination");
    index = referenceIndex + (position === "after" ? 1 : 0);
  }

  return [...siblings.slice(0, index), sourceId, ...siblings.slice(index)];
}
