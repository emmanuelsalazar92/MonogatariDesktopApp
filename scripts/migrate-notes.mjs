import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const targets = [
  ["Volume", "Volume", "volumeId", "SELECT id, novelId FROM Volume"],
  ["Chapter", "Chapter", "chapterId", "SELECT c.id, v.novelId FROM Chapter c JOIN Volume v ON v.id=c.volumeId"],
  ["Scene", "Scene", "sceneId", "SELECT s.id, v.novelId FROM Scene s JOIN Chapter c ON c.id=s.chapterId JOIN Volume v ON v.id=c.volumeId"],
  ["Character", "Character", "characterId", "SELECT id, novelId FROM Character"],
  ["Place", "Location", "locationId", "SELECT id, novelId FROM Location"],
  ["TimelineEvent", "TimelineEvent", "eventId", "SELECT id, novelId FROM TimelineEvent"]
];
export function migrateNotes(db) {
  return db.transaction(() => {
    const columns = db.prepare('PRAGMA table_info("Note")').all().map(c => c.name);
    if (!columns.includes("id")) throw new Error("Note table is missing");
    for (const [name, definition] of [["pinned", "BOOLEAN NOT NULL DEFAULT false"], ["workflowStatus", "TEXT NOT NULL DEFAULT 'open'"], ["archivedAt", "DATETIME"], ["createdAt", "DATETIME NOT NULL DEFAULT 0"], ["revision", "INTEGER NOT NULL DEFAULT 0"]]) {
      if (!columns.includes(name)) db.exec(`ALTER TABLE Note ADD COLUMN ${name} ${definition}`);
    }
    if (!columns.includes("createdAt")) db.exec("UPDATE Note SET createdAt=updatedAt");
    db.exec("CREATE TABLE IF NOT EXISTS LocalDataMigration(id TEXT PRIMARY KEY NOT NULL)");
    if (!columns.includes("searchText")) db.exec("ALTER TABLE Note ADD COLUMN searchText TEXT NOT NULL DEFAULT ''");
    if (!columns.includes("quotedText")) db.exec("ALTER TABLE Note ADD COLUMN quotedText TEXT NOT NULL DEFAULT ''");
    if (!db.prepare("SELECT id FROM LocalDataMigration WHERE id='notes-search-v1'").get()) {
      const rows = db.prepare(`SELECT id, ${columns.includes("title") ? "title" : "'' AS title"}, content FROM Note`).all();
      const update = db.prepare("UPDATE Note SET searchText=? WHERE id=?");
      for (const row of rows) update.run(`${row.title}\n${row.content}`.normalize("NFC").toLowerCase(), row.id);
      db.prepare("INSERT INTO LocalDataMigration(id) VALUES ('notes-search-v1')").run();
    }
    db.exec(`CREATE INDEX IF NOT EXISTS Note_novelId_archivedAt_updatedAt_id_idx ON Note(novelId,archivedAt,updatedAt,id);
      CREATE INDEX IF NOT EXISTS Note_novelId_workflowStatus_updatedAt_idx ON Note(novelId,workflowStatus,updatedAt);
      CREATE INDEX IF NOT EXISTS Note_novelId_pinned_updatedAt_idx ON Note(novelId,pinned,updatedAt);`);
    db.exec(`CREATE TABLE IF NOT EXISTS Tag(id TEXT PRIMARY KEY NOT NULL, novelId TEXT NOT NULL REFERENCES Novel(id) ON DELETE CASCADE ON UPDATE CASCADE, name TEXT NOT NULL, key TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS Tag_novelId_key_key ON Tag(novelId,key);
      CREATE TABLE IF NOT EXISTS NoteTag(noteId TEXT NOT NULL REFERENCES Note(id) ON DELETE CASCADE ON UPDATE CASCADE, tagId TEXT NOT NULL REFERENCES Tag(id) ON DELETE RESTRICT ON UPDATE CASCADE, PRIMARY KEY(noteId,tagId));
      CREATE INDEX IF NOT EXISTS NoteTag_tagId_idx ON NoteTag(tagId);`);
    for (const [type, table, field] of targets) db.exec(`CREATE TABLE IF NOT EXISTS Note${type}(noteId TEXT NOT NULL REFERENCES Note(id) ON DELETE CASCADE ON UPDATE CASCADE, ${field} TEXT NOT NULL REFERENCES ${table}(id) ON DELETE RESTRICT ON UPDATE CASCADE, PRIMARY KEY(noteId,${field}));
      CREATE INDEX IF NOT EXISTS Note${type}_${field}_idx ON Note${type}(${field});`);
    if (db.prepare("SELECT id FROM LocalDataMigration WHERE id='notes-v1'").get()) return { links: 0, tags: 0, skipped: 0 };
    const maps = new Map(targets.map(([type, table, , sql]) => [type, db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table) ? new Map(db.prepare(sql).all().map(row => [row.id, row.novelId])) : new Map()]));
    const result = { links: 0, tags: 0, skipped: 0 };
    for (const note of db.prepare("SELECT id, novelId, linkedType, linkedId, tags FROM Note").all()) {
      if (note.linkedType !== "Novel") {
        const config = targets.find(([type]) => type === note.linkedType);
        if (config && maps.get(note.linkedType).get(note.linkedId) === note.novelId) result.links += db.prepare(`INSERT OR IGNORE INTO Note${config[0]}(noteId,${config[2]}) VALUES (?,?)`).run(note.id, note.linkedId).changes;
        else result.skipped++;
      } else if (note.linkedId !== note.novelId) result.skipped++;
      let tags;
      try { tags = JSON.parse(note.tags); } catch { tags = []; result.skipped++; }
      if (!Array.isArray(tags)) { tags = []; result.skipped++; }
      for (const raw of tags) {
        if (typeof raw !== "string" || !raw.trim() || raw.length > 50) { result.skipped++; continue; }
        const name = raw.trim(), key = name.toLowerCase();
        let tag = db.prepare("SELECT id FROM Tag WHERE novelId=? AND key=?").get(note.novelId, key);
        if (!tag) { tag = { id: `tag-${randomUUID()}` }; db.prepare("INSERT INTO Tag(id,novelId,name,key) VALUES (?,?,?,?)").run(tag.id, note.novelId, name, key); }
        result.tags += db.prepare("INSERT OR IGNORE INTO NoteTag(noteId,tagId) VALUES (?,?)").run(note.id, tag.id).changes;
      }
    }
    db.prepare("INSERT INTO LocalDataMigration(id) VALUES ('notes-v1')").run();
    return result;
  }).immediate();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = new Database(resolve("prisma/dev.db"), { fileMustExist: true });
  try { db.pragma("foreign_keys=ON"); console.log(migrateNotes(db)); } finally { db.close(); }
}
