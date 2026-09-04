import Database from "better-sqlite3";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function migrateRelationshipSince(database) {
  return database.transaction(() => {
    const columns = database.prepare('PRAGMA table_info("Relationship")').all().map((column) => column.name);
    if (!columns.includes("id")) throw new Error("Relationship table is missing");
    if (!columns.includes("sinceKind")) database.exec("ALTER TABLE Relationship ADD COLUMN sinceKind TEXT NOT NULL DEFAULT 'unknown'");
    if (!columns.includes("sinceTargetId")) database.exec("ALTER TABLE Relationship ADD COLUMN sinceTargetId TEXT");
    // Do not guess Structure IDs from ambiguous historical titles such as Chapter 1.
    return database.prepare(`UPDATE Relationship SET sinceKind = CASE WHEN lower(trim(since)) = 'before story' THEN 'before_story' ELSE 'custom' END,
      since = CASE WHEN lower(trim(since)) = 'before story' THEN '' ELSE since END
      WHERE sinceKind = 'unknown' AND sinceTargetId IS NULL AND trim(since) <> ''`).run().changes;
  }).immediate();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const database = new Database(resolve("prisma/dev.db"), { fileMustExist: true });
  try { console.log(`Migrated relationship Since values: ${migrateRelationshipSince(database)}`); }
  finally { database.close(); }
}
