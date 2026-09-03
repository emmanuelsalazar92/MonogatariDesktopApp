import Database from "better-sqlite3";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import createJiti from "jiti";
import { migratePlaceMetadata } from "./migrate-place-metadata.mjs";

const { legacyPlaceTypes, legacyPlaceStatuses } = createJiti(import.meta.url)("../lib/place-classification.ts");

export function migratePlaceClassification(database) {
  return database.transaction(() => {
    migratePlaceMetadata(database);
    const rows = database.prepare('SELECT id, type, status FROM "Location"').all();
    const update = database.prepare('UPDATE "Location" SET type = ?, status = ?, revision = revision + 1 WHERE id = ?');
    let changed = 0;
    for (const row of rows) {
      // Unknown values stay intact on disk; serializers provide controlled fallbacks.
      const type = Object.hasOwn(legacyPlaceTypes, row.type) ? legacyPlaceTypes[row.type] : row.type;
      const status = Object.hasOwn(legacyPlaceStatuses, row.status) ? legacyPlaceStatuses[row.status] : row.status;
      if (type !== row.type || status !== row.status) changed += update.run(type, status, row.id).changes;
    }
    return changed;
  })();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const database = new Database(resolve("prisma/dev.db"), { fileMustExist: true });
  try {
    database.pragma("foreign_keys = ON");
    console.log(`Updated Place classifications: ${migratePlaceClassification(database)}`);
  } finally { database.close(); }
}
