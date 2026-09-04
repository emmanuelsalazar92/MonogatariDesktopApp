import Database from "better-sqlite3";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function migrateTimelineLinks(database) {
  return database.transaction(() => {
    database.exec(`CREATE TABLE IF NOT EXISTS TimelineEventCharacter (
      eventId TEXT NOT NULL REFERENCES TimelineEvent(id) ON DELETE CASCADE ON UPDATE CASCADE,
      characterId TEXT NOT NULL REFERENCES Character(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      PRIMARY KEY(eventId, characterId));
      CREATE INDEX IF NOT EXISTS TimelineEventCharacter_characterId_idx ON TimelineEventCharacter(characterId);
      CREATE TABLE IF NOT EXISTS TimelineEventPlace (
      eventId TEXT NOT NULL REFERENCES TimelineEvent(id) ON DELETE CASCADE ON UPDATE CASCADE,
      locationId TEXT NOT NULL REFERENCES Location(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      PRIMARY KEY(eventId, locationId));
      CREATE INDEX IF NOT EXISTS TimelineEventPlace_locationId_idx ON TimelineEventPlace(locationId);
      CREATE TABLE IF NOT EXISTS LocalDataMigration (id TEXT PRIMARY KEY NOT NULL);`);
    const id = "timeline-links-v1";
    if (database.prepare("SELECT id FROM LocalDataMigration WHERE id=?").get(id)) return { characters: 0, places: 0, skipped: 0 };
    const columns = database.prepare("PRAGMA table_info(TimelineEvent)").all().map(c => c.name);
    const characters = new Map(database.prepare("SELECT id, novelId FROM Character").all().map(c => [c.id, c.novelId]));
    const places = new Map(database.prepare("SELECT id, novelId FROM Location").all().map(p => [p.id, p.novelId]));
    const rows = database.prepare(`SELECT id, novelId, ${columns.includes("characterIds") ? "characterIds" : "'[]' AS characterIds"}, ${columns.includes("locationId") ? "locationId" : "NULL AS locationId"} FROM TimelineEvent`).all();
    const addCharacter = database.prepare("INSERT OR IGNORE INTO TimelineEventCharacter(eventId, characterId) VALUES (?, ?)");
    const addPlace = database.prepare("INSERT OR IGNORE INTO TimelineEventPlace(eventId, locationId) VALUES (?, ?)");
    const result = { characters: 0, places: 0, skipped: 0 };
    for (const event of rows) {
      let ids;
      try { ids = JSON.parse(event.characterIds); } catch { ids = []; result.skipped++; }
      if (!Array.isArray(ids)) { ids = []; result.skipped++; }
      for (const characterId of new Set(ids)) {
        if (typeof characterId === "string" && characters.get(characterId) === event.novelId) result.characters += addCharacter.run(event.id, characterId).changes;
        else result.skipped++;
      }
      if (event.locationId) {
        if (places.get(event.locationId) === event.novelId) result.places += addPlace.run(event.id, event.locationId).changes;
        else result.skipped++;
      }
    }
    // Retain ignored legacy columns for recovery, never read them as runtime associations.
    database.prepare("INSERT INTO LocalDataMigration(id) VALUES (?)").run(id);
    return result;
  }).immediate();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const database = new Database(resolve("prisma/dev.db"), { fileMustExist: true });
  try { database.pragma("foreign_keys=ON"); console.log(migrateTimelineLinks(database)); } finally { database.close(); }
}
