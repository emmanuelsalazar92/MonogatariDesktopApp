import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { migrateScenePlaces } from "../scripts/migrate-scene-places.mjs";

test("Scene–Place migration preserves valid links once, including archived scenes, without resurrecting unlinks", () => {
  const database = new Database(":memory:");
  try {
    database.pragma("foreign_keys = ON");
    database.exec(`CREATE TABLE Volume (id TEXT PRIMARY KEY, novelId TEXT);
      CREATE TABLE Chapter (id TEXT PRIMARY KEY, volumeId TEXT);
      CREATE TABLE Location (id TEXT PRIMARY KEY, novelId TEXT);
      CREATE TABLE Scene (id TEXT PRIMARY KEY, chapterId TEXT, locationId TEXT, archived INTEGER, content TEXT);
      INSERT INTO Volume VALUES ('v', 'a'); INSERT INTO Chapter VALUES ('c', 'v');
      INSERT INTO Location VALUES ('place', 'a'), ('foreign', 'b');
      INSERT INTO Scene VALUES ('s1', 'c', 'place', 0, 'keep manuscript'), ('s2', 'c', 'place', 1, 'keep history'), ('s3', 'c', 'foreign', 0, 'foreign'), ('s4', 'c', 'missing', 0, 'orphan');`);
    assert.equal(migrateScenePlaces(database), 2);
    assert.throws(() => database.prepare('INSERT INTO ScenePlace VALUES (?, ?)').run('s1', 'place'), /UNIQUE/);
    assert.throws(() => database.prepare('INSERT INTO ScenePlace VALUES (?, ?)').run('unknown', 'place'), /FOREIGN KEY/);
    assert.throws(() => database.prepare('INSERT INTO ScenePlace VALUES (?, ?)').run('s1', 'unknown'), /FOREIGN KEY/);
    database.prepare('DELETE FROM ScenePlace WHERE sceneId = ?').run('s1');
    assert.equal(migrateScenePlaces(database), 0);
    assert.equal(database.prepare('SELECT count(*) AS n FROM ScenePlace').get().n, 1);
    assert.equal(database.prepare('SELECT content FROM Scene WHERE id = ?').get('s1').content, 'keep manuscript');
    assert.equal(database.prepare('SELECT count(*) AS n FROM Location').get().n, 2);
  } finally { database.close(); }
});

test("Scene–Place mutation input allowlists IDs and bounded, disjoint deltas", () => {
  const source = readFileSync(new URL("../lib/scene-place.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const result = { exports: {} };
  new Function("require", "exports", "module", compiled)(() => ({ isValidNovelRouteId: (id) => /^[a-zA-Z0-9_-]+$/.test(id) }), result.exports, result);
  const parse = result.exports.readScenePlaceChanges;
  assert.deepEqual(parse({ addSceneIds: ['s', 's'], removeSceneIds: [] }), { addSceneIds: ['s'], removeSceneIds: [] });
  for (const value of [null, [], {}, { addSceneIds: ['s'], removeSceneIds: ['s'] }, { addSceneIds: ['../s'], removeSceneIds: [] }, { addSceneIds: Array(201).fill('s'), removeSceneIds: [] }, { addSceneIds: [], removeSceneIds: [], content: 'untrusted' }]) assert.equal(parse(value), null);
});

test("Place scene selectors and derived queries never select manuscript bodies", () => {
  const db = readFileSync(new URL("../lib/db/scene-places.ts", import.meta.url), "utf8");
  assert.doesNotMatch(db, /content:|summary:|notes:/);
  const ui = readFileSync(new URL("../components/studio/place-scenes.tsx", import.meta.url), "utf8");
  assert.match(ui, /routeForPage\("editor", place.novelId, scene.id\)/);
  assert.match(ui, /type="checkbox"/);
  assert.match(ui, /addSceneIds:/);
  assert.match(ui, /removeSceneIds:/);
});
