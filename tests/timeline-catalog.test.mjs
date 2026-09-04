import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function load(path, deps = {}) {
  const exports = {}, code = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "exports", code)(id => { if (!(id in deps)) throw new Error(id); return deps[id]; }, exports);
  return exports;
}
const routes = load("lib/studio-routes.ts"), position = load("lib/timeline-position.ts");
const catalog = load("lib/timeline-catalog.ts", { "./studio-routes": routes, "./timeline-position": position });
const { defaultTimelineCatalog: defaults, parseTimelineCatalog: parse, timelineCatalogQuery: query, normalizeTimelineCatalog: normalize, filterTimelineEvents: filter } = catalog;
const entities = { volumes: [{ id: "v1", novelId: "n" }, { id: "v2", novelId: "n" }, { id: "foreign", novelId: "b" }], chapters: [{ id: "c1", volumeId: "v1" }, { id: "c2", volumeId: "v2" }], characters: [{ id: "person", novelId: "n" }], locations: [{ id: "place", novelId: "n" }] };
const event = (id, extra = {}) => ({ id, novelId: "n", title: "Arrival", sortIndex: 1, isSpoiler: false, volumeId: "v2", chapterId: "c2", characterIds: ["person"], locationIds: ["place"], ...extra });

test("Timeline URL uses bounded search and allowlisted IDs/visibility; Clear removes state", () => {
  const state = parse(new URLSearchParams("volume=../bad&chapter=c2&spoilers=yes&q=Arrival&notes=PRIVATE&unknown=x"));
  assert.deepEqual(state, { ...defaults, chapter: "c2", q: "Arrival" });
  assert.equal(query(state), "q=Arrival&chapter=c2");
  assert.equal(parse(new URLSearchParams({ q: "x".repeat(500) })).q.length, 200);
  assert.equal(catalog.timelineCatalogRoute("n", defaults), "/novels/n/timeline");
  const url = catalog.timelineCatalogRoute("n", { ...state, spoilers: true }, "event");
  assert.deepEqual(parse(new URL(url, "http://localhost").searchParams), { ...state, spoilers: true });
});
test("Chapter options normalize against Volume and reject foreign/missing IDs", () => {
  assert.equal(normalize({ ...defaults, volume: "v2", chapter: "c1" }, "n", entities).chapter, "");
  assert.equal(normalize({ ...defaults, chapter: "c1" }, "n", entities).chapter, "c1");
  assert.deepEqual(normalize({ ...defaults, volume: "foreign", character: "missing", place: "foreign" }, "n", entities), defaults);
  assert.equal(normalize({ ...defaults, volume: "v2", chapter: "c2" }, "n", entities).chapter, "c2");
});
test("Title-only case-insensitive search combines every filter with stable chronological order", () => {
  const rows = [event("z"), event("a"), event("other", { volumeId: "v1" }), event("private", { title: "Unrelated", description: "arrival" })];
  const state = { ...defaults, q: "aRRi", volume: "v2", chapter: "c2", character: "person", place: "place" };
  assert.deepEqual(filter(rows, "n", state).map(e => e.id), ["a", "z"]);
  assert.equal(filter(rows, "n", { ...state, character: "other" }).length, 0);
  assert.equal(filter(rows, "n", { ...state, place: "other" }).length, 0);
  assert.equal(filter(rows, "n", { ...state, chapter: "other" }).length, 0);
});
test("Spoilers never contribute to search/counts, even with exact title query", () => {
  const rows = [event("hidden", { title: "Secret betrayal", isSpoiler: true }), event("foreign", { novelId: "b" })];
  assert.deepEqual(filter(rows, "n", defaults), []);
  assert.deepEqual(filter(rows, "n", { ...defaults, q: "Secret betrayal" }), []);
  assert.equal(filter(rows, "n", { ...defaults, spoilers: true }).length, 1);
});
test("Archived events are hidden by default and recoverable through allowlisted URL state", () => {
  const rows = [event("archived", { archivedAt: "2026-09-04" })];
  assert.deepEqual(filter(rows, "n", defaults), []);
  const state = parse(new URLSearchParams("archived=true"));
  assert.equal(filter(rows, "n", state).length, 1);
  assert.equal(query(state), "archived=true");
  assert.equal(parse(new URLSearchParams("archived=invalid")).archived, false);
});
test("Onboarding and filter-empty states expose the correct action and no hidden counts", () => {
  const { TimelineEmptyState } = load("components/studio/timeline-empty-state.tsx", { "react/jsx-runtime": jsx, "@/components/ui/button": { Button: props => React.createElement("button", props) } });
  const actions = { onAdd() {}, onClear() {} };
  const empty = TimelineEmptyState({ ...actions, hasVisibleEvents: false }), filtered = TimelineEmptyState({ ...actions, hasVisibleEvents: true });
  assert.equal(empty.props.children[1].props.onClick, actions.onAdd);
  assert.equal(filtered.props.children[1].props.onClick, actions.onClear);
  assert.match(renderToStaticMarkup(empty), /No timeline events yet.*Add first event/);
  assert.match(renderToStaticMarkup(filtered), /No timeline events match those filters.*Clear Filters/);
});
test("URL state survives event links; catalog fetch never sends title queries and aborts stale visibility loads", () => {
  const loader = read("components/studio/timeline-catalog-loader.tsx"), page = read("app/page.tsx");
  assert.match(loader, /result\?\.key === key/); assert.match(loader, /controller.abort\(\)/);
  assert.doesNotMatch(loader, /catalog.q|params.get\("q"\)|console\./);
  assert.match(page, /ready && params.toString\(\) !== query/);
  assert.match(page, /catalogQuery=\{timelineCatalogQuery\(catalog\)\}/);
  assert.match(page, /key === "volume" \? \{ chapter: "" \}/);
});
