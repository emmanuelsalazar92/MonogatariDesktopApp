import type { Character, Relationship } from "./studio-domain";
import { resolveRelationshipSemantics, relationshipIsVisible } from "./character-relationship";

export type GraphCharacter = Pick<Character, "id" | "novelId" | "name"> & { isSpoiler?: boolean; narrativeStatus?: string };
export type GraphEdge = { id: string; from: string; to: string; label: string; directional: boolean };
export type GraphNode = { id: string; name: string; x: number; y: number };
export type GraphModel = { nodes: GraphNode[]; edges: GraphEdge[]; egoId: string | null; limited: boolean; total: number };
export const GRAPH_NODE_LIMIT = 18;
export const GRAPH_EDGE_LIMIT = 36;

export function visibleGraphCharacters(novelId: string, characters: GraphCharacter[], showSpoilers: boolean) {
  return characters.filter((c) => c.novelId === novelId && (showSpoilers || (!c.isSpoiler && c.narrativeStatus !== "Spoiler")))
    .map(({ id, name }) => ({ id, name }));
}

// Project only IDs/labels; manuscript, descriptions and private notes never enter the graph.
export function graphEdges(novelId: string, characters: GraphCharacter[], relationships: Pick<Relationship,
  "id" | "novelId" | "fromCharacterId" | "toCharacterId" | "relationshipType" | "direction" | "isSpoiler">[], showSpoilers: boolean): GraphEdge[] {
  const people = new Map(characters.filter((c) => c.novelId === novelId).map((c) => [c.id, { novelId: c.novelId, isSpoiler: c.isSpoiler || c.narrativeStatus === "Spoiler" }]));
  const seen = new Set<string>();
  return relationships.filter((r) => {
    if (r.novelId !== novelId || !relationshipIsVisible(r, people.get(r.fromCharacterId), people.get(r.toCharacterId), showSpoilers) || r.fromCharacterId === r.toCharacterId || seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  }).map((r) => {
    const semantics = resolveRelationshipSemantics(r.relationshipType, r.direction);
    return { id: r.id, from: r.fromCharacterId, to: r.toCharacterId, label: semantics.labelFromTo, directional: semantics.direction === "Directional" };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

export function layoutRelationshipGraph(characters: { id: string; name: string }[], edges: GraphEdge[], focusId?: string): GraphModel {
  const names = new Map(characters.map((c) => [c.id, c.name]));
  const degree = new Map<string, number>();
  for (const edge of edges) for (const id of [edge.from, edge.to]) degree.set(id, (degree.get(id) ?? 0) + 1);
  const large = degree.size > GRAPH_NODE_LIMIT || edges.length > GRAPH_EDGE_LIMIT;
  const egoId = focusId && names.has(focusId) ? focusId : large
    ? [...degree.keys()].sort((a, b) => degree.get(b)! - degree.get(a)! || a.localeCompare(b))[0] : null;
  const candidates = egoId ? edges.filter((e) => e.from === egoId || e.to === egoId) : edges;
  const ids = new Set<string>(egoId ? [egoId] : []);
  const visible: GraphEdge[] = [];
  for (const edge of candidates) {
    const added = Number(!ids.has(edge.from)) + Number(!ids.has(edge.to));
    if (ids.size + added > GRAPH_NODE_LIMIT || visible.length === GRAPH_EDGE_LIMIT) continue;
    ids.add(edge.from); ids.add(edge.to); visible.push(edge);
  }
  const sorted = [...ids].sort();
  const ring = sorted.filter((id) => id !== egoId);
  const radius = Math.max(210, ring.length * 36);
  const nodes = sorted.map((id) => {
    const index = ring.indexOf(id);
    const angle = (2 * Math.PI * index) / Math.max(1, ring.length);
    const point = sorted.length === 2 ? { x: sorted.indexOf(id) * 360 - 180, y: 0 }
      : id === egoId || sorted.length === 1 ? { x: 0, y: 0 }
        : { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    return { id, name: names.get(id) ?? "Unavailable character", ...point };
  });
  return { nodes, edges: visible, egoId: egoId ?? null, limited: visible.length < edges.length, total: edges.length };
}

// Parallel and opposite edges use different lanes, with arrowheads clipped to node borders.
export function graphEdgeGeometry(edge: GraphEdge, nodes: GraphNode[], edges: GraphEdge[]) {
  const from = nodes.find((n) => n.id === edge.from)!;
  const to = nodes.find((n) => n.id === edge.to)!;
  const pair = edges.filter((e) => (e.from === edge.from && e.to === edge.to) || (e.from === edge.to && e.to === edge.from)).sort((a, b) => a.id.localeCompare(b.id));
  const offset = (pair.findIndex((e) => e.id === edge.id) - (pair.length - 1) / 2) * 80;
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy) || 1;
  const orientation = edge.from < edge.to ? 1 : -1;
  const control = { x: (from.x + to.x) / 2 - dy / length * offset * orientation, y: (from.y + to.y) / 2 + dx / length * offset * orientation };
  const border = (n: GraphNode) => {
    const x = control.x - n.x, y = control.y - n.y;
    const scale = Math.min(84 / Math.max(Math.abs(x), 0.001), 30 / Math.max(Math.abs(y), 0.001));
    return { x: n.x + x * scale, y: n.y + y * scale };
  };
  const a = border(from), b = border(to);
  const index = pair.findIndex((e) => e.id === edge.id);
  const t = Math.abs(dy) > Math.abs(dx) && pair.length > 1 ? (index + 1) / (pair.length + 1) : 0.5;
  return { path: `M ${a.x} ${a.y} Q ${control.x} ${control.y} ${b.x} ${b.y}`,
    x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * control.x + t ** 2 * b.x,
    y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * control.y + t ** 2 * b.y };
}

export type GraphCamera = { x: number; y: number; scale: number };
export function fitGraph(nodes: GraphNode[], width: number, height: number): GraphCamera {
  if (!nodes.length) return { x: width / 2, y: height / 2, scale: 1 };
  const left = Math.min(...nodes.map((n) => n.x)) - 110, right = Math.max(...nodes.map((n) => n.x)) + 110;
  const top = Math.min(...nodes.map((n) => n.y)) - 90, bottom = Math.max(...nodes.map((n) => n.y)) + 90;
  const scale = Math.max(0.1, Math.min(1.5, width / (right - left), height / (bottom - top)));
  return { x: width / 2 - (left + right) / 2 * scale, y: height / 2 - (top + bottom) / 2 * scale, scale };
}

export function zoomGraph(camera: GraphCamera, factor: number, x: number, y: number): GraphCamera {
  const scale = Math.max(0.1, Math.min(4, camera.scale * factor));
  const ratio = scale / camera.scale;
  return { x: x - (x - camera.x) * ratio, y: y - (y - camera.y) * ratio, scale };
}
