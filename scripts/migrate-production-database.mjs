import Database from "better-sqlite3";
import { resolve } from "node:path";

const migrations = [
  {
    id: "2026-09-08-notion-mapping-scene-cursors",
    apply(db) {
      const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'NotionMapping'").get();
      if (!exists) return;
      const columns = new Set(db.prepare('PRAGMA table_info("NotionMapping")').all().map((column) => column.name));
      const additions = [
        ["lastSyncedRevision", "INTEGER NOT NULL DEFAULT -1"],
        ["lastSyncedContent", "TEXT NOT NULL DEFAULT ''"],
        ["lastSyncedAt", "DATETIME"],
        ["remoteLastEditedAt", "DATETIME"],
        ["remoteArchivedAt", "DATETIME"]
      ];
      for (const [name, definition] of additions) {
        if (!columns.has(name)) db.exec(`ALTER TABLE "NotionMapping" ADD COLUMN "${name}" ${definition}`);
      }
    }
  }
];

export function migrateProductionDatabase(databasePath) {
  const db = new Database(resolve(databasePath), { fileMustExist: true });
  try {
    db.pragma("foreign_keys = ON");
    db.exec(`CREATE TABLE IF NOT EXISTS "SchemaMigration" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const applied = db.prepare('SELECT 1 FROM "SchemaMigration" WHERE id = ?');
    const record = db.prepare('INSERT OR IGNORE INTO "SchemaMigration" (id) VALUES (?)');
    for (const migration of migrations) {
      db.transaction(() => {
        // Run the idempotent schema assertion even when the marker exists: a
        // manually restored partial database must never start incompatibly.
        migration.apply(db);
        if (!applied.get(migration.id)) record.run(migration.id);
      })();
    }
    const integrity = db.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") throw new Error(`SQLite integrity check failed: ${integrity}`);
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const databasePath = process.argv[2];
  if (!databasePath) throw new Error("Usage: node scripts/migrate-production-database.mjs /path/to/dev.db");
  migrateProductionDatabase(databasePath);
  console.log("Monogatari database schema is ready.");
}
