import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
async function loadTs(path, modules = {}) {
  const { outputText } = ts.transpileModule(await readFile(resolve(path), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  });
  const result = { exports: {} };
  new Function("require", "exports", "module", outputText)((id) => {
    if (Object.hasOwn(modules, id)) return modules[id];
    throw new Error(`Unexpected dependency ${id}`);
  }, result.exports, result);
  return result.exports;
}
const routes = await loadTs("lib/studio-routes.ts");
const classification = await loadTs("lib/place-classification.ts");
const catalog = await loadTs("lib/place-catalog.ts", { "@/lib/place-classification": classification, "@/lib/studio-routes": routes });
const defaults = catalog.defaultPlaceCatalogState;
const place = (id, values = {}) => ({ id, novelId: "a", name: id, type: "building", status: "active", ...values });
const scene = (id, volumeOrder, chapterOrder, sceneOrder, values = {}) => ({ id, volumeId: `v-${volumeOrder}`, chapterId: `c-${chapterOrder}`, volumeOrder, chapterOrder, sceneOrder, title: "Scene", label: "Unrelated visual title", ...values });
const ids = (places, state) => catalog.filterAndSortPlaces(places, { ...defaults, ...state }).map((item) => item.id);

test("Places catalog URL accepts only bounded search and canonical filter/sort codes", () => {
  assert.deepEqual(catalog.parsePlaceCatalogState(new URLSearchParams()), defaults);
  const state = { query: "Finca de Juancho", type: "building", status: "archived", sort: "scene-count" };
  assert.deepEqual(catalog.parsePlaceCatalogState(catalog.serializePlaceCatalogState(state)), state);
  for (const value of ["constructor", "__proto__", "invalid", "Destroyed", "Building"]) {
    assert.deepEqual(catalog.parsePlaceCatalogState(new URLSearchParams({ type: value, status: value, sort: value })), defaults);
  }
  assert.equal(catalog.parsePlaceCatalogState(new URLSearchParams({ q: "x".repeat(500) })).query.length, 120);
  const dirty = new URLSearchParams("type=bad&sort=bad&notes=private&description=private");
  assert.equal(catalog.serializePlaceCatalogState(catalog.parsePlaceCatalogState(dirty)).toString(), "");
  assert.equal(catalog.serializePlaceCatalogState(defaults).toString(), "");
  for (const type of classification.placeTypes) assert.equal(catalog.parsePlaceCatalogState(new URLSearchParams({ type })).type, type);
  for (const status of ["all", ...classification.placeStatuses]) assert.equal(catalog.parsePlaceCatalogState(new URLSearchParams({ status })).status, status);
  for (const sort of Object.keys(catalog.placeSortLabels)) assert.equal(catalog.parsePlaceCatalogState(new URLSearchParams({ sort })).sort, sort);
});

test("Places search matches Name only and combines Type and lifecycle Status", () => {
  const places = [
    place("finca", { name: "Finca de Juancho" }),
    place("archived", { name: "Finca antigua", status: "archived" }),
    place("forest", { name: "Finca forestal", type: "natural_location" }),
    place("private", { name: "Elsewhere", notes: "Finca", description: "Finca", region: "Finca" })
  ];
  assert.deepEqual(ids(places, { query: "  fINca ", type: "building" }), ["finca"]);
  assert.deepEqual(ids(places, { query: "finca", type: "building", status: "archived" }), ["archived"]);
  assert.deepEqual(ids(places, { query: "finca", status: "all" }), ["archived", "finca", "forest"]);
  assert.deepEqual(ids(places, { query: "' OR 1=1 --", status: "all" }), []);
  assert.deepEqual(ids(places, { query: "", type: "building" }), ["private", "finca"]);
  assert.deepEqual(ids(places, { query: "missing" }), []);
});

test("Places sort is stable for names, real edit times and scene counts", () => {
  const places = [
    place("b", { name: "Alpha", updatedAt: "2026-01-01T00:00:00Z", sceneCount: 2 }),
    place("a", { name: "alpha", updatedAt: "2026-01-01T00:00:00Z", sceneCount: 2 }),
    place("c", { name: "Charlie", updatedAt: "2026-06-01T00:00:00Z", sceneCount: 12 }),
    place("unknown", { name: "Bravo", updatedAt: null }),
    place("invalid", { name: "Delta", updatedAt: "invalid" })
  ];
  assert.deepEqual(ids(places, { sort: "name" }), ["a", "b", "unknown", "c", "invalid"]);
  assert.deepEqual(ids(places, { sort: "last-edited" }), ["c", "a", "b", "unknown", "invalid"]);
  assert.deepEqual(ids(places, { sort: "scene-count" }), ["c", "a", "b", "unknown", "invalid"]);
  assert.equal(places[0].id, "b", "sorting does not mutate the source snapshot");
});

test("First appearance sorting uses narrative IDs and numeric order, not duplicated labels", () => {
  const places = [
    place("late-volume", { firstAppearance: "A", firstAppearanceScene: scene("s1", 10, 1, 1) }),
    place("late-chapter", { firstAppearance: "B", firstAppearanceScene: scene("s2", 1, 10, 1) }),
    place("late-scene", { firstAppearance: "C", firstAppearanceScene: scene("s3", 1, 2, 10) }),
    place("first", { firstAppearance: "Z", firstAppearanceScene: scene("s4", 1, 2, 2) }),
    place("none", { firstAppearance: "Legacy manual text", firstAppearanceScene: null })
  ];
  assert.deepEqual(ids(places, { sort: "first-appearance" }), ["first", "late-scene", "late-chapter", "late-volume", "none"]);
  places[0].firstAppearanceScene.volumeOrder = 0;
  assert.equal(ids(places, { sort: "first-appearance" })[0], "late-volume", "reordering Structure updates sorting");
  places[0].firstAppearanceScene = null;
  assert.equal(ids(places, { sort: "first-appearance" })[0], "first", "unlink updates sorting");
  const tied = [place("z", { firstAppearanceScene: scene("s", 1, 1, 1) }), place("a", { firstAppearanceScene: scene("s", 1, 1, 1) })];
  assert.deepEqual(ids(tied, { sort: "first-appearance" }), ["a", "z"]);
});

test("Catalog deep links retain URL state and Clear removes query parameters", () => {
  const state = { query: "Finca & Casa", type: "building", status: "all", sort: "first-appearance" };
  const url = new URL(catalog.routeForPlaceCatalog("a", state, "finca"), "http://localhost");
  assert.deepEqual(routes.parseStudioRoute(url.pathname), { page: "places", novelId: "a", placeId: "finca" });
  assert.deepEqual(catalog.parsePlaceCatalogState(url.searchParams), state);
  assert.equal(catalog.routeForPlaceCatalog("a", defaults, "finca"), "/novels/a/places/finca");
  assert.equal(catalog.routeForPlaceCatalog("a", defaults), "/novels/a/places");
});

test("Place empty states distinguish onboarding, zero matches and archived-only libraries with working CTAs", async () => {
  assert.equal(catalog.placeCatalogEmptyState(0, 0), "no-places");
  assert.equal(catalog.placeCatalogEmptyState(12, 0), "no-matches");
  assert.equal(catalog.placeCatalogEmptyState(12, 3), null);
  const Button = ({ children, onClick, type }) => React.createElement("button", { onClick, type }, children);
  const { PlaceCatalogEmptyState } = await loadTs("components/studio/place-catalog-empty-state.tsx", {
    "react/jsx-runtime": require("react/jsx-runtime"), "@/lib/place-catalog": catalog,
    "@/components/ui/button": { Button },
    "@/components/studio/shared": { MapIcon: () => null, EmptyState: ({ title, description }) => React.createElement("div", null, React.createElement("h3", null, title), description) }
  });
  const calls = [];
  const props = { totalCount: 0, resultCount: 0, onlyArchived: false, onAddPlace: () => calls.push("add"), onClearFilters: () => calls.push("clear"), onShowArchived: () => calls.push("archived") };
  const buttons = (node) => !React.isValidElement(node) ? [] : [ ...(node.type === Button ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(buttons) ];
  const empty = PlaceCatalogEmptyState(props);
  assert.match(renderToStaticMarkup(empty), /No places yet/);
  assert.match(renderToStaticMarkup(empty), /Add your first place/);
  assert.doesNotMatch(renderToStaticMarkup(empty), /No places match/);
  buttons(empty)[0].props.onClick();
  const filtered = PlaceCatalogEmptyState({ ...props, totalCount: 2 });
  assert.match(renderToStaticMarkup(filtered), /No places match those filters/);
  assert.match(renderToStaticMarkup(filtered), /Clear filters/);
  assert.doesNotMatch(renderToStaticMarkup(filtered), /Add your first place/);
  buttons(filtered)[0].props.onClick();
  const archived = PlaceCatalogEmptyState({ ...props, totalCount: 2, onlyArchived: true });
  assert.match(renderToStaticMarkup(archived), /Show archived places/);
  buttons(archived)[1].props.onClick();
  assert.deepEqual(calls, ["add", "clear", "archived"]);
  assert.equal(PlaceCatalogEmptyState({ ...props, totalCount: 2, resultCount: 1 }), null);
});

test("Catalog remains deterministic for hundreds of Places without searching private fields", async () => {
  const places = Array.from({ length: 500 }, (_, i) => place(`p-${i}`, { name: `Place ${String(i).padStart(3, "0")}`, notes: "private match", sceneCount: i % 10 }));
  assert.equal(ids(places, {}).length, 500);
  assert.equal(ids(places, { query: "private" }).length, 0);
  assert.deepEqual(ids(places, { sort: "scene-count" }), ids([...places].reverse(), { sort: "scene-count" }));
  const page = await readFile(resolve("app/page.tsx"), "utf8");
  assert.match(page, /parsePlaceCatalogState\(searchParams\)/);
  assert.match(page, /filterAndSortPlaces\(locations, placeCatalogState\)/);
  assert.match(page, /onClearFilters=\{\(\) => updatePlaceCatalog\(defaultPlaceCatalogState\)\}/);
  assert.match(page, /routeForPlaceCatalog\(place.novelId, catalogState, place.id\)/);
  assert.match(page, /aria-label="Search places by name"/);
  assert.match(page, /aria-label="Sort places"/);
  assert.match(page, /totalCount=\{data.locations.length\}/);
});
