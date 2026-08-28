import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

async function loadTypeScriptModule(path, requireModule = () => ({})) {
  const source = await readFile(resolve(process.cwd(), path), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  });
  const loadedModule = { exports: {} };
  new Function("require", "exports", "module", outputText)(requireModule, loadedModule.exports, loadedModule);
  return loadedModule.exports;
}

test("route parser rejects malformed IDs and prototype section names", async () => {
  const routes = await loadTypeScriptModule("lib/studio-routes.ts");

  assert.deepEqual(routes.parseStudioRoute("/novels/novel-1/relationships"), {
    page: "relationships",
    novelId: "novel-1"
  });
  assert.deepEqual(routes.parseStudioRoute("/novels/novel-1/editor/scene-2"), {
    page: "editor",
    novelId: "novel-1",
    sceneId: "scene-2"
  });
  assert.equal(routes.parseStudioRoute("/novels/%2Fnot-an-id"), null);
  assert.equal(routes.parseStudioRoute("/novels/novel-1/editor/%2Fscene"), null);
  assert.equal(routes.parseStudioRoute("/novels/novel-1/constructor"), null);
  assert.equal(routes.isNovelWorkspaceSection("toString"), false);
});

test("Library navigation accepts only allowlisted query parameters", async () => {
  const navigation = await loadTypeScriptModule("lib/studio-library-navigation.ts", (moduleId) => {
    if (moduleId === "@/lib/studio-domain") {
      return {
        genreFilters: ["All genres", "Light Novel", "Fantasy", "School Mystery", "Supernatural", "Court Drama"],
        statusFilters: ["All statuses", "Idea", "Planning", "Writing", "Revision", "Complete", "Archived"]
      };
    }
    throw new Error(`Unexpected module: ${moduleId}`);
  });

  assert.deepEqual(
    navigation.parseLibraryNavigationState(
      new URLSearchParams("status=writing&genre=fantasy&sort=title&view=list")
    ),
    { status: "Writing", genre: "Fantasy", sort: "title", view: "list" }
  );
  assert.deepEqual(
    navigation.parseLibraryNavigationState(
      new URLSearchParams("status=DROP%20TABLE&genre=private&sort=random&view=banana")
    ),
    navigation.defaultLibraryNavigationState
  );
  assert.equal(
    navigation.serializeLibraryNavigationState(navigation.defaultLibraryNavigationState).toString(),
    ""
  );
});

test("structure ancestor lookup only reveals validated parent branches", async () => {
  const structureTree = await loadTypeScriptModule("lib/structure-tree.ts");
  const volumes = [{ id: "volume-1" }];
  const chapters = [{ id: "chapter-1", volumeId: "volume-1" }];
  const scenes = [{ id: "scene-1", chapterId: "chapter-1" }];

  assert.deepEqual(
    structureTree.getStructureAncestorIds({ type: "scene", id: "scene-1" }, volumes, chapters, scenes),
    { volumeId: "volume-1", chapterId: "chapter-1" }
  );
  assert.equal(
    structureTree.getStructureAncestorIds(
      { type: "scene", id: "scene-with-missing-parent" },
      volumes,
      chapters,
      [{ id: "scene-with-missing-parent", chapterId: "missing-chapter" }]
    ),
    null
  );
});

test("structure moves normalize sibling order and reject an invalid reference", async () => {
  const moves = await loadTypeScriptModule("lib/structure-move.ts");

  assert.deepEqual(
    moves.insertStructureItem(["scene-a", "scene-b", "scene-c"], "scene-c", "before", "scene-a"),
    ["scene-c", "scene-a", "scene-b"]
  );
  assert.deepEqual(
    moves.insertStructureItem(["scene-a", "scene-b"], "scene-c", "start"),
    ["scene-c", "scene-a", "scene-b"]
  );
  assert.throws(
    () => moves.insertStructureItem(["scene-a"], "scene-c", "before", "missing-scene"),
    /destination/
  );
});

test("structure title search is local, case-insensitive, unicode-safe, and bounded", async () => {
  const search = await loadTypeScriptModule("lib/structure-search.ts");
  const items = [
    { type: "volume", id: "volume-a", title: "Volumen Ámbar" },
    { type: "chapter", id: "chapter-a", title: "La puerta abierta" },
    { type: "scene", id: "scene-a", title: "01 — Opening scene" }
  ];

  assert.deepEqual(search.searchStructureTitles(items, "  OPENING "), [items[2]]);
  assert.deepEqual(search.searchStructureTitles(items, "áMBAR"), [items[0]]);
  assert.deepEqual(search.searchStructureTitles(items, "ausente"), []);
  assert.equal(search.searchStructureTitles([...items, ...items], "", 1).length, 0);
  assert.equal(search.searchStructureTitles([...items, ...items], "a", 1).length, 1);
});

test("chapter preview composes only its ordered, non-archived scenes", async () => {
  const preview = await loadTypeScriptModule("lib/chapter-preview.ts");
  const scenes = [
    { id: "scene-b", chapterId: "chapter-1", title: "Second", content: "B", sortOrder: 2 },
    { id: "scene-a", chapterId: "chapter-1", title: "First", content: "A", sortOrder: 1 },
    { id: "scene-archived", chapterId: "chapter-1", title: "Hidden", content: "X", sortOrder: 0, archived: true },
    { id: "other-scene", chapterId: "chapter-2", title: "Other", content: "Y", sortOrder: 0 }
  ];

  assert.deepEqual(
    preview.orderChapterPreviewScenes("chapter-1", scenes).map((scene) => scene.id),
    ["scene-a", "scene-b"]
  );
  assert.equal(
    preview.composeChapterPreview("chapter-1", scenes),
    "# First\n\nA\n\n---\n\n# Second\n\nB"
  );
});

test("reader assembly is deterministic, read-only, and excludes archived hierarchy", async () => {
  const reader = await loadTypeScriptModule("lib/reader-document.ts");
  const volumes = [{ id: "v1", novelId: "n", title: "One", sortOrder: 1, archived: false }];
  const chapters = [{ id: "c1", volumeId: "v1", title: "Chapter", sortOrder: 1, archived: false }];
  const scenes = [
    { id: "s2", chapterId: "c1", title: "Second", content: "B", sortOrder: 2, archived: false },
    { id: "s1", chapterId: "c1", title: "First", content: "A", sortOrder: 1, archived: false },
    { id: "s3", chapterId: "c1", title: "Archived", content: "X", sortOrder: 3, archived: true }
  ];
  assert.deepEqual(reader.assembleReaderDocument("chapter", "c1", volumes, chapters, scenes).scenes.map((scene) => scene.id), ["s1", "s2"]);
  assert.deepEqual(scenes.map((scene) => scene.id), ["s2", "s1", "s3"]);
});

test("dialog surface uses opaque theme tokens while preserving the blurred backdrop", async () => {
  const dialogSource = await readFile(resolve(process.cwd(), "components/ui/dialog.tsx"), "utf8");

  assert.match(dialogSource, /bg-popover p-5/);
  assert.doesNotMatch(dialogSource, /bg-popover\/\d+/);
  assert.match(dialogSource, /backdrop-blur-\[2px\]/);
  assert.match(dialogSource, /bg-background p-1\.5/);
});

test("autosave only reports saved when the confirmed revision is still current", async () => {
  const autosave = await loadTypeScriptModule("lib/autosave-state.ts");

  assert.equal(autosave.statusAfterSaveConfirmation(11, 10), "Unsaved changes");
  assert.equal(autosave.statusAfterSaveConfirmation(11, 11), "Saved locally");
});

test("scene persistence uses an atomic revision guard against stale writes", async () => {
  const studioSource = await readFile(resolve(process.cwd(), "lib/db/studio.ts"), "utf8");
  const routeSource = await readFile(resolve(process.cwd(), "app/api/scenes/[sceneId]/route.ts"), "utf8");

  assert.match(studioSource, /where: \{ id: sceneId, revision: expectedRevision \}/);
  assert.match(studioSource, /revision: \{ increment: 1 \}/);
  assert.match(routeSource, /status: 409/);
});

test("scene restore creates a safeguard checkpoint without autosave snapshots", async () => {
  const studioSource = await readFile(resolve(process.cwd(), "lib/db/studio.ts"), "utf8");
  const restoreRoute = await readFile(resolve(process.cwd(), "app/api/scenes/[sceneId]/versions/[versionId]/restore/route.ts"), "utf8");

  assert.match(studioSource, /origin: "before restore"/);
  assert.match(studioSource, /where: \{ id: versionId, sceneId \}/);
  assert.match(studioSource, /prisma\.sceneVersion\.findMany/);
  assert.match(restoreRoute, /restoreSceneVersion/);
});

test("editor lifecycle flushes before transitions and keeps unload prompts conditional", async () => {
  const pageSource = await readFile(resolve(process.cwd(), "app/page.tsx"), "utf8");
  assert.match(pageSource, /if \(!\(await flushPendingChanges\(\)\)\)/);
  assert.match(pageSource, /if \(!dirtyRef\.current\) return/);
  assert.match(pageSource, /setContent\(activeScene\.content\)/);
});

test("scene inspector persists continuity metadata without submitting manuscript content", async () => {
  const inspectorSource = await readFile(resolve(process.cwd(), "app/api/scenes/[sceneId]/inspector/route.ts"), "utf8");
  const studioSource = await readFile(resolve(process.cwd(), "lib/db/studio.ts"), "utf8");

  assert.match(inspectorSource, /scene metadata references are not available in this novel/);
  assert.match(studioSource, /tx\.sceneCharacter\.deleteMany/);
  assert.match(studioSource, /tx\.timelineEvent\.updateMany\(\{ where: \{ sceneId \}/);
  assert.doesNotMatch(inspectorSource, /content:/);
});

test("editor density persists only the inspector preference and exposes accessible mode controls", async () => {
  const settings = await loadTypeScriptModule("lib/studio-settings.ts", (moduleId) => {
    if (moduleId === "@/lib/studio-data") return { defaultPersistedStudioSettings: { editorInspectorOpen: true } };
    if (moduleId === "@/lib/studio-domain") return { exportFormats: ["EPUB"], exportOptions: ["Include cover"] };
    throw new Error(`Unexpected module: ${moduleId}`);
  });
  const pageSource = await readFile(resolve(process.cwd(), "app/page.tsx"), "utf8");

  assert.equal(settings.applyStudioSettings({ editorInspectorOpen: true }, { editorInspectorOpen: "false" }).editorInspectorOpen, false);
  assert.match(pageSource, /aria-pressed=\{inspectorOpen\}/);
  assert.match(pageSource, /aria-label="Exit focus mode"/);
});

test("editor remains accessible and avoids stale inspector metadata on narrow layouts", async () => {
  const pageSource = await readFile(resolve(process.cwd(), "app/page.tsx"), "utf8");

  assert.match(pageSource, /grid min-w-0 gap-4/);
  assert.match(pageSource, /minmax\(18rem,360px\)/);
  assert.match(pageSource, /aria-live="polite"/);
  assert.match(pageSource, /setCharacterIds\(\[\]\);/);
  assert.match(pageSource, /disabled=\{metadataLoading \|\| saveState === "saving"\}/);
});

test("editor navigation crosses chapters and stops at novel bounds", async () => {
  const navigation = await loadTypeScriptModule("lib/editor-scene-navigation.ts");
  const scenes = navigation.getNovelSceneNavigation("n", [{ id: "v", novelId: "n", sortOrder: 1 }], [{ id: "c1", volumeId: "v", sortOrder: 1 }, { id: "c2", volumeId: "v", sortOrder: 2 }], [{ id: "s2", chapterId: "c2", title: "Two", sortOrder: 1, archived: false }, { id: "s1", chapterId: "c1", title: "One", sortOrder: 1, archived: false }]);
  assert.deepEqual(scenes.map((scene) => scene.id), ["s1", "s2"]);
  assert.deepEqual(navigation.getAdjacentSceneIds("s2", ["s1", "s2"]), { previousId: "s1", nextId: null });
});

test("structure status allowlist excludes archival and rejects unknown values", async () => {
  const domain = await loadTypeScriptModule("lib/studio-domain.ts", (moduleId) => {
    if (moduleId === "lucide-react") return {};
    throw new Error(`Unexpected module: ${moduleId}`);
  });

  assert.equal(domain.isNarrativeStatus("Revision"), true);
  assert.equal(domain.isNarrativeStatus("Archived"), false);
  assert.equal(domain.isNarrativeStatus("SUPER_READY"), false);
});

test("archived parents hide descendants without changing their own archive state", async () => {
  const visibility = await loadTypeScriptModule("lib/structure-visibility.ts");
  const volumes = [{ id: "volume-1", archived: true }, { id: "volume-2", archived: false }];
  const chapters = [
    { id: "chapter-1", volumeId: "volume-1", archived: false },
    { id: "chapter-2", volumeId: "volume-2", archived: false }
  ];
  const scenes = [
    { id: "scene-1", chapterId: "chapter-1", archived: false },
    { id: "scene-2", chapterId: "chapter-2", archived: false }
  ];

  assert.deepEqual(
    visibility.getVisibleStructureItems(volumes, chapters, scenes, false),
    { volumes: [volumes[1]], chapters: [chapters[1]], scenes: [scenes[1]] }
  );
  assert.deepEqual(
    visibility.getVisibleStructureItems(volumes, chapters, scenes, true),
    { volumes, chapters, scenes }
  );
  assert.equal(chapters[0].archived, false);
  assert.equal(scenes[0].archived, false);
});

test("structure delete impact protects non-empty parents and reports their words", async () => {
  const impact = await loadTypeScriptModule("lib/structure-impact.ts");
  const volumes = [{ id: "volume-1" }];
  const chapters = [{ id: "chapter-1", volumeId: "volume-1", wordCount: 12 }];
  const scenes = [{ id: "scene-1", chapterId: "chapter-1", wordCount: 12 }];

  assert.deepEqual(
    impact.getStructureDeleteImpact("volume", "volume-1", volumes, chapters, scenes),
    { chapterCount: 1, sceneCount: 1, wordCount: 12, hardDeleteBlocked: true }
  );
  assert.deepEqual(
    impact.getStructureDeleteImpact("chapter", "chapter-1", volumes, chapters, scenes),
    { chapterCount: 0, sceneCount: 1, wordCount: 12, hardDeleteBlocked: true }
  );
  assert.deepEqual(
    impact.getStructureDeleteImpact("scene", "scene-1", volumes, chapters, scenes),
    { chapterCount: 0, sceneCount: 0, wordCount: 12, hardDeleteBlocked: false }
  );
});
