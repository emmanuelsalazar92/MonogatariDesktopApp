import Database from "better-sqlite3";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
export function migrateTimelineLifecycle(db) {
  db.transaction(() => {
    const columns = db.prepare('PRAGMA table_info("TimelineEvent")').all().map(column => column.name);
    if (!columns.includes("id")) throw new Error("TimelineEvent table is missing");
    if (!columns.includes("archivedAt")) db.exec('ALTER TABLE "TimelineEvent" ADD COLUMN "archivedAt" DATETIME');
  }).immediate();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = new Database(resolve("prisma/dev.db"), { fileMustExist: true });
  try { migrateTimelineLifecycle(db); console.log("Timeline lifecycle schema ready"); } finally { db.close(); }
}
