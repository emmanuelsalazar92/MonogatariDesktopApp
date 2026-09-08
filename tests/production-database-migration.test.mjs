import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateProductionDatabase } from "../scripts/migrate-production-database.mjs";

test("production upgrade preserves a legacy Notion mapping and is safe to rerun", async () => {
  const directory = await mkdtemp(join(tmpdir(), "monogatari-upgrade-"));
  const databasePath = join(directory, "dev.db");
  try {
    const old = new Database(databasePath);
    old.exec(`CREATE TABLE "NotionMapping" (
      "localId" TEXT NOT NULL PRIMARY KEY,
      "entityType" TEXT NOT NULL,
      "novelId" TEXT NOT NULL,
      "notionPageId" TEXT NOT NULL UNIQUE,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    old.prepare('INSERT INTO "NotionMapping" (localId, entityType, novelId, notionPageId) VALUES (?, ?, ?, ?)')
      .run("scene-1", "scene", "novel-1", "notion-page-1");
    assert.throws(
      () => old.prepare('SELECT "lastSyncedRevision" FROM "NotionMapping"').all(),
      /no such column/
    );
    old.close();

    migrateProductionDatabase(databasePath);
    migrateProductionDatabase(databasePath);

    const upgraded = new Database(databasePath, { readonly: true });
    const mapping = upgraded.prepare(`SELECT localId, entityType, novelId, notionPageId,
      lastSyncedRevision, lastSyncedContent, lastSyncedAt, remoteLastEditedAt, remoteArchivedAt
      FROM "NotionMapping" WHERE localId = ?`).get("scene-1");
    assert.deepEqual(mapping, {
      localId: "scene-1",
      entityType: "scene",
      novelId: "novel-1",
      notionPageId: "notion-page-1",
      lastSyncedRevision: -1,
      lastSyncedContent: "",
      lastSyncedAt: null,
      remoteLastEditedAt: null,
      remoteArchivedAt: null
    });
    assert.equal(upgraded.prepare('SELECT COUNT(*) AS count FROM "SchemaMigration"').get().count, 1);
    upgraded.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
