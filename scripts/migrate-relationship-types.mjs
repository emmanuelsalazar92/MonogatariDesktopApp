import Database from "better-sqlite3";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import createJiti from "jiti";

const { getStoredRelationshipDefinition, canonicalRelationship, relationshipIdentity } = createJiti(import.meta.url)("../lib/character-relationship.ts");

// Never merge/delete narrative records or rewrite their IDs/notes. Unknown,
// invalid and logically duplicate legacy groups remain intact for manual review.
export function migrateRelationshipTypes(database) {
  return database.transaction(() => {
    const rows = database.prepare(`SELECT r.id, r.novelId, r.fromCharacterId, r.toCharacterId,
      r.relationshipType, r.category, r.direction, a.novelId AS fromNovelId, b.novelId AS toNovelId
      FROM Relationship r LEFT JOIN Character a ON a.id = r.fromCharacterId
      LEFT JOIN Character b ON b.id = r.toCharacterId ORDER BY r.id`).all();
    const result = { updated: 0, unknown: 0, invalid: 0, conflicts: 0 };
    const groups = new Map();
    for (const row of rows) {
      const definition = getStoredRelationshipDefinition(row.relationshipType);
      if (!definition) { result.unknown++; continue; }
      if (row.fromCharacterId === row.toCharacterId || row.fromNovelId !== row.novelId || row.toNovelId !== row.novelId) { result.invalid++; continue; }
      const canonical = canonicalRelationship(row.fromCharacterId, row.toCharacterId, row.relationshipType);
      const identity = relationshipIdentity(row.novelId, row.fromCharacterId, row.toCharacterId, row.relationshipType);
      const group = groups.get(identity) ?? [];
      group.push({ row, canonical, definition });
      groups.set(identity, group);
    }
    const update = database.prepare("UPDATE Relationship SET relationshipType = ?, category = ?, direction = ?, fromCharacterId = ?, toCharacterId = ? WHERE id = ?");
    for (const group of groups.values()) {
      if (group.length > 1) { result.conflicts++; continue; }
      const { row, canonical, definition } = group[0];
      if (row.relationshipType === canonical.relationshipType && row.category === definition.category && row.direction === definition.direction
        && row.fromCharacterId === canonical.fromCharacterId && row.toCharacterId === canonical.toCharacterId) continue;
      result.updated += update.run(canonical.relationshipType, definition.category, definition.direction, canonical.fromCharacterId, canonical.toCharacterId, row.id).changes;
    }
    return result;
  }).immediate();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const database = new Database(resolve("prisma/dev.db"), { fileMustExist: true });
  try {
    database.pragma("foreign_keys = ON");
    console.log("Relationship type migration:", migrateRelationshipTypes(database));
  } finally { database.close(); }
}
