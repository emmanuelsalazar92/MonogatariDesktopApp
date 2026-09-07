import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function transpiledExports(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const exports = {};
  new Function("exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(exports);
  return exports;
}

const navigation = transpiledExports("../lib/editor-scene-navigation.ts");
const routes = transpiledExports("../lib/studio-routes.ts");

test("Continue Writing chooses the last valid scene of only the current novel", () => {
  const scenes = navigation.getNovelSceneNavigation(
    "novel-a",
    [
      { id: "volume-a", novelId: "novel-a", sortOrder: 0 },
      { id: "volume-archived", novelId: "novel-a", sortOrder: 1, archived: true },
      { id: "volume-b", novelId: "novel-b", sortOrder: 0 }
    ],
    [
      { id: "chapter-a", volumeId: "volume-a", sortOrder: 0 },
      { id: "chapter-archived", volumeId: "volume-a", sortOrder: 1, archived: true },
      { id: "chapter-hidden", volumeId: "volume-archived", sortOrder: 0 },
      { id: "chapter-b", volumeId: "volume-b", sortOrder: 0 }
    ],
    [
      { id: "scene-early", chapterId: "chapter-a", sortOrder: 0, archived: false },
      { id: "scene-last", chapterId: "chapter-a", sortOrder: 2, archived: false },
      { id: "scene-archived", chapterId: "chapter-a", sortOrder: 3, archived: true },
      { id: "scene-in-archived-chapter", chapterId: "chapter-archived", sortOrder: 9, archived: false },
      { id: "scene-in-archived-volume", chapterId: "chapter-hidden", sortOrder: 9, archived: false },
      { id: "scene-foreign", chapterId: "chapter-b", sortOrder: 9, archived: false }
    ]
  );

  assert.equal(scenes.at(-1)?.id, "scene-last");
  assert.equal(routes.routeForPage("editor", "novel-a", scenes.at(-1)?.id), "/novels/novel-a/editor/scene-last");
  assert.equal(navigation.getNovelSceneNavigation("novel-a", [], [], []).length, 0);
});

test("Current Novel header has one editorial CTA, an explicit Structure fallback, and no render-time navigation writes", () => {
  const overview = readFileSync(new URL("../components/studio/novel-overview-screen.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const snapshotRoute = readFileSync(new URL("../app/api/studio/route.ts", import.meta.url), "utf8");
  const snapshotDb = readFileSync(new URL("../lib/db/studio.ts", import.meta.url), "utf8");

  assert.match(overview, /getNovelSceneNavigation\([\s\S]*\.at\(-1\)/);
  assert.match(overview, /href=\{routeForPage\("editor", currentNovel\.id, continuationScene\.id\)\}/);
  assert.match(overview, /href=\{routeForPage\("structure", currentNovel\.id\)\}/);
  assert.match(overview, /No editable scenes yet\. Start in Structure to create one\./);
  assert.match(overview, /<h1 className="mt-1 break-words/);
  assert.match(overview, /aria-label=\{`\$\{translate\("Continue writing"\)/);
  assert.doesNotMatch(overview, /onSelectPage\("editor"\)|onSelectPage\("reader"\)|\["Open editor"|\["Open reader"/);
  assert.doesNotMatch(overview, /fetch\(|router\.|\/api\/selection/);

  assert.match(page, /\?novelId=\$\{encodeURIComponent\(activeRoute\.novelId\)\}&sceneId=\$\{encodeURIComponent\(activeRoute\.sceneId\)\}/);
  assert.match(page, /activePage === "library" \|\| activePage === "overview"/);
  assert.match(snapshotRoute, /requestedNovelId = novelId && isValidNovelRouteId\(novelId\)/);
  assert.match(snapshotRoute, /sceneId && requestedNovelId && isValidSceneRouteId\(sceneId\)/);
  assert.match(snapshotDb, /novelId: options\.activeSceneNovelId/);
  assert.match(snapshotDb, /novel: \{ status: \{ not: "Archived" \} \}/);
  assert.match(snapshotDb, /hasExplicitRouteScene/);
  assert.doesNotMatch(snapshotDb, /recoverStaleNotionSyncStates/);
});
