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
const catalog = await loadTs("lib/place-catalog.ts", { "@/lib/studio-routes": routes, "@/lib/place-classification": classification });
const places = [
  { id: "grecia", novelId: "a", name: "Grecia", status: "active", type: "city_town", notes: "private" },
  { id: "finca", novelId: "a", name: "Finca", status: "archived", type: "building", parentPlaceId: "grecia", notes: "private" },
  { id: "foreign", novelId: "b", name: "Must not appear", status: "active", type: "building" }
];

test("Place selection is exclusively route-controlled, including archived or filtered-out destinations", () => {
  assert.equal(catalog.resolvePlaceSelection("a", null, places), null, "the catalog must not implicitly select its first card");
  assert.equal(catalog.resolvePlaceSelection("a", "finca", places), places[1]);
  assert.equal(catalog.filterAndSortPlaces(places.slice(0, 2), catalog.defaultPlaceCatalogState).some((place) => place.id === "finca"), false);
  assert.equal(catalog.resolvePlaceSelection("a", "foreign", places), null);
  assert.equal(catalog.resolvePlaceSelection("a", "missing", places), null);
  assert.equal(catalog.resolvePlaceSelection("a", "../finca", places), null);
  assert.equal(catalog.resolvePlaceSelection("../a", "finca", places), null);
  assert.equal(catalog.resolvePlaceSelection("a", "finca", [places[0]]), null, "stale selection never falls back to another Place");
});

test("Revisiting history URLs reconstructs Grecia, Finca and Scene destinations without cached selection", () => {
  const state = { ...catalog.defaultPlaceCatalogState, status: "all", sort: "scene-count" };
  const urls = [catalog.routeForPlaceCatalog("a", state, "grecia"), catalog.routeForPlaceCatalog("a", state, "finca"), routes.routeForPage("editor", "a", "scene-1")];
  const resolveDestination = (url) => {
    const parsed = new URL(url, "http://localhost");
    const route = routes.parseStudioRoute(parsed.pathname);
    return { route, selected: catalog.resolvePlaceSelection(route.novelId, route.placeId ?? null, places), state: catalog.parsePlaceCatalogState(parsed.searchParams) };
  };
  for (const index of [0, 1, 2, 1, 0, 1, 2]) {
    const destination = resolveDestination(urls[index]);
    if (index === 2) {
      assert.equal(destination.route.sceneId, "scene-1");
      assert.equal(destination.selected, null);
    } else {
      assert.equal(destination.selected.id, index === 0 ? "grecia" : "finca");
      assert.deepEqual(destination.state, state);
    }
    assert.deepEqual(resolveDestination(urls[index]), destination, "refresh reconstructs the same selection");
  }
  const dirty = catalog.parsePlaceCatalogState(new URLSearchParams("notes=private&description=private&type=invalid"));
  assert.equal(catalog.routeForPlaceCatalog("a", dirty, "grecia"), "/novels/a/places/grecia");
});

test("Related Place entities render ordinary semantic links to the canonical routes", async () => {
  const element = (tag) => function TestElement({ children }) { return React.createElement(tag, null, children); };
  const domain = await loadTs("lib/studio-domain.ts", { "lucide-react": {}, "./place-classification": classification });
  const characterPlace = await loadTs("lib/character-place.ts", { "@/lib/studio-domain": domain });
  const timelinePlace = await loadTs("lib/timeline-place.ts", { "@/lib/studio-routes": routes, "./timeline-position": await loadTs("lib/timeline-position.ts") });
  const modules = {
    react: React, "react/jsx-runtime": require("react/jsx-runtime"),
    "next/link": { default: ({ href, children }) => React.createElement("a", { href }, children) },
    "@/components/ui/button": { Button: element("button") }, "@/components/ui/input": { Input: () => null },
    "@/components/ui/label": { Label: element("label") },
    "@/components/ui/select": { Select: element("div"), SelectTrigger: element("button"), SelectValue: () => null, SelectContent: element("div"), SelectItem: element("div") },
    "@/components/ui/dialog": {}, "@/lib/studio-routes": routes, "@/lib/studio-domain": domain,
    "@/lib/character-place": characterPlace, "@/lib/timeline-place": timelinePlace
  };
  const { PlaceScenes } = await loadTs("components/studio/place-scenes.tsx", modules);
  const { PlaceCharacters } = await loadTs("components/studio/place-characters.tsx", modules);
  const { PlaceStoryEvents } = await loadTs("components/studio/place-story-events.tsx", modules);
  const place = { ...places[1], linkedScenes: [{ id: "scene-1", label: "Arrival" }] };
  const common = { place, onChanged: async () => {} };
  const scenes = renderToStaticMarkup(React.createElement(PlaceScenes, common));
  assert.match(scenes, /href="\/novels\/a\/editor\/scene-1"/);
  const characters = renderToStaticMarkup(React.createElement(PlaceCharacters, { ...common,
    characters: [{ id: "juana", novelId: "a", name: "Juana", notes: "private", secret: "private" }, { id: "foreign", novelId: "b", name: "Hidden" }],
    links: [{ characterId: "juana", locationId: "finca", relationshipType: "Lives at" }, { characterId: "foreign", locationId: "finca", relationshipType: "Lives at" }]
  }));
  assert.match(characters, /href="\/novels\/a\/characters\/juana"/);
  assert.doesNotMatch(characters, /Hidden|private|\/characters\/foreign/);
  const events = renderToStaticMarkup(React.createElement(PlaceStoryEvents, { ...common,
    events: [{ id: "arrival", novelId: "a", locationIds: ["finca"], title: "Arrival", internalDate: "Day 1", description: "private" }, { id: "foreign", novelId: "b", locationIds: ["finca"], title: "Hidden", internalDate: "Day 2" }]
  }));
  assert.match(events, /href="\/novels\/a\/timeline\/arrival"/);
  assert.doesNotMatch(events, /Hidden|private|\/timeline\/foreign/);
});

test("Place split view exposes focused URL selection, safe recovery and history-preserving Links", async () => {
  const page = await readFile(resolve("app/page.tsx"), "utf8");
  const screen = page.slice(page.indexOf("function PlacesScreen("), page.indexOf("function RelationshipsScreen("));
  assert.match(page, /selectedPlaceId=\{activeRoute\?\.placeId \?\? null\}/);
  assert.match(screen, /resolvePlaceSelection\(novelId, selectedPlaceId, data.locations\)/);
  assert.doesNotMatch(screen, /places\[0\]|history\.(pushState|replaceState)/);
  assert.match(screen, /title="Place unavailable"/);
  assert.match(screen, /title="Select a place"/);
  assert.match(screen, /key=\{selectedPlace.id\}/);
  assert.match(screen, /titleRef.current\?\.focus\(\)/);
  assert.match(screen, /tabIndex=\{-1\}/);
  assert.match(screen, /<Link href=\{routeForPlaceCatalog\(ancestor.novelId, catalogState, ancestor.id\)\}/);
  assert.match(screen, /<Link href=\{routeForPlaceCatalog\(child.novelId, catalogState, child.id\)\}/);
  assert.match(screen, /aria-current=\{selectedPlace\?\.id === place.id \? "page" : undefined\}/);
  assert.doesNotMatch(screen, /<Link[^>]*\breplace\b/);
});
