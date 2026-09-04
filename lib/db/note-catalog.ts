import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { noteInclude, serializeNoteMetadata } from "@/lib/db/notes";
import { normalizeNoteSearch, type NoteCatalogFilter, type NoteCatalogResult } from "@/lib/note-catalog";

// Identifiers below are server constants, never user SQL. Target ownership is checked even for legacy joins.
const targets = {
  Volume: `SELECT l.noteId, t.id, t.title FROM NoteVolume l JOIN Volume t ON t.id=l.volumeId WHERE t.novelId=?`,
  Chapter: `SELECT l.noteId, t.id, t.title FROM NoteChapter l JOIN Chapter t ON t.id=l.chapterId JOIN Volume v ON v.id=t.volumeId WHERE v.novelId=?`,
  Scene: `SELECT l.noteId, t.id, t.title FROM NoteScene l JOIN Scene t ON t.id=l.sceneId JOIN Chapter c ON c.id=t.chapterId JOIN Volume v ON v.id=c.volumeId WHERE v.novelId=?`,
  Character: `SELECT l.noteId, t.id, t.name title FROM NoteCharacter l JOIN Character t ON t.id=l.characterId WHERE t.novelId=?`,
  Place: `SELECT l.noteId, t.id, t.name title FROM NotePlace l JOIN Location t ON t.id=l.locationId WHERE t.novelId=?`,
  TimelineEvent: `SELECT l.noteId, t.id, t.title FROM NoteTimelineEvent l JOIN TimelineEvent t ON t.id=l.eventId WHERE t.novelId=?`
} as const;

export async function getNoteCatalog(novelId: string, filter: NoteCatalogFilter): Promise<NoteCatalogResult> {
  return prisma.$transaction(async tx => {
    const clauses = [Prisma.sql`n.novelId=${novelId}`];
    if (filter.search) clauses.push(Prisma.sql`instr(n.searchText, ${normalizeNoteSearch(filter.search)}) > 0`);
    if (filter.archived !== "all") clauses.push(filter.archived === "active" ? Prisma.sql`n.archivedAt IS NULL` : Prisma.sql`n.archivedAt IS NOT NULL`);
    if (filter.pinned) clauses.push(Prisma.sql`n.pinned=1`);
    if (filter.status === "open") clauses.push(Prisma.sql`n.workflowStatus IN ('open','in_progress')`);
    if (filter.status === "resolved") clauses.push(Prisma.sql`n.workflowStatus='done'`);
    const tagJoin = Prisma.sql`SELECT 1 FROM NoteTag nt JOIN Tag t ON t.id=nt.tagId WHERE nt.noteId=n.id AND t.novelId=${novelId}`;
    if (filter.tag === "untagged") clauses.push(Prisma.sql`NOT EXISTS (${tagJoin})`);
    else if (filter.tag) clauses.push(Prisma.sql`EXISTS (${tagJoin} AND t.id=${filter.tag})`);
    let entities: { id: string; title: string }[] = [];
    if (filter.entityType) {
      const [prefix] = targets[filter.entityType].split("?");
      const targetQuery = Prisma.sql`${Prisma.raw(prefix)}${novelId}`;
      entities = await tx.$queryRaw<{ id: string; title: string }[]>(Prisma.sql`SELECT DISTINCT target.id, target.title FROM (${targetQuery}) target JOIN Note note ON note.id=target.noteId WHERE note.novelId=${novelId} ORDER BY target.title, target.id`);
      clauses.push(Prisma.sql`EXISTS (SELECT 1 FROM (${targetQuery}) target WHERE target.noteId=n.id ${filter.entity ? Prisma.sql`AND target.id=${filter.entity}` : Prisma.empty})`);
    }
    const where = Prisma.join(clauses, " AND ");
    const [counts] = await tx.$queryRaw<{ total: bigint; matched: bigint; untagged: bigint }[]>(Prisma.sql`SELECT
      (SELECT count(*) FROM Note WHERE novelId=${novelId}) total,
      (SELECT count(*) FROM Note n WHERE ${where}) matched,
      (SELECT count(*) FROM Note n WHERE n.novelId=${novelId} AND NOT EXISTS (${tagJoin})) untagged`);
    const matched = Number(counts.matched), pages = Math.max(1, Math.ceil(matched / 50)), page = Math.min(filter.page, pages);
    const rows = await tx.$queryRaw<{ id: string; snippet: string }[]>(Prisma.sql`SELECT n.id, substr(n.content,1,240) snippet FROM Note n WHERE ${where}
      ORDER BY ${filter.pinnedFirst ? Prisma.sql`n.pinned DESC,` : Prisma.empty} n.updatedAt DESC, n.id ASC LIMIT 50 OFFSET ${(page - 1) * 50}`);
    const metadata = rows.length ? await tx.note.findMany({ where: { novelId, id: { in: rows.map(row => row.id) } }, select: {
      id: true, novelId: true, title: true, pinned: true, workflowStatus: true, archivedAt: true, updatedAt: true, createdAt: true, revision: true, ...noteInclude
    } }) : [];
    const byId = new Map(metadata.map(note => [note.id, serializeNoteMetadata(note)]));
    return { total: Number(counts.total), matched, hasUntagged: Number(counts.untagged) > 0, page, pages, entities, entityType: filter.entityType,
      items: rows.flatMap(row => { const item = byId.get(row.id); return item ? [{ ...item, snippet: row.snippet }] : []; }),
      tags: await tx.tag.findMany({ where: { novelId }, select: { id: true, name: true }, orderBy: [{ key: "asc" }, { id: "asc" }] }) };
  });
}
