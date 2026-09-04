import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function load(path, deps = {}) {
  const exports = {};
  new Function("require", "exports", ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(id => deps[id], exports);
  return exports;
}
const routes = load("lib/studio-routes.ts"), since = load("lib/relationship-since.ts", { "./studio-routes": routes });
const { timelineStoryTarget: target } = load("lib/timeline-navigation.ts", { "./studio-routes": routes });
const volumes = [{ id: "v", novelId: "a", title: "Volume", sortOrder: 1, archived: false }, { id: "foreign", novelId: "b", title: "Private", sortOrder: 1, archived: false }];
const chapters = [{ id: "c", volumeId: "v", title: "Chapter", sortOrder: 1, archived: false }];
const scenes = [{ id: "s", chapterId: "c", title: "Scene", sortOrder: 1, archived: false }];
const options = () => since.relationshipSinceOptions("a", volumes, chapters, scenes);
test("Story Position uses scoped IDs and existing Editor/Structure routes with current labels", () => {
  assert.equal(target({ novelId: "a", sceneId: "s" }, "a", options()).href, "/novels/a/editor/s");
  for (const [kind, id] of [["chapter", "c"], ["volume", "v"]]) {
    const resolved = target({ novelId: "a", [`${kind}Id`]: id }, "a", options());
    assert.equal(resolved.href, `/novels/a/structure?kind=${kind}&target=${id}`);
    assert.deepEqual(since.relationshipStructureSelection(new URL(resolved.href, "http://localhost").searchParams, options()), { type: kind, id });
  }
  chapters[0].title = "Renamed chapter";
  assert.match(target({ novelId: "a", chapterId: "c" }, "a", options()).label, /Renamed chapter/);
});
test("Foreign, missing, malformed and archived targets never produce links or fallback", () => {
  for (const event of [{ novelId: "b", sceneId: "s" }, { novelId: "a", volumeId: "foreign" }, { novelId: "a", sceneId: "missing" }, { novelId: "a", sceneId: "../s", chapterId: "c" }]) assert.equal(target(event, "a", options()), null);
  assert.equal(target({ novelId: "a", sceneId: "s" }, "a", options().map(option => ({ ...option, archived: true }))), null);
});
test("History restores event IDs and loaders invalidate selection on route changes", () => {
  const urls = ["/novels/a/timeline/first", "/novels/a/timeline/second", "/novels/a/editor/s"];
  assert.deepEqual([urls[0], urls[1], urls[2], urls[1], urls[0]].map(url => routes.parseStudioRoute(url).eventId ?? "scene"), ["first", "second", "scene", "second", "first"]);
  const loader = read("components/studio/timeline-catalog-loader.tsx");
  assert.match(loader, /selectedId \?\? ""/); assert.match(loader, /controller.abort\(\)/);
  const route = read("app/novels/[novelId]/timeline/[eventId]/page.tsx");
  assert.match(route, /timelineEventBelongsToNovelForRoute\(novelId, eventId\)/); assert.match(route, /notFound\(\)/);
  assert.doesNotMatch(read("lib/timeline-navigation.ts"), /description|notes|innerHTML/);
});
