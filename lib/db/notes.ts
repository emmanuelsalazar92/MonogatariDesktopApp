import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { readNoteInput, type NoteLinkInput } from "@/lib/note-contract";

export class NoteError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}
export const noteInclude = {
  tagLinks: { include: { tag: { select: { id: true, name: true, novelId: true } } }, orderBy: { tagId: "asc" } },
  volumeLinks: { include: { target: { select: { id: true, title: true, archived: true, novelId: true } } }, orderBy: { volumeId: "asc" } },
  chapterLinks: { include: { target: { select: { id: true, title: true, archived: true, volume: { select: { novelId: true } } } } }, orderBy: { chapterId: "asc" } },
  sceneLinks: { include: { target: { select: { id: true, title: true, archived: true, chapter: { select: { volume: { select: { novelId: true } } } } } } }, orderBy: { sceneId: "asc" } },
  characterLinks: { include: { target: { select: { id: true, name: true, archivedAt: true, novelId: true } } }, orderBy: { characterId: "asc" } },
  placeLinks: { include: { target: { select: { id: true, name: true, status: true, novelId: true } } }, orderBy: { locationId: "asc" } },
  eventLinks: { include: { target: { select: { id: true, title: true, archivedAt: true, novelId: true } } }, orderBy: { eventId: "asc" } },
} satisfies Prisma.NoteInclude;
type Row = Prisma.NoteGetPayload<{ include: typeof noteInclude }>;
export function serializeNoteMetadata(note: Omit<Row, "content" | "quotedText" | "searchText" | "linkedType" | "linkedId" | "tags">) {
  const links: { type: NoteLinkInput["type"]; id: string; title: string; archived: boolean }[] = [];
  for (const { target } of note.volumeLinks) if (target.novelId === note.novelId) links.push({ type: "Volume", id: target.id, title: target.title, archived: Boolean(target.archived) });
  for (const { target } of note.chapterLinks) if (target.volume.novelId === note.novelId) links.push({ type: "Chapter", id: target.id, title: target.title, archived: Boolean(target.archived) });
  for (const { target } of note.sceneLinks) if (target.chapter.volume.novelId === note.novelId) links.push({ type: "Scene", id: target.id, title: target.title, archived: Boolean(target.archived) });
  for (const { target } of note.characterLinks) if (target.novelId === note.novelId) links.push({ type: "Character", id: target.id, title: target.name, archived: Boolean(target.archivedAt) });
  for (const { target } of note.placeLinks) if (target.novelId === note.novelId) links.push({ type: "Place", id: target.id, title: target.name, archived: target.status === "archived" });
  for (const { target } of note.eventLinks) if (target.novelId === note.novelId) links.push({ type: "TimelineEvent", id: target.id, title: target.title, archived: Boolean(target.archivedAt) });
  const tags = note.tagLinks.filter(link => link.tag.novelId === note.novelId).map(link => ({ id: link.tag.id, name: link.tag.name }));
  return { id: note.id, novelId: note.novelId, title: note.title, pinned: note.pinned, workflowStatus: note.workflowStatus,
    archivedAt: note.archivedAt?.toISOString() ?? null, createdAt: note.createdAt.toISOString(), updatedAt: note.updatedAt.toISOString(), revision: note.revision,
    links, tags: tags.map(tag => tag.name), tagSummaries: tags,
    // Compatibility projection for the current Notes screen; never persisted as truth.
    linkedType: links[0]?.type ?? "Novel", linkedId: links[0]?.id ?? note.novelId };
}
export function serializeCanonicalNote(note: Row) { return { ...serializeNoteMetadata(note), content: note.content, quotedText: note.quotedText }; }
export async function listNotes(novelId?: string) {
  return (await prisma.note.findMany({ where: novelId ? { novelId } : {}, include: noteInclude, orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }, { id: "asc" }] })).map(serializeCanonicalNote);
}
export async function getNote(novelId: string, id: string) {
  const note = await prisma.note.findFirst({ where: { id, novelId }, include: noteInclude });
  return note ? serializeCanonicalNote(note) : null;
}
export async function noteBelongsToNovelForRoute(novelId: string, id: string) {
  return Boolean(await prisma.note.findFirst({ where: { id, novelId }, select: { id: true } }));
}

export async function getSceneAnnotationSummaries(novelId: string, sceneId: string) {
  return prisma.$transaction(async tx => {
    const scene = await tx.scene.findFirst({ where: { id: sceneId, chapter: { volume: { novelId } } }, select: { id: true } });
    if (!scene) throw new NoteError("Scene unavailable", 404);
    const notes = await tx.note.findMany({ where: { novelId, archivedAt: null, quotedText: { not: "" }, sceneLinks: { some: { sceneId } } },
      select: { id: true, title: true, quotedText: true, workflowStatus: true }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 101 });
    const truncated = notes.length > 100;
    return { truncated, items: notes.slice(0, 100).map(note => ({ id: note.id, title: note.title,
      quotedText: note.quotedText.slice(0, 10_000), matchable: note.quotedText.length <= 10_000, workflowStatus: note.workflowStatus })) };
  });
}

export async function writeNote(novelId: string, value: unknown, noteId?: string, revision?: number) {
  const input = readNoteInput(value, novelId, Boolean(noteId));
  if (!input) throw new NoteError("Invalid Note fields, tags or links");
  if (noteId && (!Number.isSafeInteger(revision) || revision! < 0)) throw new NoteError("Current revision is required");
  return prisma.$transaction(async tx => {
    if (!(await tx.novel.updateMany({ where: { id: novelId }, data: { updatedAt: new Date() } })).count) throw new NoteError("Novel unavailable", 404);
    const id = noteId ?? `note-${randomUUID()}`;
    const previous = noteId ? await tx.note.findFirst({ where: { id, novelId, revision }, select: { title: true, content: true, quotedText: true, workflowStatus: true } }) : null;
    if (noteId && !previous) throw new NoteError("Note changed or is unavailable", 409);
    const { links, tags, ...metadata } = input;
    if (previous && Object.keys(input).length === 1 && input.workflowStatus === previous.workflowStatus) {
      return serializeCanonicalNote(await tx.note.findUniqueOrThrow({ where: { id }, include: noteInclude }));
    }
    if (links) {
      const volumeIds = links.filter(link => link.type === "Volume").map(link => link.id);
      if (await tx.volume.count({ where: { id: { in: volumeIds }, novelId } }) !== volumeIds.length) throw new NoteError("All linked targets must belong to this novel", 409);
      const chapterIds = links.filter(link => link.type === "Chapter").map(link => link.id);
      if (await tx.chapter.count({ where: { id: { in: chapterIds }, volume: { novelId } } }) !== chapterIds.length) throw new NoteError("All linked targets must belong to this novel", 409);
      const sceneIds = links.filter(link => link.type === "Scene").map(link => link.id);
      if (await tx.scene.count({ where: { id: { in: sceneIds }, chapter: { volume: { novelId } } } }) !== sceneIds.length) throw new NoteError("All linked targets must belong to this novel", 409);
      const characterIds = links.filter(link => link.type === "Character").map(link => link.id);
      if (await tx.character.count({ where: { id: { in: characterIds }, novelId } }) !== characterIds.length) throw new NoteError("All linked targets must belong to this novel", 409);
      const placeIds = links.filter(link => link.type === "Place").map(link => link.id);
      if (await tx.location.count({ where: { id: { in: placeIds }, novelId } }) !== placeIds.length) throw new NoteError("All linked targets must belong to this novel", 409);
      const eventIds = links.filter(link => link.type === "TimelineEvent").map(link => link.id);
      if (await tx.timelineEvent.count({ where: { id: { in: eventIds }, novelId } }) !== eventIds.length) throw new NoteError("All linked targets must belong to this novel", 409);
    }
    const effectiveQuote = metadata.quotedText ?? previous?.quotedText ?? "";
    if (effectiveQuote) {
      const hasScene = links ? links.some(link => link.type === "Scene") : Boolean(noteId && await tx.noteScene.count({ where: { noteId: id } }));
      if (!hasScene) throw new NoteError("Quoted Scene context requires a linked Scene", 409);
    }
    const searchText = `${metadata.title ?? previous?.title ?? ""}\n${metadata.content ?? previous?.content ?? ""}`.normalize("NFC").toLowerCase();
    if (noteId) await tx.note.update({ where: { id }, data: { ...metadata, searchText, revision: { increment: 1 } } });
    // Explicit default also supports existing SQLite databases whose legacy default is open.
    else await tx.note.create({ data: { ...metadata, workflowStatus: metadata.workflowStatus ?? "informational", searchText, id, novelId, title: input.title!, createdAt: new Date(), linkedType: "Novel", linkedId: novelId, tags: "[]" } });
    if (links) {
      await tx.noteVolume.deleteMany({ where: { noteId: id } });
      const volumeData = links.filter(link => link.type === "Volume").map(link => ({ noteId: id, volumeId: link.id }));
      if (volumeData.length) await tx.noteVolume.createMany({ data: volumeData });
      await tx.noteChapter.deleteMany({ where: { noteId: id } });
      const chapterData = links.filter(link => link.type === "Chapter").map(link => ({ noteId: id, chapterId: link.id }));
      if (chapterData.length) await tx.noteChapter.createMany({ data: chapterData });
      await tx.noteScene.deleteMany({ where: { noteId: id } });
      const sceneData = links.filter(link => link.type === "Scene").map(link => ({ noteId: id, sceneId: link.id }));
      if (sceneData.length) await tx.noteScene.createMany({ data: sceneData });
      await tx.noteCharacter.deleteMany({ where: { noteId: id } });
      const characterData = links.filter(link => link.type === "Character").map(link => ({ noteId: id, characterId: link.id }));
      if (characterData.length) await tx.noteCharacter.createMany({ data: characterData });
      await tx.notePlace.deleteMany({ where: { noteId: id } });
      const placeData = links.filter(link => link.type === "Place").map(link => ({ noteId: id, locationId: link.id }));
      if (placeData.length) await tx.notePlace.createMany({ data: placeData });
      await tx.noteTimelineEvent.deleteMany({ where: { noteId: id } });
      const eventData = links.filter(link => link.type === "TimelineEvent").map(link => ({ noteId: id, eventId: link.id }));
      if (eventData.length) await tx.noteTimelineEvent.createMany({ data: eventData });
    }
    if (tags) {
      await tx.noteTag.deleteMany({ where: { noteId: id } });
      for (const name of tags) {
        const key = name.toLowerCase();
        const tag = await tx.tag.upsert({ where: { novelId_key: { novelId, key } }, update: {}, create: { id: `tag-${randomUUID()}`, novelId, name, key } });
        await tx.noteTag.create({ data: { noteId: id, tagId: tag.id } });
      }
    }
    return serializeCanonicalNote(await tx.note.findUniqueOrThrow({ where: { id }, include: noteInclude }));
  });
}
export async function deleteNote(novelId: string, id: string, revision: number) {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new NoteError("Current revision is required");
  return prisma.$transaction(async tx => {
    if (!(await tx.novel.updateMany({ where: { id: novelId }, data: { updatedAt: new Date() } })).count) throw new NoteError("Novel unavailable", 404);
    const result = await tx.note.deleteMany({ where: { id, novelId, revision } });
    if (!result.count) throw new NoteError("Note changed or is unavailable", 409);
    // Only Note's own joins cascade. All targets and shared Tags remain intact.
    return { id };
  });
}
