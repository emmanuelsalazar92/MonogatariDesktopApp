import Database from "better-sqlite3";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Additive upgrade for existing local databases; never rebuilds tables or drops legacy fields.
export function migratePlaceMetadata(database) {
  const columns = new Set(database.prepare('PRAGMA table_info("Location")').all().map((column) => column.name));
  if (!columns.has("id")) throw new Error("Location table is missing. Initialize the database schema first.");
  const additions = {
    status: 'TEXT NOT NULL DEFAULT \'active\'',
    atmosphere: 'TEXT NOT NULL DEFAULT \'\'',
    revision: 'INTEGER NOT NULL DEFAULT 0',
    parentPlaceId: 'TEXT REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE'
  };
  return database.transaction(() => {
    const added = [];
    for (const [name, definition] of Object.entries(additions)) {
      if (columns.has(name)) continue;
      database.exec(`ALTER TABLE "Location" ADD COLUMN "${name}" ${definition}`);
      added.push(name);
    }
    database.exec('CREATE INDEX IF NOT EXISTS "Location_parentPlaceId_idx" ON "Location"("parentPlaceId")');
    return added;
  })();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const database = new Database(resolve("prisma/dev.db"), { fileMustExist: true });
  try {
    database.pragma("foreign_keys = ON");
    const added = migratePlaceMetadata(database);
    console.log(added.length ? `Added Location columns: ${added.join(", ")}` : "Place metadata schema is already current.");
  } finally { database.close(); }
}
