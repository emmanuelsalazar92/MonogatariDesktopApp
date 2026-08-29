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

test("character metadata supports minimal creation and normalizes aliases", async () => {
  const metadata = await loadTypeScriptModule("lib/character-metadata.ts");
  const minimal = metadata.validateCharacterMetadata({ novelId: "novel-1", name: "  Ada  " });
  assert.equal(minimal.ok, true);
  assert.equal(minimal.data.name, "Ada");
  assert.equal(minimal.data.status, "Active");
  assert.deepEqual(minimal.data.aliases, []);

  const normalized = metadata.validateCharacterMetadata({
    name: "Ada",
    aliases: ["  The Cartographer ", "the cartographer", "Ada", "Ámbar"],
    role: "Support",
    status: "Inactive"
  });
  assert.equal(normalized.ok, true);
  assert.deepEqual(normalized.data.aliases, ["The Cartographer", "Ámbar"]);
});

test("character metadata rejects invalid and derived fields", async () => {
  const metadata = await loadTypeScriptModule("lib/character-metadata.ts");
  const derived = metadata.validateCharacterMetadata({ name: "Ada", relationships: [] });
  assert.equal(derived.ok, false);
  assert.match(derived.error, /not editable/);

  const invalid = metadata.validateCharacterMetadata({ name: "", role: "SUPERHERO", status: "Unknown", aliases: "Alias" });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.fieldErrors.name);
  assert.ok(invalid.fieldErrors.status);
  assert.ok(invalid.fieldErrors.role);
  assert.ok(invalid.fieldErrors.aliases);
});

test("character classification migrates legacy values and filters canonical lifecycle", async () => {
  const metadata = await loadTypeScriptModule("lib/character-metadata.ts");

  assert.equal(metadata.normalizeStoredCharacterRole("Deuteragonist"), "Support");
  assert.equal(metadata.normalizeStoredCharacterRole("Mentor / Suspect"), "Other");
  assert.deepEqual(metadata.parseStoredCharacterStatus("Missing"), {
    lifecycle: "Active",
    narrative: "Missing"
  });
  const stored = metadata.serializeCharacterStatus("Archived", "Deceased");
  assert.deepEqual(metadata.parseStoredCharacterStatus(stored), {
    lifecycle: "Archived",
    narrative: "Deceased"
  });

  const active = { role: "Support", status: "Active" };
  const archived = { role: "Support", status: "Archived" };
  assert.equal(metadata.matchesCharacterClassification(active, "Support", "Active"), true);
  assert.equal(metadata.matchesCharacterClassification(archived, "Support", "Active"), false);
  assert.equal(metadata.matchesCharacterClassification(archived, "All roles", "Archived"), true);
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

test("reader scope navigation has deterministic adjacent units and safe limits", async () => {
  const reader = await loadTypeScriptModule("lib/reader-document.ts");
  const volumes = [
    { id: "v1", novelId: "n", sortOrder: 1, archived: false },
    { id: "other-volume", novelId: "other", sortOrder: 1, archived: false }
  ];
  const chapters = [{ id: "c1", volumeId: "v1", sortOrder: 1, archived: false }, { id: "c2", volumeId: "v1", sortOrder: 2, archived: false }];
  const scenes = [{ id: "s1", chapterId: "c1", sortOrder: 1, archived: false }, { id: "s2", chapterId: "c2", sortOrder: 1, archived: false }];
  assert.deepEqual(reader.getReaderScopeUnits("scene", "n", volumes, chapters, scenes), ["s1", "s2"]);
  assert.deepEqual(reader.getReaderAdjacentUnits(["c1", "c2"], "c1"), { previousId: null, nextId: "c2" });
  assert.deepEqual(reader.getReaderAdjacentUnits(["n"], "n"), { previousId: null, nextId: null });
});

test("reader deep links are canonical, history-friendly, and reject cross-novel targets", async () => {
  const reader = await loadTypeScriptModule("lib/reader-document.ts");
  const navigation = await loadTypeScriptModule("lib/studio-reader-navigation.ts", (moduleId) => {
    if (moduleId === "@/lib/reader-document") return reader;
    throw new Error(`Unexpected module: ${moduleId}`);
  });
  const volumes = [
    { id: "v1", novelId: "n", sortOrder: 1, archived: false },
    { id: "v2", novelId: "other", sortOrder: 1, archived: false }
  ];
  const chapters = [
    { id: "c1", volumeId: "v1", sortOrder: 1, archived: false },
    { id: "c2", volumeId: "v2", sortOrder: 1, archived: false }
  ];
  const scenes = [
    { id: "s1", chapterId: "c1", sortOrder: 1, archived: false },
    { id: "s2", chapterId: "c2", sortOrder: 1, archived: false }
  ];
  const fallback = { scope: "chapter", targetId: "c1" };

  assert.deepEqual(
    navigation.parseReaderNavigationState(
      new URLSearchParams("scope=scene&target=s1"),
      "n",
      fallback,
      volumes,
      chapters,
      scenes
    ),
    { scope: "scene", targetId: "s1" }
  );
  assert.deepEqual(
    navigation.parseReaderNavigationState(
      new URLSearchParams("scope=scene&target=s2"),
      "n",
      fallback,
      volumes,
      chapters,
      scenes
    ),
    fallback
  );
  assert.deepEqual(
    navigation.parseReaderNavigationState(
      new URLSearchParams("scope=secret&target=s1"),
      "n",
      fallback,
      volumes,
      chapters,
      scenes
    ),
    fallback
  );
  assert.equal(
    navigation.serializeReaderNavigationState({ scope: "chapter", targetId: "c1" }).toString(),
    "scope=chapter&target=c1"
  );
});

test("reader preferences validate persisted values and restore safe defaults", async () => {
  const preferences = await loadTypeScriptModule("lib/reader-preferences.ts");
  const defaults = {
    readerFontSize: "18 px",
    readerWidth: "720 px",
    defaultReadingMode: "Sepia"
  };
  const settings = await loadTypeScriptModule("lib/studio-settings.ts", (moduleId) => {
    if (moduleId === "@/lib/studio-data") return { defaultPersistedStudioSettings: defaults };
    if (moduleId === "@/lib/studio-domain") return { exportFormats: ["EPUB"], exportOptions: ["Include cover"] };
    if (moduleId === "@/lib/reader-preferences") return preferences;
    throw new Error(`Unexpected module: ${moduleId}`);
  });

  assert.equal(preferences.normalizeReaderFontSize("20 px"), "20 px");
  assert.equal(preferences.normalizeReaderWidth("760 px"), "760 px");
  assert.equal(preferences.normalizeReaderFontSize("200 px"), null);
  assert.equal(preferences.normalizeReaderFontSize("18px-corrupt"), null);
  assert.equal(preferences.normalizeReaderWidth("javascript:alert(1)"), null);
  assert.deepEqual(
    settings.parseStudioSettings('{"readerFontSize":"200 px","readerWidth":"9999 px"}'),
    defaults
  );
  assert.equal(settings.validateStudioSettingsUpdate({ readerWidth: "901 px" }), null);
});

test("reader document preserves UTF-8 manuscript text without heuristic replacement", async () => {
  const reader = await loadTypeScriptModule("lib/reader-document.ts");
  const unicode = "Volume 1 · mañana llegaría con sus compañeros · 日本語の本文";
  const document = reader.assembleReaderDocument(
    "scene",
    "s1",
    [{ id: "v1", novelId: "n", title: "Volumen Ámbar", sortOrder: 1, archived: false }],
    [{ id: "c1", volumeId: "v1", title: "Capítulo", sortOrder: 1, archived: false }],
    [{ id: "s1", chapterId: "c1", title: "Señal · 青", content: unicode, sortOrder: 1, archived: false }]
  );

  assert.equal(document.scenes[0].title, "Señal · 青");
  assert.equal(document.scenes[0].content, unicode);
});

test("reading progress resumes the exact scene with a clamped relative position", async () => {
  const progress = await loadTypeScriptModule("lib/reader-progress.ts");
  const volumes = [{ id: "v1", novelId: "n", sortOrder: 1, archived: false }];
  const chapters = [{ id: "c1", volumeId: "v1", sortOrder: 1, archived: false }];
  const scenes = [{ id: "s1", chapterId: "c1", sortOrder: 1, archived: false }];
  const resolved = progress.resolveReadingProgress({
    novelId: "n",
    preferredScope: "chapter",
    volumeId: "v1",
    chapterId: "c1",
    sceneId: "s1",
    positionRatio: 1.4,
    contentRevision: 2,
    lastReadAt: "2026-08-28T00:00:00.000Z"
  }, "n", volumes, chapters, scenes);

  assert.equal(resolved.targetId, "c1");
  assert.equal(resolved.resolvedSceneId, "s1");
  assert.equal(resolved.positionRatio, 1);
  assert.equal(resolved.usedFallback, false);
});

test("reading progress falls back through active hierarchy without leaking across novels", async () => {
  const progress = await loadTypeScriptModule("lib/reader-progress.ts");
  const volumes = [{ id: "v1", novelId: "n", sortOrder: 1, archived: false }];
  const chapters = [{ id: "c1", volumeId: "v1", sortOrder: 1, archived: false }];
  const scenes = [
    { id: "archived", chapterId: "c1", sortOrder: 1, archived: true },
    { id: "readable", chapterId: "c1", sortOrder: 2, archived: false }
  ];
  const stored = {
    novelId: "n",
    preferredScope: "scene",
    volumeId: "v1",
    chapterId: "c1",
    sceneId: "archived",
    positionRatio: 0.38,
    contentRevision: 1,
    lastReadAt: "2026-08-28T00:00:00.000Z"
  };

  assert.deepEqual(
    progress.resolveReadingProgress(stored, "n", volumes, chapters, scenes),
    { ...stored, positionRatio: 0, scope: "scene", targetId: "readable", resolvedSceneId: "readable", usedFallback: true }
  );
  assert.equal(progress.resolveReadingProgress(stored, "another-novel", volumes, chapters, scenes), null);
});

test("reading progress uses a separate current-state table and debounced writes", async () => {
  const schema = await readFile(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
  const studioSource = await readFile(resolve(process.cwd(), "lib/db/studio.ts"), "utf8");
  const pageSource = await readFile(resolve(process.cwd(), "app/page.tsx"), "utf8");
  const routeSource = await readFile(resolve(process.cwd(), "app/api/reader/progress/route.ts"), "utf8");
  const saveProgressSource = studioSource.slice(studioSource.indexOf("export async function saveReadingProgress"));

  assert.match(schema, /model ReadingProgress/);
  assert.match(schema, /novelId\s+String\s+@id/);
  assert.match(pageSource, /setTimeout\(flushReadingProgress, 750\)/);
  assert.match(pageSource, /Date\.now\(\) - lastReaderScrollIntentRef\.current < 500/);
  assert.match(routeSource, /Number\.isFinite\(body\.positionRatio\)/);
  assert.match(saveProgressSource, /prisma\.readingProgress\.upsert/);
  assert.doesNotMatch(saveProgressSource, /markNotionDirty/);
});

test("reader keeps the active scene content visible while a read document is unavailable", async () => {
  const pageSource = await readFile(resolve(process.cwd(), "app/page.tsx"), "utf8");
  assert.match(pageSource, /readerDocument[\s\S]*\? readerDocument\.scenes[\s\S]*: activeScene\.id[\s\S]*content: activeScene\.content/);
  assert.match(pageSource, /const readerScenes = React\.useMemo/);
  assert.match(pageSource, /readerScenes\.map/);
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
  const readerPreferences = await loadTypeScriptModule("lib/reader-preferences.ts");
  const settings = await loadTypeScriptModule("lib/studio-settings.ts", (moduleId) => {
    if (moduleId === "@/lib/studio-data") return { defaultPersistedStudioSettings: { editorInspectorOpen: true } };
    if (moduleId === "@/lib/studio-domain") return { exportFormats: ["EPUB"], exportOptions: ["Include cover"] };
    if (moduleId === "@/lib/reader-preferences") return readerPreferences;
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

test("reading focus keeps the live reader mounted and exposes reversible accessible controls", async () => {
  const pageSource = await readFile(resolve(process.cwd(), "app/page.tsx"), "utf8");

  assert.doesNotMatch(pageSource, /function ReadingFocusMode/);
  assert.match(pageSource, /isFocusMode=\{focusMode === "reading"\}/);
  assert.ok(
    (pageSource.match(/focusMode === "reading" \? "hidden" : "contents"/g) ?? []).length >= 2,
  );
  assert.match(pageSource, /data-reading-focus=\{focusMode === "reading" \? "active"/);
  assert.match(pageSource, /React\.useLayoutEffect\(\(\) => \{[\s\S]*previousFocusModeRef/);
  assert.match(pageSource, /readerFocusOverlayOpen\) return/);
  assert.match(pageSource, /aria-label="Reading focus controls"/);
  assert.match(pageSource, /aria-label="Open table of contents"/);
  assert.match(pageSource, /aria-label="Open reading preferences"/);
  assert.match(pageSource, /motion-reduce:transition-none/);
  assert.match(pageSource, /role="alert"[\s\S]*readerLoadError/);
  assert.match(pageSource, /const position = captureCurrentReaderPosition\(\)/);
  assert.match(pageSource, /scheduleReadingProgress\(position\.sceneId, position\.ratio\)/);
});

test("reader experience persists appearance, exposes canonical navigation, and avoids artificial whitespace", async () => {
  const pageSource = await readFile(resolve(process.cwd(), "app/page.tsx"), "utf8");
  const sharedSource = await readFile(resolve(process.cwd(), "components/studio/shared.tsx"), "utf8");
  const readerRouteSource = await readFile(resolve(process.cwd(), "app/api/reader/route.ts"), "utf8");

  assert.match(pageSource, /updateReaderPreferences\(defaultReaderPreferences\)/);
  assert.match(pageSource, /readerSettingsTimerRef\.current = setTimeout/);
  assert.match(pageSource, /serializeReaderNavigationState\(nextNavigation\)/);
  assert.match(pageSource, /router\.push\(`\$\{routeForPage\("reader", currentNovel\.id\)\}\?\$\{query\}`\)/);
  assert.match(pageSource, /readingProgressPercent/);
  assert.match(pageSource, /label=\{`\$\{readerScope\} reading progress`\}/);
  assert.doesNotMatch(pageSource, /min-h-\[calc\(100vh-4\.25rem\)\]/);
  assert.doesNotMatch(pageSource, /Â·/);
  assert.match(sharedSource, /role="progressbar"/);
  assert.match(sharedSource, /aria-valuenow=\{normalizedValue\}/);
  assert.match(readerRouteSource, /application\/json; charset=utf-8/);
});

test("reader hardening limits small scopes and exposes a metadata-only outline", async () => {
  const dbSource = await readFile(resolve(process.cwd(), "lib/db/studio.ts"), "utf8");
  const outlineRouteSource = await readFile(resolve(process.cwd(), "app/api/reader/outline/route.ts"), "utf8");
  const documentFunction = dbSource.slice(
    dbSource.indexOf("export async function getReaderDocument"),
    dbSource.indexOf("export async function getReaderOutline")
  );
  const outlineFunction = dbSource.slice(
    dbSource.indexOf("export async function getReaderOutline"),
    dbSource.indexOf("export class ReadingProgressValidationError")
  );

  assert.match(documentFunction, /scope === "scene"[\s\S]*prisma\.scene\.findFirst/);
  assert.match(documentFunction, /scope === "chapter"[\s\S]*prisma\.chapter\.findFirst/);
  assert.match(documentFunction, /scope === "volume"[\s\S]*prisma\.volume\.findFirst/);
  assert.match(documentFunction, /targetId !== novelId[\s\S]*prisma\.novel\.findUnique/);
  assert.doesNotMatch(outlineFunction, /content:\s*true/);
  assert.doesNotMatch(outlineFunction, /notion/i);
  assert.match(outlineRouteSource, /getReaderOutline/);
});

test("reader chapter assembly stays bounded on a representative large hierarchy", async () => {
  const reader = await loadTypeScriptModule("lib/reader-document.ts");
  const volumes = [{ id: "v1", novelId: "n1", title: "Volume", sortOrder: 1, archived: false }];
  const chapters = Array.from({ length: 4 }, (_, index) => ({
    id: `c${index + 1}`,
    volumeId: "v1",
    title: `Chapter ${index + 1}`,
    sortOrder: index + 1,
    archived: false
  }));
  const scenes = chapters.flatMap((chapter) =>
    Array.from({ length: 125 }, (_, index) => ({
      id: `${chapter.id}-s${index + 1}`,
      chapterId: chapter.id,
      title: `Scene ${index + 1}`,
      content: "texto local",
      sortOrder: index + 1,
      archived: false
    }))
  );

  const document = reader.assembleReaderDocument("chapter", "c3", volumes, chapters, scenes);
  assert.equal(scenes.length, 500);
  assert.equal(document.scenes.length, 125);
  assert.ok(document.scenes.every((scene) => scene.chapterId === "c3"));
});

test("top bar omits the technical local data status without removing navigation controls", async () => {
  const pageSource = await readFile(resolve(process.cwd(), "app/page.tsx"), "utf8");
  const topBarSource = await readFile(resolve(process.cwd(), "components/studio/top-bar.tsx"), "utf8");
  const i18nSource = await readFile(resolve(process.cwd(), "lib/studio-i18n.ts"), "utf8");

  assert.doesNotMatch(topBarSource, /ShieldCheck|dataStatusLabel|localStatus/);
  assert.doesNotMatch(pageSource, /dataSourceLabel|localStatus/);
  assert.doesNotMatch(i18nSource, /localStatus/);
  assert.match(topBarSource, /ToolbarIconButton/);
  assert.match(topBarSource, /SelectTrigger/);
});

test("character catalog keeps selection explicit, novel-scoped, stale-safe, and responsive", async () => {
  const source = await readFile(
    resolve(process.cwd(), "components/studio/characters-screen.tsx"),
    "utf8"
  );

  assert.match(source, /useState<string \| null>\(null\)/);
  assert.doesNotMatch(source, /characters\[0\]/);
  assert.match(source, /data\.novels\.some\(\(novel\) => novel\.id === character\.novelId\)/);
  assert.match(source, /aria-current=\{selected \? "true" : undefined\}/);
  assert.match(source, /Check className="size-3" aria-hidden="true"/);
  assert.match(source, /setSelectedCharacterId\(null\)/);
  assert.match(source, /window\.matchMedia\("\(max-width: 1279px\)"\)/);
  assert.match(source, /DialogContent className="[^"]*xl:hidden/);
  assert.match(source, /Select a character/);
  assert.match(source, /CompactFact[\s\S]*First appearance/);
});

test("reader responsive and resilience contracts prioritize content without horizontal overflow", async () => {
  const pageSource = await readFile(resolve(process.cwd(), "app/page.tsx"), "utf8");
  const sidebarSource = await readFile(resolve(process.cwd(), "components/studio/sidebar.tsx"), "utf8");
  const topBarSource = await readFile(resolve(process.cwd(), "components/studio/top-bar.tsx"), "utf8");
  const mobileNavSource = await readFile(resolve(process.cwd(), "components/studio/mobile-nav-dialog.tsx"), "utf8");

  assert.match(sidebarSource, /readerOptimized \? "lg:block" : "md:block"/);
  assert.match(topBarSource, /readerOptimized \? "lg:hidden" : "md:hidden"/);
  assert.match(mobileNavSource, /max-width: 1023px/);
  assert.match(pageSource, /lg:grid-cols-\[minmax\(11rem,220px\)/);
  assert.match(pageSource, /className="min-h-11 lg:hidden"[\s\S]*Preferences/);
  assert.match(pageSource, /Dialog open=\{focusPanel !== null\}/);
  assert.match(pageSource, /fetch\(`\/api\/reader\/outline\?novelId=/);
  assert.match(pageSource, /Reading progress is temporarily unavailable\. Reading remains available\./);
  assert.match(pageSource, /Nothing to read here yet/);
  assert.match(pageSource, /Back to Structure/);
  assert.match(pageSource, /const SceneHeading = isFocusMode && sceneIndex === 0 \? "h1"/);
  assert.match(pageSource, /motion-reduce:transition-none/);
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
