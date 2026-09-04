import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import createJiti from "jiti";

const { MAX_PLACE_DEPTH, getPlaceHierarchy, placeParentError, createPlaceParentValidator } = createJiti(import.meta.url)("../lib/place-hierarchy.ts");
const node = (id, parentPlaceId = null, extra = {}) => ({ id, parentPlaceId, novelId: "novel-a", name: id, status: "active", ...extra });
const chain = (length) => Array.from({ length }, (_, index) => node(`node-${index}`, index ? `node-${index - 1}` : null));

test("breadcrumb and children derive current names from IDs, including archived parents", () => {
  const places = [node("grecia", null, { name: "Grecia", status: "archived" }), node("finca", "grecia", { name: "Finca" }), node("house", "finca"), node("foreign", "finca", { novelId: "novel-b" })];
  const before = structuredClone(places);
  const result = getPlaceHierarchy("novel-a", "finca", places);
  assert.deepEqual(result.breadcrumb.map((place) => place.name), ["Grecia", "Finca"]);
  assert.deepEqual(result.children.map((place) => place.id), ["house"]);
  assert.equal(result.issue, null);
  assert.deepEqual(places, before);
  places[0].name = "Grecia renamed";
  assert.equal(getPlaceHierarchy("novel-a", "finca", places).breadcrumb[0].name, "Grecia renamed");
  assert.equal(places[1].parentPlaceId, "grecia");
});

test("64-level trees are supported and new ancestors or moved subtrees cannot exceed the limit", () => {
  const places = chain(MAX_PLACE_DEPTH);
  assert.equal(getPlaceHierarchy("novel-a", `node-${MAX_PLACE_DEPTH - 1}`, places).breadcrumb.length, MAX_PLACE_DEPTH);
  assert.equal(getPlaceHierarchy("novel-a", `node-${MAX_PLACE_DEPTH - 1}`, places).issue, null);
  assert.equal(placeParentError("new", `node-${MAX_PLACE_DEPTH - 2}`, places), null);
  assert.match(placeParentError("new", `node-${MAX_PLACE_DEPTH - 1}`, places), /64 levels/);
  const subtree = [node("moving"), node("moving-child", "moving")];
  assert.match(placeParentError("moving", `node-${MAX_PLACE_DEPTH - 2}`, [...places, ...subtree]), /64 levels/);
  assert.equal(placeParentError("moving", `node-${MAX_PLACE_DEPTH - 3}`, [...places, ...subtree]), null);
});

test("self, deep cycles, corrupt cycles and missing parents fail safely", () => {
  const places = chain(40);
  assert.match(placeParentError("node-0", "node-0", places), /cycle/);
  assert.match(placeParentError("node-0", "node-39", places), /cycle/);
  const corrupt = [node("a", "b"), node("b", "a"), node("child", "a")];
  assert.match(placeParentError("new", "a", corrupt), /cycle/);
  const result = getPlaceHierarchy("novel-a", "child", corrupt);
  assert.match(result.issue, /cycle/);
  assert.equal(result.breadcrumb.length, 3);
  assert.equal(placeParentError("a", null, corrupt), null, "detaching can repair an existing cycle");
  assert.match(placeParentError("new", "missing", places), /same novel/);
  assert.match(getPlaceHierarchy("novel-a", "child", [node("child", "missing")]).issue, /unavailable/);
  assert.match(placeParentError("new", "a", [node("a"), node("a")]), /duplicate/);
});

test("corrupt oversized trees stop at the depth bound without recursion", () => {
  const places = chain(10000);
  const result = getPlaceHierarchy("novel-a", "node-9999", places);
  assert.equal(result.breadcrumb.length, MAX_PLACE_DEPTH);
  assert.match(result.issue, /64 levels/);
  assert.match(placeParentError("new", "node-9999", places), /64 levels/);
});

test("cross-novel ancestors, children and invalid targets never reveal foreign names", () => {
  const places = [node("a", "foreign"), node("foreign", null, { novelId: "novel-b", name: "Hidden foreign name" }), node("foreign-child", "a", { novelId: "novel-b" })];
  const result = getPlaceHierarchy("novel-a", "a", places);
  assert.deepEqual(result.breadcrumb.map((place) => place.id), ["a"]);
  assert.deepEqual(result.children, []);
  assert.match(result.issue, /unavailable/);
  const validate = createPlaceParentValidator(places.filter((place) => place.novelId === "novel-a"));
  assert.match(validate("new", "a"), /same novel/);
  assert.deepEqual(getPlaceHierarchy("novel-b", "a", places).children, []);
  assert.deepEqual(getPlaceHierarchy("novel-b", "a", places).breadcrumb, []);
});

test("children have stable ordering and navigation carries metadata only", () => {
  const places = [node("root"), node("z", "root", { name: "Same", notes: "private" }), node("a", "root", { name: "Same", status: "archived" })];
  const result = getPlaceHierarchy("novel-a", "root", places);
  assert.deepEqual(result.children.map((place) => place.id), ["a", "z"]);
  assert.equal(Object.hasOwn(result.children[1], "notes"), false);
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /nav aria-label="Place hierarchy"/);
  assert.match(page, /routeForPlaceCatalog\(ancestor.novelId, catalogState, ancestor.id\)/);
  assert.match(page, /routeForPlaceCatalog\(child.novelId, catalogState, child.id\)/);
  assert.match(page, /No child places yet/);
});
