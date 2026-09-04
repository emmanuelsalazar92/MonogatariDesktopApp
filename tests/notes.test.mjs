import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import createJiti from "jiti";
import Database from "better-sqlite3";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { migrateNotes } from "../scripts/migrate-notes.mjs";
const require = createRequire(import.meta.url);
async function load(path, deps = {}) {
  const exports = {}, source = await readFile(resolve(path), "utf8");
  new Function("require", "exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(id => { if (!(id in deps)) throw new Error(id); return deps[id]; }, exports);
  return exports;
}
const contract = await load("lib/note-contract.ts");
test("Note input validates metadata, separates tags/links, translates legacy and preserves omissions", () => {
  assert.equal(contract.readNoteInput({ title: "  " }, "a"), null);
  for (const input of [{ title: "N", pinned: "true" }, { title: "N", workflowStatus: "anything" }, { title: "N", tags: [3] }, { title: "N", links: [{ type: "Tag", id: "x" }] }, { title: "N", links: [{ type: "Scene", id: "../x" }] }, { title: "N", id: "client" }]) assert.equal(contract.readNoteInput(input, "a"), null);
  assert.deepEqual(contract.readNoteInput({ content: "updated" }, "a", true), { content: "updated" });
  assert.deepEqual(contract.readNoteInput({ quotedText: "Akira abrió la puerta" }, "a", true), { quotedText: "Akira abrió la puerta" });
  assert.equal(contract.readNoteInput({ title: "N", quotedText: "x".repeat(100001) }, "a"), null);
  assert.deepEqual(contract.readNoteInput({ title: " N ", tags: ["Tag", " tag "], links: [{ type: "Character", id: "x" }, { type: "Character", id: "x" }] }, "a"), { title: "N", tags: ["tag"], links: [{ type: "Character", id: "x" }] });
  assert.deepEqual(contract.readNoteInput({ title: "N", linkedType: "Scene", linkedId: "s" }, "a").links, [{ type: "Scene", id: "s" }]);
});
test("Notes migration copies safe legacy associations/tags once and preserves recovery data", () => {
  const db = new Database(":memory:");
  try {
    db.exec("CREATE TABLE Novel(id TEXT PRIMARY KEY); INSERT INTO Novel VALUES ('a'),('b'); CREATE TABLE Character(id TEXT PRIMARY KEY,novelId TEXT); INSERT INTO Character VALUES ('x','a'),('foreign','b'); CREATE TABLE Note(id TEXT PRIMARY KEY,novelId TEXT,linkedType TEXT,linkedId TEXT,tags TEXT,updatedAt DATETIME,content TEXT); INSERT INTO Note VALUES ('n','a','Character','x','[\"Tag\",\"tag\"]',123456,'private'),('bad','a','Character','foreign','invalid',123456,'preserve');");
    assert.deepEqual(migrateNotes(db), { links: 1, tags: 1, skipped: 2 });
    assert.equal(db.prepare("SELECT content FROM Note WHERE id='bad'").get().content, "preserve");
    assert.equal(db.prepare("SELECT createdAt FROM Note WHERE id='n'").get().createdAt, 123456);
    assert.equal(db.prepare("SELECT searchText FROM Note WHERE id='n'").get().searchText, "\nprivate");
    assert.equal(db.prepare("SELECT quotedText FROM Note WHERE id='n'").get().quotedText, "");
    assert.ok(db.prepare("PRAGMA index_list(Note)").all().some(index => index.name === "Note_novelId_archivedAt_updatedAt_id_idx"));
    db.exec("DELETE FROM NoteCharacter; DELETE FROM NoteTag");
    assert.deepEqual(migrateNotes(db), { links: 0, tags: 0, skipped: 0 });
    assert.equal(db.prepare("SELECT count(*) n FROM NoteCharacter").get().n, 0);
  } finally { db.close(); }
});
test("Migration failure rolls back added fields, joins, tags and completion marker", () => {
  const db = new Database(":memory:");
  try {
    db.exec("CREATE TABLE Novel(id TEXT PRIMARY KEY); INSERT INTO Novel VALUES ('a'); CREATE TABLE Character(id TEXT PRIMARY KEY,novelId TEXT); INSERT INTO Character VALUES ('x','a'); CREATE TABLE Note(id TEXT PRIMARY KEY,novelId TEXT,linkedType TEXT,linkedId TEXT,tags TEXT,updatedAt DATETIME,content TEXT); INSERT INTO Note VALUES ('n','a','Character','x','[]',123456,''); CREATE TABLE NoteCharacter(noteId TEXT,characterId TEXT); CREATE TRIGGER deny_link BEFORE INSERT ON NoteCharacter BEGIN SELECT RAISE(ABORT,'test failure'); END;");
    assert.throws(() => migrateNotes(db), /test failure/);
    assert.equal(db.prepare("PRAGMA table_info(Note)").all().some(c => c.name === "createdAt"), false);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='Tag'").get(), undefined);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='LocalDataMigration'").get(), undefined);
  } finally { db.close(); }
});
test("Notes API supports transactional typed links, ownership, live summaries, revisions and safe deletion", async t => {
  const directory = await mkdtemp(join(tmpdir(), "monogatari-notes-")), path = join(directory, "test.db");
  let prisma;
  t.after(async () => { await prisma?.$disconnect(); await rm(directory, { recursive: true, force: true }); });
  const sql = execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "diff", "--from-empty", "--to-schema", resolve("prisma/schema.prisma"), "--script"], { encoding: "utf8", maxBuffer: 3 * 1024 * 1024, windowsHide: true });
  const database = new Database(path); database.exec(sql); database.close();
  const { PrismaClient, Prisma } = createJiti(import.meta.url)(resolve("lib/generated/prisma/client.ts"));
  const queries = [];
  prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: path }), log: [{ emit: "event", level: "query" }] });
  prisma.$on("query", event => queries.push(event.query));
  const repo = await load("lib/db/notes.ts", { "node:crypto": require("node:crypto"), "@/lib/db/prisma": { prisma }, "@/lib/note-contract": contract });
  const filters = await load("lib/note-catalog.ts", { "./note-contract": contract });
  const catalog = await load("lib/db/note-catalog.ts", { "@/lib/db/prisma": { prisma }, "@/lib/generated/prisma/client": { Prisma }, "@/lib/db/notes": repo, "@/lib/note-catalog": filters });
  const tags = await load("lib/db/note-tags.ts", { "node:crypto": require("node:crypto"), "@/lib/db/prisma": { prisma }, "@/lib/db/notes": repo });
  const routes = await load("lib/studio-routes.ts"), security = await load("lib/request-security.ts"), scope = await load("lib/place-request.ts", { "@/lib/studio-routes": routes });
  const errors = await load("app/api/notes/errors.ts", { "next/server": require("next/server"), "@/lib/db/notes": repo });
  const deps = { "next/server": require("next/server"), "@/lib/db/notes": repo, "@/lib/db/note-catalog": catalog, "@/lib/db/note-tags": tags, "@/lib/note-catalog": filters, "@/lib/place-request": scope, "@/lib/request-security": security, "@/lib/studio-routes": routes, "./errors": errors, "../errors": errors };
  const collection = await load("app/api/notes/route.ts", deps), item = await load("app/api/notes/[noteId]/route.ts", deps);
  const request = (method, body, novel = "a", origin = "http://localhost:3000") => new Request(`http://localhost:3000/api/notes?novelId=${novel}`, { method, headers: { origin, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  for (const novelId of ["a", "b"]) {
    await prisma.novel.create({ data: { id: novelId, title: novelId } });
    await prisma.volume.create({ data: { id: `v-${novelId}`, novelId, title: "Volume" } });
    await prisma.chapter.create({ data: { id: `c-${novelId}`, volumeId: `v-${novelId}`, title: "Chapter" } });
    await prisma.scene.create({ data: { id: `s-${novelId}`, chapterId: `c-${novelId}`, title: "Scene", content: "manuscript" } });
    await prisma.character.create({ data: { id: `person-${novelId}`, novelId, name: "Person", secret: "SECRET" } });
    await prisma.character.create({ data: { id: `person2-${novelId}`, novelId, name: "Second person" } });
    await prisma.location.create({ data: { id: `p-${novelId}`, novelId, name: "Place", notes: "PRIVATE" } });
    await prisma.timelineEvent.create({ data: { id: `e-${novelId}`, novelId, title: "Event", description: "BODY" } });
  }
  const links = [["Volume", "v-a"], ["Chapter", "c-a"], ["Scene", "s-a"], ["Character", "person-a"], ["Character", "person2-a"], ["Place", "p-a"], ["TimelineEvent", "e-a"]].map(([type, id]) => ({ type, id }));
  assert.equal((await collection.POST(request("POST", { title: "Note" }, "a", "https://evil.example"))).status, 403);
  const response = await collection.POST(request("POST", { title: "Note", content: "Note content", links, tags: ["Continuity", "continuity"], pinned: true }));
  assert.equal(response.status, 201); let note = await response.json();
  assert.equal(note.links.length, 7); assert.equal(note.tags.length, 1); assert.doesNotMatch(JSON.stringify(note.links), /SECRET|PRIVATE|BODY|manuscript/);
  const privateSearch = async (urlSearch, headerSearch) => collection.GET(new Request(`http://localhost:3000/api/notes?novelId=a&search=${encodeURIComponent(urlSearch)}`, { headers: { "x-note-search": filters.encodePrivateNoteSearch(headerSearch) } }));
  assert.equal((await (await privateSearch("Note content", "no match")).json()).matched, 0);
  const privateMatch = await privateSearch("no match", "Note content"); assert.equal(privateMatch.headers.get("cache-control"), "private, no-store");
  const privateBody = await privateMatch.json(); assert.equal(privateBody.matched, 1); assert.ok(privateBody.items.every(item => !("content" in item)));
  const context = { params: Promise.resolve({ noteId: note.id }) };
  assert.equal(await repo.noteBelongsToNovelForRoute("a", note.id), true);
  assert.equal(await repo.noteBelongsToNovelForRoute("b", note.id), false);
  assert.equal(await repo.noteBelongsToNovelForRoute("a", "missing"), false);
  const beforeRead = await prisma.note.findUnique({ where: { id: note.id } });
  await item.GET(request("GET"), context);
  assert.deepEqual(await prisma.note.findUnique({ where: { id: note.id } }), beforeRead);
  for (const link of links) {
    const related = await catalog.getNoteCatalog("a", { ...filters.defaultNoteFilters, entityType: link.type, entity: link.id, archived: "all" });
    assert.deepEqual(related.items.map(item => item.id), [note.id]);
    const foreignRelated = await catalog.getNoteCatalog("b", { ...filters.defaultNoteFilters, entityType: link.type, entity: link.id, archived: "all" });
    assert.equal(foreignRelated.matched, 0);
  }
  assert.equal((await item.GET(request("GET", undefined, "b"), context)).status, 404);
  for (const link of links) {
    const bad = { ...link, id: link.id.replace(/-a$/, "-b") };
    assert.equal((await item.PATCH(request("PATCH", { revision: note.revision, title: "must rollback", links: [links[0], bad], tags: ["No partial"] }), context)).status, 409);
    assert.equal((await repo.getNote("a", note.id)).title, "Note");
  }
  assert.equal(await prisma.tag.count(), 1);
  await assert.rejects(prisma.noteCharacter.create({ data: { noteId: note.id, characterId: "person-a" } }), { code: "P2002" });
  await assert.rejects(prisma.noteScene.create({ data: { noteId: note.id, sceneId: "missing" } }), { code: "P2003" });
  await prisma.character.update({ where: { id: "person-a" }, data: { name: "Renamed", archivedAt: new Date() } });
  assert.equal((await repo.getNote("a", note.id)).links.find(link => link.type === "Character").title, "Renamed");
  assert.equal((await repo.getNote("a", note.id)).links.find(link => link.type === "Character").archived, true);
  const edited = await item.PATCH(request("PATCH", { revision: note.revision, content: "Changed" }), context);
  assert.equal(edited.status, 200); note = await edited.json(); assert.equal(note.links.length, 7); assert.equal(note.tags.length, 1);
  assert.equal((await item.PATCH(request("PATCH", { revision: 0, title: "stale" }), context)).status, 409);
  await t.test("Pin, resolve, archive and restore preserve content/tags/joins and all narrative targets", async () => {
    assert.equal(note.workflowStatus, "informational");
    const preserved = { title: note.title, content: note.content, tags: note.tags, links: note.links };
    const targetsBefore = await Promise.all([prisma.character.findMany(), prisma.scene.findMany(), prisma.location.findMany(), prisma.timelineEvent.findMany(), prisma.chapter.findMany(), prisma.volume.findMany()]);
    for (const fields of [{ pinned: false }, { pinned: true }, { workflowStatus: "open" }, { workflowStatus: "done" }, { workflowStatus: "open" }, { workflowStatus: "informational" }, { archivedAt: new Date().toISOString() }, { archivedAt: null }]) {
      const response = await item.PATCH(request("PATCH", { revision: note.revision, ...fields }), context); assert.equal(response.status, 200); note = await response.json();
      assert.deepEqual({ title: note.title, content: note.content, tags: note.tags, links: note.links }, preserved);
      for (const [field, value] of Object.entries(fields)) assert.equal(note[field], value);
      if (fields.workflowStatus) {
        const same = await item.PATCH(request("PATCH", { revision: note.revision, ...fields }), context);
        assert.equal(same.status, 200); assert.deepEqual(await same.json(), note);
        for (const status of ["open", "resolved"]) {
          const filtered = await catalog.getNoteCatalog("a", { ...filters.defaultNoteFilters, status });
          assert.equal(filtered.items.some(item => item.id === note.id), fields.workflowStatus === (status === "open" ? "open" : "done"));
        }
        assert.equal((await item.PATCH(request("PATCH", { revision: note.revision, ...fields }, "b"), context)).status, 409);
      }
      const active = await catalog.getNoteCatalog("a", filters.defaultNoteFilters);
      assert.equal(active.items.some(item => item.id === note.id), !note.archivedAt);
      assert.equal(await prisma.note.count(), 1);
    }
    assert.deepEqual(await Promise.all([prisma.character.findMany(), prisma.scene.findMany(), prisma.location.findMany(), prisma.timelineEvent.findMany(), prisma.chapter.findMany(), prisma.volume.findMany()]), targetsBefore);
    assert.equal((await item.PATCH(request("PATCH", { revision: note.revision, archivedAt: "invalid" }), context)).status, 400);
  });
  await t.test("Delete requires confirmation, same Novel, trusted origin and a freshly revalidated revision", async () => {
    assert.equal((await item.DELETE(request("DELETE", { revision: note.revision }), context)).status, 400);
    assert.equal((await item.DELETE(request("DELETE", { revision: note.revision, confirmed: true }, "b"), context)).status, 409);
    assert.equal((await item.DELETE(request("DELETE", { revision: note.revision, confirmed: true }, "a", "https://evil.example"), context)).status, 403);
    const confirmedRevision = note.revision;
    const response = await item.PATCH(request("PATCH", { revision: note.revision, links: note.links.filter(link => link.type !== "Volume").map(({ type, id }) => ({ type, id })) }), context);
    assert.equal(response.status, 200); note = await response.json();
    assert.equal((await item.DELETE(request("DELETE", { revision: confirmedRevision, confirmed: true }), context)).status, 409);
    assert.ok(await repo.getNote("a", note.id));
  });
  const before = await Promise.all([prisma.volume.findMany(), prisma.chapter.findMany(), prisma.scene.findMany(), prisma.character.findMany(), prisma.location.findMany(), prisma.timelineEvent.findMany()]);
  assert.equal((await item.DELETE(request("DELETE", { revision: note.revision, confirmed: true }), context)).status, 200);
  assert.equal(await prisma.note.count(), 0); assert.equal(await prisma.noteScene.count(), 0); assert.equal(await prisma.noteTag.count(), 0); assert.equal(await prisma.tag.count(), 1);
  assert.deepEqual(await Promise.all([prisma.noteVolume.count(), prisma.noteChapter.count(), prisma.noteCharacter.count(), prisma.notePlace.count(), prisma.noteTimelineEvent.count()]), [0, 0, 0, 0, 0]);
  assert.deepEqual(await Promise.all([prisma.volume.findMany(), prisma.chapter.findMany(), prisma.scene.findMany(), prisma.character.findMany(), prisma.location.findMany(), prisma.timelineEvent.findMany()]), before);
  const query = (values = {}, novelId = "a") => catalog.getNoteCatalog(novelId, filters.parseNoteFilters(new URLSearchParams(values)));
  const literal = "100% a_b ' OR 1=1 -- 日本語 ÁRBOL";
  const tagged = await repo.writeNote("a", { title: "Continuity", content: `${literal}\n${"private body ".repeat(100)}`, tags: ["Continuity"], links: [{ type: "Character", id: "person-a" }], workflowStatus: "in_progress", pinned: true });
  const tag = tagged.tagSummaries[0];
  const resolved = await repo.writeNote("a", { title: "Resolved", content: "another note", tags: ["Continuity"], workflowStatus: "done", links: [{ type: "Character", id: "person2-a" }] });
  await repo.writeNote("a", { title: "Historical", archivedAt: new Date().toISOString() });
  const foreign = await repo.writeNote("b", { title: "Foreign secret", content: literal, tags: ["Foreign tag"] });

  await t.test("Catalog intersects filters and searches literal SQL metacharacters and normalized Unicode", async () => {
    for (const search of ["%", "_", "' OR 1=1 --", "日本語", "árbol", "a\u0301rbol"]) {
      const result = await query({ search }); assert.deepEqual(result.items.map(item => item.id), [tagged.id]);
      assert.equal("content" in result.items[0], false); assert.equal("searchText" in result.items[0], false); assert.ok(result.items[0].snippet.length <= 240);
    }
    assert.equal((await query({ search: "%absent" })).matched, 0);
    assert.deepEqual((await query({ tag: tag.id, status: "open", entityType: "Character", entity: "person-a", pinned: "true" })).items.map(item => item.id), [tagged.id]);
    assert.equal((await query({ tag: tag.id, status: "resolved", entityType: "Character", entity: "person-a" })).matched, 0);
    assert.equal((await query({ entityType: "Character", entity: "person-b" })).matched, 0);
    assert.equal((await query({ tag: foreign.tagSummaries[0].id })).matched, 0);
    assert.equal((await query({ archived: "archived", tag: "untagged" })).matched, 1);
    assert.equal((await query()).hasUntagged, true);
    assert.equal((await query({ status: "resolved" })).items[0].id, resolved.id);
    const noMatches = await query({ search: "missing" }); assert.equal(noMatches.total, 3); assert.equal(noMatches.matched, 0);
    await prisma.novel.create({ data: { id: "empty", title: "Empty" } });
    assert.equal((await query({}, "empty")).total, 0); assert.equal((await query({}, "empty")).hasUntagged, false);
    const response = await collection.GET(request("GET")); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.doesNotMatch(JSON.stringify(await response.json()), /Foreign secret|Foreign tag/);
    const changed = await repo.writeNote("a", { content: "updated searchable" }, tagged.id, tagged.revision);
    assert.equal((await query({ search: "árbol" })).matched, 0); assert.equal((await query({ search: "UPDATED" })).matched, 1);
    assert.ok(changed.revision > tagged.revision);
  });

  await t.test("Tags CRUD is shared, scoped, confirmed, stale-safe and never deletes notes", async () => {
    const route = await load("app/api/notes/tags/route.ts", deps);
    assert.equal((await route.POST(request("POST", { name: " " }))).status, 400);
    assert.equal((await route.POST(request("POST", { name: "x" }, "a", "https://evil.example"))).status, 403);
    assert.equal((await route.PATCH(request("PATCH", { id: foreign.tagSummaries[0].id, expectedName: "Foreign tag", name: "stolen" }))).status, 409);
    const added = await (await route.POST(request("POST", { name: "Reusable" }))).json();
    const duplicate = await (await route.POST(request("POST", { name: "reusable" }))).json(); assert.equal(added.id, duplicate.id);
    const noteBefore = await repo.getNote("a", tagged.id);
    assert.equal((await route.PATCH(request("PATCH", { id: tag.id, expectedName: tag.name, name: "Plot" }))).status, 200);
    assert.deepEqual((await repo.getNote("a", tagged.id)).tags, ["Plot"]); assert.deepEqual((await repo.getNote("a", resolved.id)).tags, ["Plot"]);
    await assert.rejects(repo.writeNote("a", { tags: ["Continuity"] }, tagged.id, noteBefore.revision), { status: 409 });
    assert.equal((await route.DELETE(request("DELETE", { id: tag.id, expectedName: "Plot" }))).status, 400);
    assert.equal((await route.DELETE(request("DELETE", { id: tag.id, expectedName: tag.name, confirmed: true }))).status, 409);
    assert.equal((await route.DELETE(request("DELETE", { id: tag.id, expectedName: "Plot", confirmed: true }))).status, 200);
    assert.equal(await prisma.note.count(), 4); assert.deepEqual((await repo.getNote("a", tagged.id)).tags, []);
    assert.ok(await repo.getNote("b", foreign.id));
  });

  await t.test("Contextual Scene capture creates one canonical Note without modifying manuscript and survives later edits", async () => {
    const sceneBefore = await prisma.scene.findUnique({ where: { id: "s-a" } });
    const selected = "Reina desconfía de la torre", comment = "¿Ya conoce el peligro?";
    const response = await collection.POST(request("POST", { title: "Continuity question", content: comment, quotedText: selected, links: [{ type: "Scene", id: "s-a" }, { type: "Character", id: "person-a" }] }));
    assert.equal(response.status, 201); const captured = await response.json();
    assert.equal(captured.links.length, 2); assert.equal(captured.content, comment); assert.equal(captured.quotedText, selected);
    const annotationCatalog = await repo.getSceneAnnotationSummaries("a", "s-a");
    assert.equal(annotationCatalog.items.find(item => item.id === captured.id).quotedText, selected);
    assert.ok(annotationCatalog.items.every(item => !("content" in item)));
    await assert.rejects(repo.getSceneAnnotationSummaries("a", "s-b"), { status: 404 });
    assert.deepEqual(await prisma.scene.findUnique({ where: { id: "s-a" } }), sceneBefore);
    await prisma.scene.update({ where: { id: "s-a" }, data: { content: "Reina desconfía intensamente de la torre" } });
    assert.equal((await repo.getNote("a", captured.id)).quotedText, selected);
    await prisma.scene.update({ where: { id: "s-a" }, data: { content: "The quoted phrase is gone" } });
    assert.equal((await repo.getNote("a", captured.id)).quotedText, selected);
    assert.equal((await repo.getNote("a", captured.id)).content, comment);
    assert.ok((await repo.getNote("a", captured.id)).links.some(link => link.type === "Scene" && link.id === "s-a"));
    const count = await prisma.note.count();
    assert.equal((await collection.POST(request("POST", { title: "orphan quote", quotedText: selected, links: [{ type: "Character", id: "person-a" }] }))).status, 409);
    assert.equal((await item.PATCH(request("PATCH", { revision: captured.revision, links: [{ type: "Character", id: "person-a" }] }), { params: Promise.resolve({ noteId: captured.id }) })).status, 409);
    assert.equal((await query({ search: selected })).matched, 0, "quoted context is not part of catalog search");
    assert.equal((await collection.POST(request("POST", { title: "bad", content: selected, links: [{ type: "Character", id: "person-a" }, { type: "Scene", id: "s-b" }] }))).status, 409);
    assert.equal(await prisma.note.count(), count);
    assert.equal((await collection.POST(request("POST", { title: "bad", content: selected, selectionStart: 0, selectionEnd: 20 }))).status, 400);
    const catalogResult = await query({ search: "Continuity question" }); assert.ok(catalogResult.items.every(item => !("quotedText" in item)));
    await repo.deleteNote("a", captured.id, captured.revision);
  });
  await t.test("Large catalogs paginate metadata with stable ties and fixed batch query count", async () => {
    await prisma.note.createMany({ data: Array.from({ length: 2000 }, (_, i) => ({ id: `bulk-${String(i).padStart(4, "0")}`, novelId: "a", linkedType: "Novel", linkedId: "a", title: "Bulk", content: "PRIVATE".repeat(1000), searchText: `bulk\n${"private".repeat(1000)}`, updatedAt: new Date("2020-01-01"), pinned: i === 1999 })) });
    const start = queries.length, first = await query({ search: "bulk" }); const queryCount = queries.length - start;
    assert.equal(first.matched, 2000); assert.equal(first.items.length, 50); assert.equal(first.items[0].id, "bulk-0000");
    const last = await query({ search: "bulk", page: "40" }); assert.equal(last.items.length, 50); assert.equal(last.items.at(-1).id, "bulk-1999");
    assert.equal((await query({ search: "bulk", pinnedFirst: "true" })).items[0].id, "bulk-1999");
    const startSingle = queries.length; await query({ search: "bulk", pinned: "true" });
    assert.ok(queries.length - startSingle <= queryCount); assert.ok(queryCount < 25, `${queryCount} batched queries`);
    assert.ok(JSON.stringify(first).length < 60000); assert.ok(first.items.every(item => !("content" in item) && !("searchText" in item)));
    assert.ok(queries.slice(start).some(sql => sql.includes("substr(n.content,1,240)")));
  });
});
