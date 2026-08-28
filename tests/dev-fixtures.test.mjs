import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test, { after } from "node:test";

import Database from "better-sqlite3";

import { canSeedWithoutReset, inspectDevDatabase } from "../scripts/dev-database-state.mjs";

const temporaryDirectory = await mkdtemp(join(tmpdir(), "monogatari-fixtures-"));
after(() => rm(temporaryDirectory, { recursive: true, force: true }));

function createSchema(databasePath) {
  const database = new Database(databasePath);
  database.exec(`
    CREATE TABLE Novel (id TEXT PRIMARY KEY);
    CREATE TABLE Volume (id TEXT PRIMARY KEY, novelId TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE Chapter (id TEXT PRIMARY KEY, volumeId TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE Scene (id TEXT PRIMARY KEY, chapterId TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
  `);
  return database;
}

test("an empty development database is eligible for safe fixture seeding", () => {
  const databasePath = join(temporaryDirectory, "empty.db");
  createSchema(databasePath).close();
  const state = inspectDevDatabase(databasePath);

  assert.equal(state.narrativeRecordCount, 0);
  assert.equal(state.visualFixturesReady, false);
  assert.equal(canSeedWithoutReset(state), true);
});

test("a populated personal database is preserved even when visual fixtures are absent", () => {
  const databasePath = join(temporaryDirectory, "personal.db");
  const database = createSchema(databasePath);
  database.prepare("INSERT INTO Novel (id) VALUES (?)").run("my-private-novel");
  database.close();
  const state = inspectDevDatabase(databasePath);

  assert.equal(state.novelCount, 1);
  assert.equal(state.visualFixturesReady, false);
  assert.equal(canSeedWithoutReset(state), false);
});

test("the stable visual dataset exposes two active scenes in the known chapter", () => {
  const databasePath = join(temporaryDirectory, "fixtures.db");
  const database = createSchema(databasePath);
  database.prepare("INSERT INTO Novel (id) VALUES (?)").run("novel-eco-azul");
  database.prepare("INSERT INTO Volume (id, novelId) VALUES (?, ?)").run("vol-1", "novel-eco-azul");
  database.prepare("INSERT INTO Chapter (id, volumeId) VALUES (?, ?)").run("ch-1", "vol-1");
  const insertScene = database.prepare("INSERT INTO Scene (id, chapterId) VALUES (?, ?)");
  insertScene.run("scene-1", "ch-1");
  insertScene.run("scene-2", "ch-1");
  database.close();
  const state = inspectDevDatabase(databasePath);

  assert.equal(state.visualFixturesReady, true);
  assert.equal(state.fixtureSceneCount, 2);
  assert.equal(canSeedWithoutReset(state), false);
});

test("the QA preflight fails early with actionable, non-destructive guidance", () => {
  const missingDatabasePath = join(temporaryDirectory, "missing.db");
  const result = spawnSync(process.execPath, ["scripts/check-visual-fixtures.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, MONOGATARI_DEV_DB_PATH: missingDatabasePath },
    encoding: "utf8"
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /npm run setup:dev/);
  assert.match(result.stderr, /npm run setup:dev:reset/);
  assert.match(result.stderr, /never overwrites populated narrative data/);
});
