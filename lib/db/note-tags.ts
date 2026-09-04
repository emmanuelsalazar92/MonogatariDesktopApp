import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { NoteError } from "@/lib/db/notes";

export async function mutateNoteTag(novelId: string, method: "POST" | "PATCH" | "DELETE", value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new NoteError("Invalid tag fields");
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !["novelId", "id", "name", "expectedName", "confirmed"].includes(key))) throw new NoteError("Invalid tag fields");
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (method !== "DELETE" && (!name || name.length > 50)) throw new NoteError("Tag name must contain 1–50 characters");
  if (method !== "POST" && (typeof body.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(body.id) || typeof body.expectedName !== "string")) throw new NoteError("Tag ID and current name are required");
  if (method === "DELETE" && body.confirmed !== true) throw new NoteError("Confirm removing this tag from all notes");
  return prisma.$transaction(async tx => {
    if (!(await tx.novel.updateMany({ where: { id: novelId }, data: { updatedAt: new Date() } })).count) throw new NoteError("Novel unavailable", 404);
    const existing = method === "POST" ? null : await tx.tag.findFirst({ where: { id: body.id as string, novelId, name: body.expectedName as string } });
    if (method !== "POST" && !existing) throw new NoteError("Tag changed or is unavailable. Refresh and retry.", 409);
    if (method === "POST") return tx.tag.upsert({ where: { novelId_key: { novelId, key: name.toLowerCase() } }, update: {}, create: { id: `tag-${randomUUID()}`, novelId, name, key: name.toLowerCase() }, select: { id: true, name: true } });
    if (method === "PATCH" && await tx.tag.findFirst({ where: { novelId, key: name.toLowerCase(), id: { not: existing!.id } }, select: { id: true } })) throw new NoteError("A tag with this name already exists", 409);
    // Invalidate open Note editors so an old draft cannot silently resurrect a removed/renamed tag.
    await tx.note.updateMany({ where: { novelId, tagLinks: { some: { tagId: existing!.id } } }, data: { revision: { increment: 1 }, updatedAt: new Date() } });
    if (method === "PATCH") return tx.tag.update({ where: { id: existing!.id }, data: { name, key: name.toLowerCase() }, select: { id: true, name: true } });
    await tx.noteTag.deleteMany({ where: { tagId: existing!.id } });
    await tx.tag.delete({ where: { id: existing!.id } });
    return { id: existing!.id };
  });
}
