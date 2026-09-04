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
  assert.deepEqual(routes.parseStudioRoute("/novels/novel-1/characters/character-2"), {
    page: "characters",
    novelId: "novel-1",
    characterId: "character-2"
  });
  assert.deepEqual(routes.parseStudioRoute("/novels/novel-1/places/place-2"), {
    page: "places",
    novelId: "novel-1",
    placeId: "place-2"
  });
  assert.equal(
    routes.routeForCharacter("novel-1", "character-2"),
    "/novels/novel-1/characters/character-2"
  );
  assert.equal(routes.routeForPlace("novel-1", "place-2"), "/novels/novel-1/places/place-2");
  assert.equal(routes.parseStudioRoute("/novels/%2Fnot-an-id"), null);
  assert.equal(routes.parseStudioRoute("/novels/novel-1/editor/%2Fscene"), null);
  assert.equal(routes.parseStudioRoute("/novels/novel-1/characters/%2Fcharacter"), null);
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
  assert.equal(metadata.validateCharacterMetadata({ name: "Ada", status: "Archived" }).ok, false);
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

test("character relationships enforce one identity and coherent inverse labels", async () => {
  const relationships = await loadTypeScriptModule("lib/character-relationship.ts");
  const symmetric = relationships.getRelationshipDefinition("spouse_of");
  assert.equal(symmetric.direction, "Bidirectional");
  assert.equal(symmetric.labelFromTo, "Spouse of");
  assert.equal(symmetric.labelToFrom, "Spouse of");

  const directed = relationships.getRelationshipDefinition("parent_of");
  assert.equal(directed.labelFromTo, "Parent of");
  assert.equal(directed.labelToFrom, "Child of");
  assert.deepEqual(
    relationships.relationshipViewForCharacter(
      { fromCharacterId: "parent", toCharacterId: "child", labelFromTo: "Parent of", labelToFrom: "Child of" },
      "child"
    ),
    { otherCharacterId: "parent", label: "Child of" }
  );

  assert.equal(
    relationships.relationshipIdentity("novel", "a", "b", "spouses"),
    relationships.relationshipIdentity("novel", "b", "a", "spouses")
  );
});

test("character relationships reject self, arbitrary types, and cross-novel ownership", async () => {
  const relationships = await loadTypeScriptModule("lib/character-relationship.ts");
  assert.equal(relationships.validateRelationshipInput({ novelId: "n", fromCharacterId: "a", toCharacterId: "a", relationshipType: "spouse_of" }).ok, false);
  assert.equal(relationships.validateRelationshipInput({ novelId: "n", fromCharacterId: "a", toCharacterId: "b", relationshipType: "invented" }).ok, false);
  assert.equal(relationships.validateRelationshipInput({ novelId: "n", fromCharacterId: "a", toCharacterId: "b", relationshipType: "friend_of", labelFromTo: "hacked" }).ok, false);
  assert.equal(relationships.charactersBelongToNovel([{ id: "a", novelId: "n1" }, { id: "b", novelId: "n2" }], "n1", ["a", "b"]), false);
  assert.equal(relationships.charactersBelongToNovel([{ id: "a", novelId: "n1" }, { id: "b", novelId: "n1" }], "n1", ["a", "b"]), true);
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
    readerWidth: "720 px"
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

  assert.match(dialogSource, /dialog-surface/);
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
  assert.match(studioSource, /tx\.timelineEvent\.updateMany\(\{ where: \{ sceneId,/);
  assert.match(studioSource, /sceneId: null, positionRevision: \{ increment: 1 \}/);
  assert.match(studioSource, /chapterId: scene.chapterId, volumeId: scene.chapter.volumeId, positionRevision: \{ increment: 1 \}/);
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

  assert.match(source, /selectedCharacterId: string \| null/);
  assert.doesNotMatch(source, /characters\[0\]/);
  assert.match(source, /data\.novels\.some\(\(novel\) => novel\.id === character\.novelId\)/);
  assert.match(source, /data\.characters\.find\(\(character\) => character\.id === selectedCharacterId\)/);
  assert.match(source, /aria-current=\{selected \? "true" : undefined\}/);
  assert.match(source, /Check className="size-3" aria-hidden="true"/);
  assert.match(source, /href=\{characterHref\(character\.id\)\}/);
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
    if (moduleId === "./place-classification") return {};
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

test("character scene links use the normalized join as their single source of truth", async () => {
  const schema = await readFile(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
  const studioSource = await readFile(resolve(process.cwd(), "lib/db/studio.ts"), "utf8");
  const routeSource = await readFile(resolve(process.cwd(), "app/api/characters/[characterId]/scenes/route.ts"), "utf8");
  const charactersSource = await readFile(resolve(process.cwd(), "components/studio/characters-screen.tsx"), "utf8");

  assert.match(schema, /model SceneCharacter[\s\S]*@@id\(\[sceneId, characterId\]\)/);
  assert.doesNotMatch(schema, /scenesCount/);
  assert.match(studioSource, /_count: \{[\s\S]*?sceneLinks: true/);
  assert.match(studioSource, /character\._count\?\.sceneLinks \?\? 0/);
  assert.match(studioSource, /character\.novelId !== scene\.chapter\.volume\.novelId/);
  assert.match(studioSource, /sceneCharacter\.upsert/);
  assert.match(studioSource, /sceneCharacter\.deleteMany\(\{ where: \{ characterId, sceneId \} \}\)/);
  assert.match(routeSource, /export async function (GET|POST|DELETE)/);
  assert.match(charactersSource, /volumeTitle[\s\S]*chapterTitle/);
  assert.match(charactersSource, /routeForPage\("editor", character\.novelId, scene\.sceneId\)/);
  assert.match(charactersSource, /Remove linked scene/);
});

test("character catalog parses safe URL state and clears back to canonical defaults", async () => {
  const metadata = await loadTypeScriptModule("lib/character-metadata.ts");
  const catalog = await loadTypeScriptModule("lib/character-catalog.ts", (moduleId) => {
    if (moduleId === "@/lib/character-metadata") return metadata;
    if (moduleId === "@/lib/studio-domain") return {};
    throw new Error(`Unexpected module: ${moduleId}`);
  });

  assert.deepEqual(
    catalog.parseCharacterCatalogState(
      new URLSearchParams("q=juan&role=support&status=active&sort=scene-count")
    ),
    { query: "juan", role: "Support", status: "Active", sort: "Scene count", showArchived: false }
  );
  assert.deepEqual(
    catalog.parseCharacterCatalogState(
      new URLSearchParams("role=wizard&status=unknown&sort=DROP%20TABLE")
    ),
    catalog.defaultCharacterCatalogState
  );
  assert.equal(
    catalog.serializeCharacterCatalogState(catalog.defaultCharacterCatalogState).toString(),
    ""
  );
});

test("character catalog searches names, combines filters, and sorts deterministically", async () => {
  const metadata = await loadTypeScriptModule("lib/character-metadata.ts");
  const catalog = await loadTypeScriptModule("lib/character-catalog.ts", (moduleId) => {
    if (moduleId === "@/lib/character-metadata") return metadata;
    if (moduleId === "@/lib/studio-domain") return {};
    throw new Error(`Unexpected module: ${moduleId}`);
  });
  const characters = [
    { id: "juana", name: "Juana", aliases: [], role: "Support", status: "Active", updatedAt: "2026-01-01T00:00:00.000Z", firstAppearanceOrder: 2, scenes: 4 },
    { id: "juancho", name: "Juancho", aliases: [], role: "Support", status: "Active", updatedAt: "2026-03-01T00:00:00.000Z", firstAppearanceOrder: 0, scenes: 8 },
    { id: "alias-only", name: "Ana", aliases: ["Juan"], role: "Support", status: "Active", updatedAt: "2026-02-01T00:00:00.000Z", firstAppearanceOrder: 1, scenes: 2 },
    { id: "inactive", name: "Juan Carlos", aliases: [], role: "Support", status: "Inactive", updatedAt: "2026-04-01T00:00:00.000Z", firstAppearanceOrder: null, scenes: 10 },
    { id: "lead", name: "Juanita", aliases: [], role: "Protagonist", status: "Active", updatedAt: "2026-05-01T00:00:00.000Z", firstAppearanceOrder: null, scenes: 12 }
  ];
  const state = { query: "juan", role: "Support", status: "Active", sort: "Name" };

  assert.deepEqual(
    catalog.filterAndSortCharacters(characters, state).map((character) => character.id),
    ["juana", "juancho"]
  );
  assert.deepEqual(
    catalog.filterAndSortCharacters(characters, { ...state, sort: "Last edited" }).map((character) => character.id),
    ["juancho", "juana"]
  );
  assert.deepEqual(
    catalog.filterAndSortCharacters(characters, { ...state, sort: "First appearance" }).map((character) => character.id),
    ["juancho", "juana"]
  );
  assert.deepEqual(
    catalog.filterAndSortCharacters(characters, { ...state, sort: "Scene count" }).map((character) => character.id),
    ["juancho", "juana"]
  );
  assert.deepEqual(
    catalog.filterAndSortCharacters(
      [
        { ...characters[0], id: "b", name: "Same" },
        { ...characters[0], id: "a", name: "Same" }
      ],
      catalog.defaultCharacterCatalogState
    ).map((character) => character.id),
    ["a", "b"]
  );
});

test("character catalog controls persist URL state and expose clear filters", async () => {
  const pageSource = await readFile(resolve(process.cwd(), "app/page.tsx"), "utf8");
  const charactersSource = await readFile(
    resolve(process.cwd(), "components/studio/characters-screen.tsx"),
    "utf8"
  );

  assert.match(pageSource, /parseCharacterCatalogState\(searchParams\)/);
  assert.match(pageSource, /serializeCharacterCatalogState\(nextState\)/);
  assert.match(pageSource, /filterAndSortCharacters\(characters, characterCatalogState\)/);
  assert.match(charactersSource, /Clear filters/);
  assert.match(charactersSource, /Sort characters/);
});

test("character catalog hides archived records by default and can reveal them", async () => {
  const metadata = await loadTypeScriptModule("lib/character-metadata.ts");
  const catalog = await loadTypeScriptModule("lib/character-catalog.ts", (moduleId) => {
    if (moduleId === "@/lib/character-metadata") return metadata;
    if (moduleId === "@/lib/studio-domain") return {};
    throw new Error(`Unexpected module: ${moduleId}`);
  });
  const archived = {
    id: "archived",
    name: "Archived",
    aliases: [],
    role: "Support",
    status: "Archived",
    updatedAt: "2026-01-01T00:00:00.000Z",
    firstAppearanceOrder: null,
    scenes: 2
  };

  assert.deepEqual(catalog.filterAndSortCharacters([archived], catalog.defaultCharacterCatalogState), []);
  assert.deepEqual(
    catalog.filterAndSortCharacters(
      [archived],
      { ...catalog.defaultCharacterCatalogState, showArchived: true }
    ).map((character) => character.id),
    ["archived"]
  );
  assert.deepEqual(
    catalog.parseCharacterCatalogState(new URLSearchParams("archived=true&status=archived")),
    { ...catalog.defaultCharacterCatalogState, status: "Archived", showArchived: true }
  );
});

test("character lifecycle preserves joins and protects hard delete with current impact", async () => {
  const schema = await readFile(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
  const studioSource = await readFile(resolve(process.cwd(), "lib/db/studio.ts"), "utf8");
  const characterRoute = await readFile(resolve(process.cwd(), "app/api/characters/[characterId]/route.ts"), "utf8");
  const archiveRoute = await readFile(resolve(process.cwd(), "app/api/characters/[characterId]/archive/route.ts"), "utf8");
  const restoreRoute = await readFile(resolve(process.cwd(), "app/api/characters/[characterId]/restore/route.ts"), "utf8");
  const impactRoute = await readFile(resolve(process.cwd(), "app/api/characters/[characterId]/impact/route.ts"), "utf8");
  const charactersSource = await readFile(
    resolve(process.cwd(), "components/studio/characters-screen.tsx"),
    "utf8"
  );
  const archiveFunction = studioSource.slice(
    studioSource.indexOf("export async function archiveCharacter"),
    studioSource.indexOf("export async function restoreCharacter")
  );
  const deleteFunction = studioSource.slice(
    studioSource.indexOf("export async function deleteCharacter"),
    studioSource.indexOf("export class SceneCharacterConflictError")
  );

  assert.match(schema, /model Character[\s\S]*archivedAt\s+DateTime\?/);
  assert.match(schema, /model SceneCharacter[\s\S]*character\s+Character[^\n]*onDelete: Restrict/);
  assert.match(schema, /model CharacterPlace[\s\S]*character\s+Character[^\n]*onDelete: Restrict/);
  assert.match(schema, /fromCharacter\s+Character[^\n]*onDelete: Restrict/);
  assert.match(schema, /toCharacter\s+Character[^\n]*onDelete: Restrict/);
  assert.match(archiveFunction, /data: \{ archivedAt: new Date\(\) \}/);
  assert.doesNotMatch(archiveFunction, /sceneCharacter\.(delete|update)/);
  assert.doesNotMatch(archiveFunction, /characterPlace\.(delete|update)/);
  assert.doesNotMatch(archiveFunction, /relationship\.(delete|update)/);
  assert.match(studioSource, /sceneCharacter\.count\(\{ where: \{ characterId \} \}\)/);
  assert.match(studioSource, /characterPlace\.count\(\{ where: \{ characterId \} \}\)/);
  assert.match(studioSource, /relationship\.count/);
  assert.match(deleteFunction, /Character references changed; review the current impact/);
  assert.match(deleteFunction, /if \(!impact\.canDelete\)/);
  assert.match(deleteFunction, /tx\.character\.delete/);
  assert.match(characterRoute, /body\?\.confirmed !== true/);
  assert.match(characterRoute, /status: error\.message === "Character was not found" \? 404 : 409/);
  assert.match(archiveRoute, /archiveCharacter/);
  assert.match(restoreRoute, /restoreCharacter/);
  assert.match(impactRoute, /getCharacterDeleteImpact/);
  assert.match(charactersSource, /deleteImpact\.linkedScenes/);
  assert.match(charactersSource, /deleteImpact\.linkedPlaces/);
  assert.match(charactersSource, /deleteImpact\.relationships/);
  assert.match(charactersSource, /disabled=\{!deleteImpact\?\.canDelete \|\| lifecyclePending\}/);
  assert.match(charactersSource, /Show archived/);
});

test("character first appearance follows narrative order and ignores archived or cross-novel scenes", async () => {
  const firstAppearance = await loadTypeScriptModule("lib/character-first-appearance.ts");
  const characters = [{ id: "character", novelId: "novel" }];
  const volumes = [
    { id: "volume-2", novelId: "novel", title: "Volume 2", sortOrder: 2 },
    { id: "volume-1", novelId: "novel", title: "Volume 1", sortOrder: 1 },
    { id: "foreign-volume", novelId: "other", title: "Foreign", sortOrder: 0 }
  ];
  const chapters = [
    { id: "chapter-2", volumeId: "volume-1", title: "Chapter 2", sortOrder: 2 },
    { id: "chapter-1", volumeId: "volume-1", title: "Chapter 1", sortOrder: 1 },
    { id: "foreign-chapter", volumeId: "foreign-volume", title: "Foreign", sortOrder: 0 }
  ];
  const scenes = [
    { id: "s8", chapterId: "chapter-2", title: "Later", sortOrder: 8, archived: false },
    { id: "s3", chapterId: "chapter-1", title: "Arrival", sortOrder: 3, archived: false },
    { id: "archived", chapterId: "chapter-1", title: "Hidden", sortOrder: 1, archived: true },
    { id: "foreign", chapterId: "foreign-chapter", title: "Foreign", sortOrder: 0, archived: false }
  ];
  const links = ["s8", "s3", "archived", "foreign"].map((sceneId) => ({
    characterId: "character",
    sceneId
  }));

  const initial = firstAppearance.deriveCharacterFirstAppearances(
    characters,
    volumes,
    chapters,
    scenes,
    links
  );
  assert.equal(initial.get("character"), "Volume 1 · Chapter 1 · 03 — Arrival");

  const reordered = firstAppearance.deriveCharacterFirstAppearances(
    characters,
    volumes,
    [{ ...chapters[0], sortOrder: 0 }, chapters[1], chapters[2]],
    scenes,
    links
  );
  assert.equal(reordered.get("character"), "Volume 1 · Chapter 2 · 08 — Later");

  const afterUnlink = firstAppearance.deriveCharacterFirstAppearances(
    characters,
    volumes,
    chapters,
    scenes,
    links.filter((link) => link.sceneId !== "s3")
  );
  assert.equal(afterUnlink.get("character"), "Volume 1 · Chapter 2 · 08 — Later");
  assert.equal(
    firstAppearance.deriveCharacterFirstAppearances(characters, volumes, chapters, scenes, []).get("character"),
    undefined
  );
});

test("character first appearance is derived and not persisted", async () => {
  const schema = await readFile(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
  const studioSource = await readFile(resolve(process.cwd(), "lib/db/studio.ts"), "utf8");
  const charactersSource = await readFile(
    resolve(process.cwd(), "components/studio/characters-screen.tsx"),
    "utf8"
  );
  const characterModel = schema.slice(
    schema.indexOf("model Character {"),
    schema.indexOf("model SceneCharacter {")
  );

  assert.doesNotMatch(characterModel, /firstAppearance/);
  assert.match(studioSource, /deriveCharacterFirstAppearanceDetails/);
  assert.match(studioSource, /prisma\.sceneCharacter\.findMany/);
  assert.match(charactersSource, /character\.firstAppearance \|\| translate\("Not linked yet"\)/);
});

test("character place links are normalized, allowlisted, novel-scoped, and navigable", async () => {
  const schema = await readFile(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
  const studioSource = await readFile(resolve(process.cwd(), "lib/db/studio.ts"), "utf8");
  const routeSource = await readFile(resolve(process.cwd(), "app/api/characters/[characterId]/places/route.ts"), "utf8");
  const charactersSource = await readFile(resolve(process.cwd(), "components/studio/characters-screen.tsx"), "utf8");
  const pageSource = await readFile(resolve(process.cwd(), "app/page.tsx"), "utf8");
  const characterPlace = await loadTypeScriptModule(
    "lib/character-place.ts",
    (moduleId) => {
      if (moduleId === "@/lib/studio-domain") {
        return {
          characterPlaceRelationshipTypes: [
            "Lives at",
            "Works at",
            "Frequent location",
            "Associated with"
          ]
        };
      }
      throw new Error(`Unexpected module: ${moduleId}`);
    }
  );

  assert.match(schema, /model CharacterPlace[\s\S]*@@id\(\[characterId, locationId\]\)/);
  assert.match(studioSource, /character\.novelId !== location\.novelId/);
  assert.match(studioSource, /characterPlace\.upsert/);
  assert.match(studioSource, /characterPlace\.deleteMany\(\{ where: \{ characterId, locationId \} \}\)/);
  assert.match(routeSource, /export async function (GET|POST|DELETE)/);
  assert.equal(characterPlace.parseCharacterPlaceRelationshipType(undefined), "Associated with");
  assert.equal(characterPlace.parseCharacterPlaceRelationshipType("Lives at"), "Lives at");
  assert.equal(characterPlace.parseCharacterPlaceRelationshipType("Invented"), null);
  assert.doesNotMatch(charactersSource, /timelineEvents[\s\S]*Linked places/);
  assert.match(charactersSource, /routeForPlace\(character\.novelId, place\.locationId\)/);
  assert.match(pageSource, /<PlaceCharacters[^>]*characters=\{data.characters\} links=\{data.characterPlaceLinks\}/);
  const placesSource = await readFile(resolve(process.cwd(), "components/studio/place-characters.tsx"), "utf8");
  assert.match(placesSource, /\/api\/characters\/\$\{encodeURIComponent\(id\)\}\/places/);
  assert.match(placesSource, /routeForCharacter\(place.novelId, character.characterId\)/);
  assert.match(placesSource, /mutate\("DELETE", character.characterId\)/);
  assert.match(placesSource, /characterPlaceRelationshipTypes\.map/);
  assert.match(pageSource, /selectedPlaceId=\{activeRoute\?\.placeId \?\? null\}/);
});

test("character deep links are URL-controlled, ownership-checked, and connect related entities", async () => {
  const pageSource = await readFile(resolve(process.cwd(), "app/page.tsx"), "utf8");
  const charactersSource = await readFile(
    resolve(process.cwd(), "components/studio/characters-screen.tsx"),
    "utf8"
  );
  const routeSource = await readFile(
    resolve(process.cwd(), "app/novels/[novelId]/characters/[characterId]/page.tsx"),
    "utf8"
  );
  const studioSource = await readFile(resolve(process.cwd(), "lib/db/studio.ts"), "utf8");

  assert.match(pageSource, /selectedCharacterId=\{activeRoute\?\.characterId \?\? null\}/);
  assert.match(pageSource, /routeForCharacter\(currentNovel\.id, characterId\)/);
  assert.match(charactersSource, /href=\{routeForCharacter\(character\.novelId, relatedCharacter\.id\)\}/);
  assert.match(charactersSource, /href=\{routeForPage\("editor", character\.novelId, scene\.sceneId\)\}/);
  assert.match(charactersSource, /titleRef\.current\?\.focus\(\)/);
  assert.match(routeSource, /characterBelongsToNovelForRoute\(novelId, characterId\)/);
  assert.match(studioSource, /where: \{ id: characterId, novelId \}/);
});

test("character catalog responses stay minimal and detail failures remain isolated", async () => {
  const studioSource = await readFile(resolve(process.cwd(), "lib/db/studio.ts"), "utf8");
  const charactersSource = await readFile(
    resolve(process.cwd(), "components/studio/characters-screen.tsx"),
    "utf8"
  );
  const summarySerializer = studioSource.slice(
    studioSource.indexOf("function serializeCharacterSummary"),
    studioSource.indexOf("function serializeNovel")
  );

  assert.doesNotMatch(summarySerializer, /secret|notes|appearance|personality|wayOfSpeaking|goal|fear/);
  assert.match(summarySerializer, /sceneLinks/);
  assert.match(summarySerializer, /placeLinks/);
  assert.match(summarySerializer, /outgoingRelationships/);
  assert.match(studioSource, /export async function getCharacterDetail\(novelId: string, characterId: string\)/);
  assert.match(charactersSource, /CharacterDetailError/);
  assert.match(charactersSource, /controller\.abort\(\)/);
  assert.match(charactersSource, /Could not load character details/);
  assert.match(charactersSource, /Related character unavailable/);
  assert.doesNotMatch(charactersSource, /xl:max-h-\[calc\(100vh-7rem\)\]/);
});

test("character mutations reject untrusted browser origins", async () => {
  const security = await loadTypeScriptModule("lib/request-security.ts");

  assert.equal(
    security.isTrustedMutationRequest(new Request("http://192.168.1.20:3000/api/characters", {
      method: "POST",
      headers: { origin: "http://192.168.1.20:3000", "sec-fetch-site": "same-origin" }
    })),
    true
  );
  assert.equal(
    security.isTrustedMutationRequest(new Request("http://192.168.1.20:3000/api/characters", {
      method: "POST",
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" }
    })),
    false
  );
});

test("character catalog remains deterministic for a 300-character dataset", async () => {
  const metadata = await loadTypeScriptModule("lib/character-metadata.ts");
  const catalog = await loadTypeScriptModule("lib/character-catalog.ts", (moduleId) => {
    if (moduleId === "@/lib/character-metadata") return metadata;
    if (moduleId === "@/lib/studio-domain") return {};
    throw new Error(`Unexpected module: ${moduleId}`);
  });
  const characters = Array.from({ length: 300 }, (_, index) => ({
    id: `character-${String(index).padStart(3, "0")}`,
    name: `Character ${String(299 - index).padStart(3, "0")}`,
    role: index % 2 === 0 ? "Support" : "Minor",
    status: "Active",
    updatedAt: "2026-01-01T00:00:00.000Z",
    firstAppearanceOrder: index,
    scenes: index % 20
  }));

  const result = catalog.filterAndSortCharacters(characters, catalog.defaultCharacterCatalogState);
  assert.equal(result.length, 300);
  assert.equal(result[0].name, "Character 000");
  assert.equal(result[299].name, "Character 299");
});
