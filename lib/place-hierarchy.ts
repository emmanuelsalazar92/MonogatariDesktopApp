export const MAX_PLACE_DEPTH = 64;

type ParentNode = { id: string; parentPlaceId: string | null };
type PlaceNode = ParentNode & { novelId: string; name: string; status: string };

// Callers supply only nodes in the target novel. Index once for all selector options.
export function createPlaceParentValidator(places: readonly ParentNode[]) {
  const parents = new Map(places.map((place) => [place.id, place.parentPlaceId]));
  const children = new Map<string, string[]>();
  for (const place of places) {
    if (place.parentPlaceId === null) continue;
    const siblings = children.get(place.parentPlaceId) ?? [];
    siblings.push(place.id);
    children.set(place.parentPlaceId, siblings);
  }
  return (placeId: string, parentPlaceId: string | null): string | null => {
    if (parents.size !== places.length) return "Place hierarchy contains duplicate IDs";
    const visited = new Set([placeId]);
    let current = parentPlaceId;
    let depth = 1;
    while (current !== null) {
      if (visited.has(current)) return "Parent place would create a cycle";
      if (!parents.has(current)) return "Parent place must belong to the same novel";
      if (++depth > MAX_PLACE_DEPTH) return `Place hierarchy cannot exceed ${MAX_PLACE_DEPTH} levels`;
      visited.add(current);
      current = parents.get(current) ?? null;
    }
    // Moving a subtree must not push any of its descendants past the limit.
    const queue = [{ id: placeId, depth }];
    const descendants = new Set([placeId]);
    for (let index = 0; index < queue.length; index++) {
      const node = queue[index];
      for (const child of children.get(node.id) ?? []) {
        if (child === placeId) continue; // The moved node's previous parent edge is replaced.
        if (descendants.has(child)) return "Place hierarchy contains a cycle";
        if (node.depth + 1 > MAX_PLACE_DEPTH) return `Place hierarchy cannot exceed ${MAX_PLACE_DEPTH} levels`;
        descendants.add(child);
        queue.push({ id: child, depth: node.depth + 1 });
      }
    }
    return null;
  };
}

export function placeParentError(placeId: string, parentPlaceId: string | null, places: readonly ParentNode[]) {
  return createPlaceParentValidator(places)(placeId, parentPlaceId);
}

// Read-only, novel-scoped projection: names and paths are never duplicated in storage.
export function getPlaceHierarchy(novelId: string, placeId: string, places: readonly PlaceNode[]) {
  const scoped = places.filter((place) => place.novelId === novelId);
  const byId = new Map(scoped.map((place) => [place.id, place]));
  const breadcrumb: PlaceNode[] = [];
  const visited = new Set<string>();
  let current: string | null = placeId;
  let issue: string | null = null;
  while (current !== null) {
    if (visited.has(current)) { issue = "Place hierarchy contains a cycle. Edit Parent place to repair it."; break; }
    if (breadcrumb.length === MAX_PLACE_DEPTH) { issue = `Place hierarchy exceeds ${MAX_PLACE_DEPTH} levels. Edit Parent place to shorten it.`; break; }
    const place = byId.get(current);
    if (!place) { issue = "Part of this hierarchy is unavailable. Edit Parent place to repair it."; break; }
    visited.add(current);
    // Return navigation metadata only, never Notes or long narrative fields.
    breadcrumb.push({ id: place.id, novelId, name: place.name, status: place.status, parentPlaceId: place.parentPlaceId });
    current = place.parentPlaceId;
  }
  const children = byId.has(placeId) ? scoped
    .filter((place) => place.parentPlaceId === placeId && place.id !== placeId)
    .map((place) => ({ id: place.id, novelId, name: place.name, status: place.status, parentPlaceId: place.parentPlaceId }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) : [];
  return { breadcrumb: breadcrumb.reverse(), children, issue };
}
