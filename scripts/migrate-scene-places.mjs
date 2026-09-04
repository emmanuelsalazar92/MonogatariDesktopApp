import Database from "better-sqlite3";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function migrateScenePlaces(database) {
  return database.transaction(() => {
    database.exec(`CREATE TABLE IF NOT EXISTS "ScenePlace" (
      "sceneId" TEXT NOT NULL REFERENCES "Scene"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "locationId" TEXT NOT NULL REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      PRIMARY KEY ("sceneId", "locationId"));
      CREATE INDEX IF NOT EXISTS "ScenePlace_locationId_idx" ON "ScenePlace"("locationId");
      CREATE TABLE IF NOT EXISTS "LocalDataMigration" ("id" TEXT PRIMARY KEY NOT NULL);`);
    const id = "scene-place-v1";
    if (database.prepare('SELECT id FROM LocalDataMigration WHERE id = ?').get(id)) return 0;
    const hasLegacy = database.prepare('PRAGMA table_info("Scene")').all().some((column) => column.name === "locationId");
    const inserted = hasLegacy ? database.prepare(`INSERT OR IGNORE INTO ScenePlace (sceneId, locationId)
      SELECT s.id, p.id FROM Scene s JOIN Chapter c ON c.id = s.chapterId JOIN Volume v ON v.id = c.volumeId
      JOIN Location p ON p.id = s.locationId AND p.novelId = v.novelId`).run().changes : 0;
    database.prepare('INSERT INTO LocalDataMigration (id) VALUES (?)').run(id);
    return inserted;
  })();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const database = new Database(resolve("prisma/dev.db"), { fileMustExist: true });
  try { database.pragma("foreign_keys = ON"); console.log(`Migrated Scene–Place links: ${migrateScenePlaces(database)}`); }
  finally { database.close(); }
}
