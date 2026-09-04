import Database from "better-sqlite3";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function migrateTimelinePosition(database) {
  return database.transaction(() => {
    const columns = database.prepare('PRAGMA table_info("TimelineEvent")').all().map((column) => column.name);
    if (!columns.includes("id")) throw new Error("TimelineEvent table is missing");
    const fresh = !columns.includes("sortIndex");
    for (const [name, definition] of [["sortIndex", "INTEGER NOT NULL DEFAULT 0"], ["chronologyKind", "TEXT NOT NULL DEFAULT 'manual'"], ["relativeDay", "INTEGER"], ["relativeMinute", "INTEGER"], ["positionRevision", "INTEGER NOT NULL DEFAULT 0"]]) {
      if (!columns.includes(name)) database.exec(`ALTER TABLE TimelineEvent ADD COLUMN ${name} ${definition}`);
    }
    let migrated = 0;
    if (fresh) {
      const novels = database.prepare('SELECT DISTINCT novelId FROM TimelineEvent').all();
      const update = database.prepare('UPDATE TimelineEvent SET sortIndex = ? WHERE id = ?');
      for (const { novelId } of novels) {
        // Preserve the former UI ordering ONCE, without parsing dates or changing labels/Structure.
        const rows = database.prepare('SELECT id, internalDate FROM TimelineEvent WHERE novelId = ?').all(novelId).sort((a, b) => {
          if (!a.internalDate !== !b.internalDate) return a.internalDate ? -1 : 1;
          return a.internalDate.localeCompare(b.internalDate, "en", { numeric: true }) || a.id.localeCompare(b.id);
        });
        if (rows.length > 976562) throw new Error("Too many events for chronology migration");
        rows.forEach((row, index) => { update.run((index + 1) * 1024, row.id); migrated++; });
      }
    }
    database.exec('CREATE INDEX IF NOT EXISTS TimelineEvent_novelId_sortIndex_id_idx ON TimelineEvent(novelId, sortIndex, id)');
    return migrated;
  }).immediate();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const database = new Database(resolve("prisma/dev.db"), { fileMustExist: true });
  try { console.log(`Migrated timeline positions: ${migrateTimelinePosition(database)}`); }
  finally { database.close(); }
}
