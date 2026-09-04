import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const read = (path) => readFile(resolve(path), "utf8");
const compile = (source) => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
} }).outputText;
async function load(path, dependencies = {}) {
  const result = { exports: {} };
  new Function("require", "exports", "module", compile(await read(path)))((id) => {
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    throw new Error(`Unexpected dependency ${id}`);
  }, result.exports, result);
  return result.exports;
}
const routes = await load("lib/studio-routes.ts");
const classification = await load("lib/place-classification.ts");
const catalog = await load("lib/place-catalog.ts", { "@/lib/studio-routes": routes, "@/lib/place-classification": classification });

test("Detail requests are on demand, ID-scoped, abortable and never surface server error bodies", async (t) => {
  const { loadPlaceDetail } = await load("lib/place-detail.ts", { "@/lib/studio-routes": routes });
  const controller = new AbortController();
  const place = { id: "place-a", novelId: "novel-a", notes: "selected detail only" };
  const fetch = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "/api/places/place-a?novelId=novel-a");
    assert.deepEqual(options, { cache: "no-store", signal: controller.signal });
    return Response.json(place);
  });
  assert.deepEqual(await loadPlaceDetail("novel-a", "place-a", controller.signal), place);
  await assert.rejects(loadPlaceDetail("../bad", "place-a", controller.signal), /unavailable/);
  assert.equal(fetch.mock.callCount(), 1);
  fetch.mock.mockImplementation(async () => Response.json({ ...place, novelId: "novel-b" }));
  await assert.rejects(loadPlaceDetail("novel-a", "place-a", controller.signal), /unavailable/);
  fetch.mock.mockImplementation(async () => Response.json({ ...place, id: "other" }));
  await assert.rejects(loadPlaceDetail("novel-a", "place-a", controller.signal), /unavailable/);
  fetch.mock.mockImplementation(async () => new Response("PRIVATE-DATABASE-ERROR", { status: 500 }));
  await assert.rejects(loadPlaceDetail("novel-a", "place-a", controller.signal), (error) => !error.message.includes("PRIVATE") && /retry/.test(error.message));
  fetch.mock.mockImplementation(async () => { throw new DOMException("Aborted", "AbortError"); });
  controller.abort();
  await assert.rejects(loadPlaceDetail("novel-a", "place-a", controller.signal), { name: "AbortError" });
});

test("Detail loading has local recovery and ignores stale responses without changing the catalog", async () => {
  const source = await read("components/studio/place-detail-loader.tsx");
  assert.match(source, /return \(\) => controller.abort\(\)/);
  assert.match(source, /if \(!controller.signal.aborted\) setPlace\(result\)/);
  assert.match(source, /\[summary, attempt\]/);
  assert.match(source, /role="alert"/);
  assert.match(source, /Retry detail/);
  assert.doesNotMatch(source, /console\.|setStudioData|router\.(push|replace)/);
  const { PlaceDetailLoader } = await load("components/studio/place-detail-loader.tsx", {
    react: React, "react/jsx-runtime": require("react/jsx-runtime"),
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "@/components/ui/button": { Button: "button" }, "@/lib/place-detail": {}, "@/lib/place-catalog": catalog
  });
  const markup = renderToStaticMarkup(React.createElement(PlaceDetailLoader, {
    summary: { id: "place-a", novelId: "novel-a", name: "<script>private</script>" }, catalogState: catalog.defaultPlaceCatalogState
  }, () => { throw new Error("Detail must not render before loading"); }));
  assert.match(markup, /Loading place/);
  assert.match(markup, /href="\/novels\/novel-a\/places"/);
  assert.match(markup, /&lt;script&gt;/);
  assert.doesNotMatch(markup, /<script>/);
});

test("500-place view bounds initial cards, exposes keyboard controls and isolates narrow detail", async () => {
  // Render the actual screen function without mounting unrelated Editor/Notion UI.
  const page = await read("app/page.tsx");
  const screen = page.slice(page.indexOf("function PlacesScreen("), page.indexOf("function PlaceDetailPanel("));
  const places = Array.from({ length: 500 }, (_, index) => ({
    id: `place-${index}`, novelId: "novel-a", name: index ? `Place ${index}` : "<script>name</script>",
    type: "building", status: "active", parent: null, sceneCount: 1, characterCount: 2, childCount: 0, eventCount: 0,
    notes: "PRIVATE-NOTES", description: "PRIVATE-DESCRIPTION"
  }));
  const element = (tag) => function TestElement({ children, className, ...props }) { return React.createElement(tag, {
    className, ...(props["aria-label"] ? { "aria-label": props["aria-label"] } : {})
  }, children); };
  const deps = {
    React, require, exports: {}, useStudioData: () => ({ locations: places }), getCurrentNovel: () => ({ id: "novel-a" }),
    cn: (...values) => values.filter(Boolean).join(" "), ...catalog, ...classification,
    SectionHeader: ({ action }) => React.createElement("header", null, action),
    Button: element("button"), Card: element("article"), CardContent: element("div"),
    Badge: element("span"), Select: element("div"), SelectTrigger: element("button"), SelectValue: () => null,
    SelectContent: element("div"), SelectItem: element("span"), Plus: () => null, Search: () => null, MapIcon: () => null,
    Input: ({ maxLength, ...props }) => React.createElement("input", { ...props, maxLength }),
    Link: ({ children, ...props }) => React.createElement("a", props, children),
    FieldLine: ({ label, value }) => React.createElement("div", null, label, ": ", value),
    EmptyState: ({ title }) => React.createElement("p", null, title),
    PlaceDetailLoader: ({ summary }) => React.createElement("section", { "data-selected": summary.id }, "Detail loads independently")
  };
  const PlacesScreen = new Function(...Object.keys(deps), `${compile(screen)}; return PlacesScreen;`)(...Object.values(deps));
  const props = { places, catalogState: catalog.defaultPlaceCatalogState, onCatalogChange: () => {}, onClearFilters: () => {}, onAddPlace: () => {}, onEditPlace: () => {}, onScenesChanged: async () => {}, selectedPlaceId: null };
  const markup = renderToStaticMarkup(React.createElement(PlacesScreen, props));
  assert.equal((markup.match(/data-place-id=/g) ?? []).length, 50);
  assert.match(markup, /Showing 50 of 500 places/);
  assert.match(markup, /Show more places/);
  assert.match(markup, /Search places by name/);
  assert.match(markup, /Filter place type/);
  assert.match(markup, /Clear filters/);
  assert.doesNotMatch(markup, /PRIVATE-|<script>/);
  const selected = renderToStaticMarkup(React.createElement(PlacesScreen, { ...props, selectedPlaceId: "place-499" }));
  assert.match(selected, /data-selected="place-499"/, "deep links load even outside the rendered first batch");
  assert.match(selected, /hidden xl:block/);
  assert.match(selected, /minmax\(0,1fr\)_minmax\(0,1fr\)/);
  assert.match(screen, /previousSelection.current/);
  assert.match(screen, /\(link \?\? searchInput.current\)\?\.focus\(\)/);
  assert.match(screen, /firstAddedPlace.current = places\[visibleCount\].id/);
});

test("Place forms, linking and lifecycle modals are bounded and keep modal keyboard primitives", async () => {
  for (const path of ["components/studio/place-form-dialog.tsx", "components/studio/place-scenes.tsx", "components/studio/place-lifecycle.tsx"]) {
    const source = await read(path);
    assert.match(source, /max-h-\[calc\(100dvh-2rem\)\]/);
    assert.match(source, /overflow-y-auto/);
    assert.match(source, /onCloseAutoFocus/);
    assert.match(source, /closeDisabled=/);
  }
  const hierarchy = await read("lib/place-hierarchy.ts");
  assert.match(hierarchy, /visited.has\(current\)/);
  assert.match(hierarchy, /breadcrumb.length === MAX_PLACE_DEPTH/);
  const studio = await read("lib/db/studio.ts");
  assert.match(studio, /listPlaces\(\)/, "studio snapshot uses the same minimal Place catalog");
  for (const path of ["components/studio/place-form-dialog.tsx", "components/studio/place-characters.tsx", "components/studio/place-story-events.tsx"]) {
    const source = await read(path);
    assert.match(source, /max-w-\[calc\(100vw-2rem\)\]/);
    assert.match(source, /--radix-select-content-available-height/);
  }
});
