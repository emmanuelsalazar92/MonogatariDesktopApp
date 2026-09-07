import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import createJiti from "jiti";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import ts from "typescript";

const require = createRequire(import.meta.url);

async function loadTypeScript(path, dependencies = {}) {
  const source = await readFile(resolve(path), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const moduleRecord = { exports: {} };
  new Function("require", "exports", "module", output)(
    (id) => {
      if (Object.hasOwn(dependencies, id)) return dependencies[id];
      throw new Error(`Unexpected dependency ${id}`);
    },
    moduleRecord.exports,
    moduleRecord
  );
  return moduleRecord.exports;
}

test("SQLite scene persistence protects loaded manuscripts, revisions, and aggregate word counts", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "monogatari-scene-tests-"));
  const databasePath = join(directory, "test.db");
  let prisma;
  t.after(async () => {
    await prisma?.$disconnect();
    await rm(directory, { recursive: true, force: true });
  });

  const schema = execFileSync(process.execPath, [
    require.resolve("prisma/build/index.js"), "migrate", "diff", "--from-empty", "--to-schema", resolve("prisma/schema.prisma"), "--script"
  ], { encoding: "utf8", maxBuffer: 3 * 1024 * 1024, windowsHide: true });
  const sqlite = new Database(databasePath);
  sqlite.exec(schema);
  sqlite.close();

  const { PrismaClient } = createJiti(import.meta.url)(resolve("lib/generated/prisma/client.ts"));
  prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databasePath }) });
  const persistence = await loadTypeScript("lib/scene-persistence.ts");
  const studio = await loadTypeScript("lib/db/studio.ts", {
    "@/lib/db/prisma": { prisma },
    "@/lib/scene-persistence": persistence,
    "@/lib/chapter-preview": {},
    "@/lib/character-first-appearance": { deriveCharacterFirstAppearanceDetails: () => new Map() },
    "@/lib/db/places": { listPlaces: async () => [] },
    "@/lib/db/notes": { writeNote: async () => {} },
    "@/lib/db/recent-activity": { recordRecentActivity: async () => {}, recentActivityLimit: 10 },
    "@/lib/character-place": {},
    "@/lib/db/timeline-places": {},
    "@/lib/db/timeline-position": {},
    "@/lib/timeline-event": {},
    "@/lib/db/scene-places": {
      scenePlaceLinksInclude: { placeLinks: { select: { locationId: true } } },
      setScenePlaces: async () => {},
      setLegacyScenePlace: async () => {}
    },
    "@/lib/db/scene-recovery": { createRecoveryCheckpoint: async () => {} },
    "@/lib/reader-progress": {},
    "@/lib/studio-settings": {
      STUDIO_CONFIGURATION_ID: "studio",
      STUDIO_CONFIGURATION_VERSION: 1,
      parseStudioSettings: () => ({}),
      applyStudioSettings: () => ({}),
      validateStudioSettingsUpdate: () => ({ ok: true })
    },
    "@/lib/character-metadata": {},
    "@/lib/character-relationship": {},
    "@/lib/novel-metadata": {}
  });

  await prisma.novel.create({ data: { id: "novel-a", title: "Novel" } });
  await prisma.volume.create({ data: { id: "volume-a", novelId: "novel-a", title: "Volume" } });
  await prisma.chapter.create({ data: { id: "chapter-a", volumeId: "volume-a", title: "Chapter" } });
  await prisma.scene.create({ data: {
    id: "scene-a", chapterId: "chapter-a", title: "Opening", content: "Original manuscript remains safe", wordCount: 4, revision: 3
  } });

  await assert.rejects(
    studio.updateScene("scene-a", { content: "", expectedRevision: 3 }),
    persistence.SceneDocumentNotLoadedError
  );
  assert.equal((await prisma.scene.findUniqueOrThrow({ where: { id: "scene-a" } })).content, "Original manuscript remains safe");

  const saved = await studio.updateScene("scene-a", {
    content: "A newly saved manuscript has five words",
    expectedRevision: 3,
    documentLoaded: true
  });
  assert.equal(saved.wordCount, 7);
  assert.equal(saved.revision, 4);
  assert.equal((await prisma.chapter.findUniqueOrThrow({ where: { id: "chapter-a" } })).wordCount, 7);
  assert.equal((await prisma.novel.findUniqueOrThrow({ where: { id: "novel-a" } })).wordCount, 7);

  await assert.rejects(
    studio.updateScene("scene-a", { content: "stale writer", expectedRevision: 3, documentLoaded: true }),
    persistence.SceneRevisionConflictError
  );
  assert.equal((await studio.getScene("scene-a")).content, "A newly saved manuscript has five words");

  await studio.updateScene("scene-a", { content: "", expectedRevision: 4, documentLoaded: true });
  const cleared = await prisma.scene.findUniqueOrThrow({ where: { id: "scene-a" } });
  assert.equal(cleared.content, "");
  assert.equal(cleared.wordCount, 0);
});
