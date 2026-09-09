import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import ts from "typescript";

function inspector() {
  const source = readFileSync(new URL("../lib/schema-compatibility.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function("require", "exports", "module", output)((id) => {
    if (id === "server-only") return {};
    if (id === "better-sqlite3") return Database;
    if (id === "@/lib/db/prisma") return { databasePath: "unused.db" };
    throw new Error(`Unexpected module ${id}`);
  }, exports, { exports });
  return exports.inspectSchemaCompatibility;
}

function createDatabase(path, options = {}) {
  const db = new Database(path);
  if (!options.withoutMapping) db.exec('CREATE TABLE "NotionMapping" ("localId" TEXT PRIMARY KEY, "lastSyncedRevision" INTEGER, "lastSyncedContent" TEXT, "lastSyncedAt" DATETIME, "remoteLastEditedAt" DATETIME, "remoteArchivedAt" DATETIME)');
  if (!options.withoutMarkers) { db.exec('CREATE TABLE "SchemaMigration" ("id" TEXT PRIMARY KEY)'); if (!options.withoutMarker) { db.prepare('INSERT INTO "SchemaMigration" (id) VALUES (?)').run("2026-09-08-notion-mapping-scene-cursors"); if (options.newer) db.prepare('INSERT INTO "SchemaMigration" (id) VALUES (?)').run("2027-01-01-future"); } }
  db.close();
}

test("schema compatibility distinguishes compatible, old, missing, and newer persisted databases", async () => {
  const directory = await mkdtemp(join(tmpdir(), "monogatari-schema-"));
  try {
    const inspect = inspector();
    const compatible = join(directory, "compatible.db"); createDatabase(compatible);
    assert.equal(inspect(compatible).code, "SCHEMA_COMPATIBLE");
    const missingColumn = join(directory, "old.db"); createDatabase(missingColumn); const old = new Database(missingColumn); old.exec('ALTER TABLE "NotionMapping" DROP COLUMN "lastSyncedRevision"'); old.close();
    assert.equal(inspect(missingColumn).code, "SCHEMA_COLUMN_MISSING");
    const missingTable = join(directory, "missing.db"); createDatabase(missingTable, { withoutMapping: true });
    assert.equal(inspect(missingTable).code, "SCHEMA_TABLE_MISSING");
    const newer = join(directory, "newer.db"); createDatabase(newer, { newer: true });
    assert.equal(inspect(newer).code, "SCHEMA_NEWER_THAN_RUNTIME");
    assert.equal(inspect(join(directory, "none.db")).code, "DATABASE_UNAVAILABLE");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
