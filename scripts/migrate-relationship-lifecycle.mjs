import Database from "better-sqlite3";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
export function migrateRelationshipLifecycle(db) {
  db.transaction(() => {
    const columns = db.prepare('PRAGMA table_info("Relationship")').all().map((column) => column.name);
    if (!columns.includes("id")) throw new Error("Relationship table is missing");
    if (!columns.includes("revision")) db.exec('ALTER TABLE "Relationship" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0');
    if (!columns.includes("archivedAt")) db.exec('ALTER TABLE "Relationship" ADD COLUMN "archivedAt" DATETIME');
  }).immediate();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = new Database(resolve("prisma/dev.db"), { fileMustExist: true });
  try { migrateRelationshipLifecycle(db); console.log("Relationship lifecycle schema ready"); } finally { db.close(); }
}
