import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import createJiti from "jiti";

const require = createRequire(import.meta.url);
const graph = createJiti(import.meta.url)("../lib/relationship-graph.ts");
const since = createJiti(import.meta.url)("../lib/relationship-since.ts");
const routes = createJiti(import.meta.url)("../lib/studio-routes.ts");
const catalog = createJiti(import.meta.url)("../lib/relationship-catalog.ts");
const relationshipTypes = createJiti(import.meta.url)("../lib/character-relationship.ts");
const characters = [{ id: "a", novelId: "n", name: "Juana" }, { id: "b", novelId: "n", name: "Juancho" }];
const relation = (id, type = "partner_of", from = "a", to = "b", overrides = {}) => ({ id, novelId: "n", relationshipType: type, fromCharacterId: from, toCharacterId: to, direction: "Directional", isSpoiler: false, notes: "PRIVATE NOTES", description: "PRIVATE DESCRIPTION", ...overrides });
const project = (relations, people = characters, show = false) => graph.graphEdges("n", people, relations, show);

test("Graph derives canonical labels/arrows and projects metadata only", () => {
  const edges = project([relation("spouse"), relation("distrust", "distrusts")]);
  assert.equal(edges.find((e) => e.id === "spouse").label, "Partner of");
  assert.equal(edges.find((e) => e.id === "spouse").directional, false);
  assert.deepEqual(edges.find((e) => e.id === "distrust"), { id: "distrust", from: "a", to: "b", label: "Distrusts", directional: true });
  assert.doesNotMatch(JSON.stringify(edges), /PRIVATE|notes|description/);
  assert.deepEqual(Object.keys(graph.visibleGraphCharacters("n", characters, false)[0]).sort(), ["id", "name"]);
});

test("Spoiler edges/nodes, stale endpoints and cross-novel IDs never reach graph or list", () => {
  const people = [...characters, { id: "secret", novelId: "n", name: "Hidden identity", isSpoiler: true }, { id: "foreign", novelId: "other", name: "Foreign" }];
  const relations = [relation("safe"), relation("spoiler", "enemy_of", "a", "b", { isSpoiler: true }), relation("node", "mentor_of", "a", "secret"), relation("foreign", "mentor_of", "a", "foreign"), relation("missing", "mentor_of", "a", "missing"), relation("other", "mentor_of", "a", "b", { novelId: "other" }), relation("self", "mentor_of", "a", "a"), relation("safe")];
  assert.deepEqual(project(relations, people).map((e) => e.id), ["safe"]);
  assert.deepEqual(project(relations, people, true).map((e) => e.id), ["node", "safe", "spoiler"]);
  assert.doesNotMatch(JSON.stringify(graph.visibleGraphCharacters("n", people, false)), /Hidden identity|Foreign/);
  assert.equal(graph.visibleGraphCharacters("n", [{ ...people[2], isSpoiler: undefined, narrativeStatus: "Spoiler" }], false).length, 0);
});

test("Two-node layout fits without wasted space and zoom preserves its anchor", () => {
  const model = graph.layoutRelationshipGraph(characters, project([relation("r")]));
  assert.equal(model.nodes.length, 2);
  for (const [width, height] of [[720, 400], [320, 256], [450, 300]]) {
    const camera = graph.fitGraph(model.nodes, width, height);
    for (const n of model.nodes) {
      assert.ok((n.x - 80) * camera.scale + camera.x >= 0);
      assert.ok((n.x + 80) * camera.scale + camera.x <= width);
      assert.ok((n.y - 26) * camera.scale + camera.y >= 0);
      assert.ok((n.y + 26) * camera.scale + camera.y <= height);
    }
    assert.ok(520 * camera.scale > width * 0.6);
    const zoomed = graph.zoomGraph(camera, 1.25, width / 2, height / 2);
    assert.equal((width / 2 - zoomed.x) / zoomed.scale, (width / 2 - camera.x) / camera.scale);
    const restored = graph.zoomGraph(zoomed, 0.8, width / 2, height / 2);
    for (const key of ["x", "y", "scale"]) assert.ok(Math.abs(restored[key] - camera[key]) < 1e-10);
  }
  assert.equal(graph.zoomGraph({ x: 0, y: 0, scale: 4 }, 10, 0, 0).scale, 4);
  assert.equal(graph.zoomGraph({ x: 0, y: 0, scale: 0.1 }, 0.01, 0, 0).scale, 0.1);
});

test("Parallel and opposite links occupy distinct lanes and terminate outside nodes", () => {
  const edges = project([relation("a", "distrusts"), relation("b", "distrusts", "b", "a"), relation("c")]);
  const model = graph.layoutRelationshipGraph(characters, edges);
  const paths = edges.map((e) => graph.graphEdgeGeometry(e, model.nodes, edges));
  assert.equal(new Set(paths.map((p) => p.y)).size, 3);
  for (const p of paths) { assert.doesNotMatch(p.path, /NaN|Infinity/); assert.match(p.path, /^M .+ Q /); }
  assert.deepEqual(graph.layoutRelationshipGraph(characters.toReversed(), edges.toReversed().sort((a, b) => a.id.localeCompare(b.id))), model);
  const vertical = model.nodes.map((node, i) => ({ ...node, x: 0, y: i * 220 - 110 }));
  assert.equal(new Set(edges.map((edge) => graph.graphEdgeGeometry(edge, vertical, edges).y)).size, 3, "narrow parallel labels are staggered");
});

test("300 characters/1000 links use a bounded deterministic ego-network without truncating list data", () => {
  const people = Array.from({ length: 300 }, (_, i) => ({ id: `c${i}`, name: `Character ${i}`, novelId: "n" }));
  const relations = Array.from({ length: 1000 }, (_, i) => relation(`r${i}`, "friend_of", `c${Math.floor(i / 299)}`, `c${i % 299 + 1}`));
  const edges = project(relations, people);
  const model = graph.layoutRelationshipGraph(people, edges);
  assert.ok(model.nodes.length <= 18); assert.ok(model.edges.length <= 36); assert.equal(model.limited, true);
  assert.ok(edges.length > 990, "full list remains available outside bounded graph");
  assert.ok(model.edges.every((e) => e.from === model.egoId || e.to === model.egoId));
  assert.deepEqual(graph.layoutRelationshipGraph(people.toReversed(), project(relations.toReversed(), people)), model);
  const focused = graph.layoutRelationshipGraph(people, edges, "c21");
  assert.equal(focused.egoId, "c21"); assert.ok(focused.edges.every((e) => e.from === "c21" || e.to === "c21"));
  assert.equal(graph.layoutRelationshipGraph([], [], "foreign").nodes.length, 0);
});

const button = ({ children, ...props }) => React.createElement("button", props, children);
function loadComponent(path, extra = {}) {
  const exports = {};
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const modules = { react: React, "react/jsx-runtime": require("react/jsx-runtime"), "@/components/ui/button": { Button: button }, "@/lib/relationship-graph": graph,
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) }, "@/lib/relationship-since": since, "@/lib/studio-routes": routes, ...extra };
  new Function("require", "exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)((id) => modules[id], exports);
  return exports;
}
const graphComponent = loadComponent("components/studio/relationship-graph.tsx");
const explorer = loadComponent("components/studio/relationship-explorer.tsx", { "./relationship-graph": graphComponent,
  "@/lib/relationship-catalog": catalog, "@/lib/character-relationship": relationshipTypes,
  "./relationship-actions": { RelationshipActions: () => null } });

test("SVG and textual list expose keyboard controls, escaped labels, direction and spoiler-safe empty states", () => {
  const people = [{ ...characters[0], name: "<script>Juana</script>" }, characters[1]];
  const relations = [relation("partner"), relation("direction", "distrusts"), relation("spoiler", "enemy_of", "a", "b", { isSpoiler: true })];
  const html = renderToStaticMarkup(React.createElement(explorer.RelationshipExplorer, { novelId: "n", characters: people, relationships: relations, showSpoilers: false, focusId: "All characters", sinceOptions: [], onFocusCharacter() {}, onRemove() {} }));
  assert.match(html, /&lt;script&gt;Juana&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>|Enemy of|PRIVATE/);
  assert.match(html, /Complete filtered relationship list/); assert.match(html, /Relationship detail/);
  assert.match(html, /aria-label="Zoom in"/); assert.match(html, /Reset \/ Fit/); assert.match(html, /aria-label="Pan left"/);
  assert.equal((html.match(/data-graph-item="node"/g) ?? []).length, 2);
  assert.equal((html.match(/data-graph-item="edge"/g) ?? []).length, 2);
  assert.equal((html.match(/marker-end=/g) ?? []).length, 1);
  assert.match(html, /role="button" tabindex="0"/);
  const empty = renderToStaticMarkup(React.createElement(explorer.RelationshipExplorer, { novelId: "n", characters: people, relationships: [relations[2]], showSpoilers: false, focusId: "All characters", sinceOptions: [], onFocusCharacter() {}, onRemove() {} }));
  assert.match(empty, /No visible relationships/); assert.doesNotMatch(empty, /Enemy of|data-graph-item/);
});

test("Character summary exposes only the spoiler flag needed to enforce node visibility", () => {
  const source = readFileSync(new URL("../lib/db/studio.ts", import.meta.url), "utf8");
  const summary = source.slice(source.indexOf("function serializeCharacterSummary("), source.indexOf("function serializeNovel("));
  assert.match(summary, /isSpoiler: storedStatus.narrative === "Spoiler"/);
  assert.doesNotMatch(summary, /secret:|notes:|description:/);
});

test("Complete list paginates metadata instead of rendering hundreds of private detail cards", () => {
  const people = Array.from({ length: 100 }, (_, i) => ({ id: `c${i}`, name: `Character ${i}`, novelId: "n" }));
  const relationships = Array.from({ length: 99 }, (_, i) => relation(`r${i}`, "friend_of", "c0", `c${i + 1}`));
  const html = renderToStaticMarkup(React.createElement(explorer.RelationshipExplorer, { novelId: "n", characters: people, relationships, showSpoilers: false, focusId: "All characters", sinceOptions: [], onFocusCharacter() {}, onRemove() {} }));
  assert.equal((html.match(/<li>/g) ?? []).length, 20);
  assert.match(html, /Page 1 of 5/); assert.match(html, /18 characters \/ 36 links maximum/);
  assert.doesNotMatch(html, /PRIVATE/);
});
