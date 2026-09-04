import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import createJiti from "jiti";
import ts from "typescript";
import Database from "better-sqlite3";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { migrateRelationshipTypes } from "../scripts/migrate-relationship-types.mjs";

const require = createRequire(import.meta.url);
async function load(path, modules = {}) {
  const source = await readFile(resolve(path), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const result = { exports: {} };
  new Function("require", "exports", "module", compiled)((id) => {
    if (Object.hasOwn(modules, id)) return modules[id];
    throw new Error(`Unexpected dependency ${id}`);
  }, result.exports, result);
  return result.exports;
}
const types = await load("lib/character-relationship.ts");
const input = (relationshipType, fromCharacterId = "a", toCharacterId = "b") => ({ novelId: "n", fromCharacterId, toCharacterId, relationshipType });

test("Canonical types determine category, direction, inverse and availability", () => {
  const mentor = types.getRelationshipDefinition("mentor_of");
  assert.equal(mentor.category, "Social");
  assert.equal(mentor.directionality, "directional");
  assert.equal(mentor.inverseTypeId, "student_of");
  assert.equal(mentor.labelToFrom, "Student of");
  const ids = new Set();
  for (const definition of types.relationshipDefinitions) {
    assert.equal(ids.has(definition.key), false);
    ids.add(definition.key);
    assert.equal(definition.active, true);
    assert.equal(types.validateRelationshipInput(input(definition.key)).ok, true);
    assert.equal(types.resolveRelationshipSemantics(definition.key, "tampered").direction, definition.direction);
    if (definition.inverseTypeId) assert.equal(types.getRelationshipDefinition(definition.inverseTypeId).labelFromTo, definition.labelToFrom);
    if (definition.directionality === "symmetric") assert.equal(definition.labelFromTo, definition.labelToFrom);
  }
  for (const value of ["Mentor of", "mentor-student", "__proto__", "constructor", "custom", null]) assert.equal(types.validateRelationshipInput(input(value)).ok, false);
  for (const extra of [{ category: "Conflict" }, { direction: "Bidirectional" }, { inverseTypeId: "enemy_of" }, { active: true }]) {
    assert.equal(types.validateRelationshipInput({ ...input("mentor_of"), ...extra }).ok, false);
  }
  assert.equal(types.validateRelationshipInput(input("mentor_of", "a", "a")).ok, false);
});

test("Directional, symmetric and inverse identities encode distinct logical semantics", () => {
  const identity = (type, a = "a", b = "b") => types.relationshipIdentity("n", a, b, type);
  assert.notEqual(identity("in_love_with"), identity("in_love_with", "b", "a"));
  assert.notEqual(identity("distrusts"), identity("distrusts", "b", "a"));
  for (const type of ["partner_of", "friend_of", "sibling_of", "enemy_of"]) assert.equal(identity(type), identity(type, "b", "a"));
  assert.equal(identity("mentor_of"), identity("student_of", "b", "a"));
  assert.notEqual(identity("mentor_of"), identity("mentor_of", "b", "a"));
  assert.equal(identity("parent_of"), identity("child_of", "b", "a"));
  assert.equal(identity("friend_of"), identity("friends", "b", "a"));
  const semantics = types.resolveRelationshipSemantics("in_love_with", "Bidirectional");
  assert.deepEqual(types.relationshipViewForCharacter({ fromCharacterId: "a", toCharacterId: "b", ...semantics }, "b"), { otherCharacterId: "a", label: "Loved by" });
  assert.equal(types.resolveRelationshipSemantics("unknown narrative type", "Directional").active, false);
  assert.equal(types.resolveRelationshipSemantics("unknown narrative type", "Directional").category, "Unclassified");
});

test("Migration preserves metadata/IDs, canonicalizes known types and leaves ambiguous data intact", () => {
  const database = new Database(":memory:");
  try {
    database.exec(`CREATE TABLE Character (id TEXT PRIMARY KEY, novelId TEXT NOT NULL);
      CREATE TABLE Relationship (id TEXT PRIMARY KEY, novelId TEXT, fromCharacterId TEXT, toCharacterId TEXT, relationshipType TEXT, category TEXT, direction TEXT, notes TEXT);
      INSERT INTO Character VALUES ('a','n'),('b','n'),('foreign','other');`);
    const insert = database.prepare("INSERT INTO Relationship VALUES (?, 'n', ?, ?, ?, ?, ?, ?)");
    insert.run("old-mentor", "a", "b", "mentor-student", "Conflict", "Bidirectional", "private mentor notes");
    insert.run("old-love", "a", "b", "is in love with", "Family", "Bidirectional", "private love notes");
    insert.run("old-student", "a", "b", "Student of", "Conflict", "Bidirectional", "private student notes");
    insert.run("partner", "b", "a", "Partner of", "Family", "Directional", "private partner notes");
    insert.run("unknown", "a", "b", "Custom old bond", "Secret/Spoiler", "Directional", "private custom notes");
    insert.run("duplicate-1", "a", "b", "friends", "Social", "Bidirectional", "first notes");
    insert.run("duplicate-2", "b", "a", "Friend of", "Social", "Bidirectional", "different notes");
    insert.run("foreign", "a", "foreign", "enemy_of", "Conflict", "Bidirectional", "private foreign notes");
    insert.run("self", "a", "a", "parent_of", "Family", "Directional", "private self notes");
    const before = database.prepare("SELECT * FROM Relationship ORDER BY id").all();
    assert.deepEqual(migrateRelationshipTypes(database), { updated: 4, unknown: 1, invalid: 2, conflicts: 1 });
    const after = database.prepare("SELECT * FROM Relationship ORDER BY id").all();
    assert.deepEqual(after.map(({ id, notes }) => ({ id, notes })), before.map(({ id, notes }) => ({ id, notes })));
    const read = (id) => after.find((row) => row.id === id);
    assert.equal(read("old-love").relationshipType, "in_love_with");
    assert.equal(read("old-love").direction, "Directional");
    assert.equal(read("old-mentor").category, "Social");
    assert.equal(read("old-student").relationshipType, "mentor_of");
    assert.equal(read("old-student").fromCharacterId, "b");
    assert.equal(read("partner").fromCharacterId, "a");
    for (const id of ["duplicate-1", "duplicate-2", "unknown", "foreign", "self"]) assert.deepEqual(read(id), before.find((row) => row.id === id));
    assert.deepEqual(migrateRelationshipTypes(database), { updated: 0, unknown: 1, invalid: 2, conflicts: 1 });
  } finally { database.close(); }
});

test("Relationship API enforces ownership, canonical inverse uniqueness and non-reciprocal romance in SQLite", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "monogatari-relationship-tests-"));
  let prisma;
  t.after(async () => { await prisma?.$disconnect(); await rm(directory, { recursive: true, force: true }); });
  const databasePath = join(directory, "test.db");
  const sql = execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "diff", "--from-empty", "--to-schema", resolve("prisma/schema.prisma"), "--script"], { encoding: "utf8", windowsHide: true });
  const database = new Database(databasePath);
  database.exec(sql); database.close();
  const { PrismaClient } = createJiti(import.meta.url)(resolve("lib/generated/prisma/client.ts"));
  prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databasePath }), log: [{ emit: "event", level: "query" }] });
  const queries = [];
  prisma.$on("query", (event) => queries.push(event.query));
  const studio = await load("lib/db/studio.ts", {
    "@/lib/db/notes": { listNotes: async () => [] },
    "@/lib/db/prisma": { prisma }, "node:crypto": require("node:crypto"),
    "@/lib/chapter-preview": {}, "@/lib/character-first-appearance": { deriveCharacterFirstAppearanceDetails: () => new Map() }, "@/lib/db/places": { listPlaces: async () => [] }, "@/lib/character-place": {},
    "@/lib/timeline-event": {}, "@/lib/db/timeline-position": {}, "@/lib/db/timeline-places": {}, "@/lib/db/scene-places": {}, "@/lib/reader-progress": {}, "@/lib/studio-settings": { STUDIO_CONFIGURATION_ID: "studio", STUDIO_CONFIGURATION_VERSION: 1, parseStudioSettings: () => ({}), applyStudioSettings: () => ({}) },
    "@/lib/character-metadata": createJiti(import.meta.url)("../lib/character-metadata.ts"), "@/lib/character-relationship": types
  });
  const route = await load("app/api/relationships/route.ts", {
    "@/lib/studio-routes": await load("lib/studio-routes.ts"),
    "next/server": require("next/server"), "@/lib/db/studio": studio, "@/lib/character-relationship": types,
    "@/lib/request-security": await load("lib/request-security.ts")
  });
  const post = (body, origin = "http://localhost:3000") => route.POST(new Request("http://localhost:3000/api/relationships", {
    method: "POST", headers: { "Content-Type": "application/json", origin }, body: typeof body === "string" ? body : JSON.stringify(body)
  }));
  await prisma.novel.createMany({ data: [{ id: "n", title: "N" }, { id: "other", title: "Other" }] });
  await prisma.character.createMany({ data: [{ id: "a", novelId: "n", name: "A" }, { id: "b", novelId: "n", name: "B" }, { id: "foreign", novelId: "other", name: "Foreign" }] });
  assert.equal((await post({ ...input("mentor_of"), category: "Conflict" })).status, 400);
  assert.equal((await post({ ...input("mentor_of"), direction: "Bidirectional" })).status, 400);
  assert.equal((await post(input("mentor_of", "a", "foreign"))).status, 409);
  assert.equal((await post(input("mentor_of", "a", "a"))).status, 400);
  assert.equal((await post(input("mentor_of"), "https://evil.example")).status, 403);
  assert.equal((await post("{")).status, 400);
  assert.equal(await prisma.relationship.count(), 0);
  const mentor = await post(input("mentor_of"));
  assert.equal(mentor.status, 201);
  const saved = await mentor.json();
  assert.equal(saved.category, "Social");
  assert.equal(saved.direction, "Directional");
  assert.equal(saved.labelFromTo, "Mentor of");
  assert.equal(saved.labelToFrom, "Student of");
  assert.equal((await post(input("student_of", "b", "a"))).status, 409);
  assert.equal((await post(input("mentor_of"))).status, 409);
  assert.equal((await post(input("in_love_with"))).status, 201);
  assert.equal(await prisma.relationship.count({ where: { relationshipType: "in_love_with" } }), 1, "does not synthesize reciprocation");
  assert.equal((await post(input("in_love_with", "b", "a"))).status, 201, "independently reciprocated love is a distinct edge");
  const partner = await post(input("partner_of", "b", "a"));
  assert.equal(partner.status, 201);
  const shared = await partner.json();
  assert.equal(shared.fromCharacterId, "a");
  assert.equal(shared.labelFromTo, shared.labelToFrom);
  assert.equal((await post(input("partner_of"))).status, 409);
  await prisma.relationship.create({ data: { id: "legacy", ...input("friends"), category: "Conflict", direction: "Directional" } });
  assert.equal((await post(input("friend_of", "b", "a"))).status, 409, "duplicate detection also handles unmigrated aliases");
  const concurrent = await Promise.all([post(input("enemy_of")), post(input("enemy_of", "b", "a"))]);
  assert.deepEqual(concurrent.map((response) => response.status).sort(), [201, 409]);
  assert.equal(await prisma.relationship.count({ where: { relationshipType: "enemy_of" } }), 1);
  const [left, right] = await Promise.all(["a", "b"].map((id) => prisma.relationship.findMany({ where: { relationshipType: "partner_of", OR: [{ fromCharacterId: id }, { toCharacterId: id }] } })));
  assert.equal(left[0].id, right[0].id, "both character queries reuse the same relation");
  assert.equal(await prisma.character.count(), 3);
  const sinceContract = await load("lib/relationship-since.ts", { "./studio-routes": await load("lib/studio-routes.ts") });
  await prisma.volume.createMany({ data: [{ id: "v", novelId: "n", title: "Volume", sortOrder: 1 }, { id: "vf", novelId: "other", title: "Foreign" }] });
  await prisma.chapter.createMany({ data: [{ id: "c", volumeId: "v", title: "Chapter", sortOrder: 1 }, { id: "cf", volumeId: "vf", title: "Foreign" }] });
  await prisma.scene.createMany({ data: [{ id: "s", chapterId: "c", title: "Scene", sortOrder: 1, content: "PRIVATE BODY" }, { id: "sf", chapterId: "cf", title: "Foreign" }] });
  for (const [kind, target, foreign, relationshipType] of [["volume", "v", "vf", "father_of"], ["chapter", "c", "cf", "mother_of"], ["scene", "s", "sf", "child_of"]]) {
    assert.equal((await post({ ...input(relationshipType), sinceKind: kind, sinceTargetId: foreign })).status, 409);
    assert.equal((await post({ ...input(relationshipType), sinceKind: kind, sinceTargetId: "missing" })).status, 409);
    assert.equal((await post({ ...input(relationshipType), sinceKind: kind, sinceTargetId: target, since: "duplicated title" })).status, 400);
    const linkedResponse = await post({ ...input(relationshipType), sinceKind: kind, sinceTargetId: target });
    assert.equal(linkedResponse.status, 201);
    const linked = await linkedResponse.json();
    assert.equal(linked.sinceKind, kind);
    assert.equal(linked.sinceTargetId, target);
    assert.equal(linked.since, "");
  }
  const structure = async () => sinceContract.relationshipSinceOptions("n", await prisma.volume.findMany(), await prisma.chapter.findMany(), await prisma.scene.findMany());
  const linkedChapter = await prisma.relationship.findFirst({ where: { sinceKind: "chapter" } });
  await prisma.chapter.update({ where: { id: "c" }, data: { title: "Renamed chapter", sortOrder: 8 } });
  assert.match(sinceContract.relationshipSinceLabel(linkedChapter, await structure()), /Volume · Renamed chapter/);
  assert.deepEqual(await prisma.relationship.findUnique({ where: { id: linkedChapter.id } }), linkedChapter, "renaming does not edit the relationship");
  await prisma.volume.update({ where: { id: "v" }, data: { archived: true } });
  for (const [sinceKind, sinceTargetId] of [["volume", "v"], ["chapter", "c"], ["scene", "s"]]) {
    assert.equal((await post({ ...input("rival_of"), sinceKind, sinceTargetId })).status, 409);
  }
  assert.match(sinceContract.relationshipSinceLabel(linkedChapter, await structure()), /\(Archived\)/);

  const detailRoute = await load("app/api/relationships/[relationshipId]/route.ts", {
    "@/lib/studio-routes": await load("lib/studio-routes.ts"),
    "next/server": require("next/server"), "@/lib/db/studio": studio, "@/lib/character-relationship": types,
    "@/lib/request-security": await load("lib/request-security.ts")
  });
  const mutate = (id, body, method = "PATCH", origin = "http://localhost:3000") => detailRoute[method](new Request(`http://localhost:3000/api/relationships/${id}`, {
    method, headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body)
  }), { params: Promise.resolve({ relationshipId: id }) });
  const edit = { action: "edit", revision: 0, ...input("mentor_of"), notes: "Revised private notes", status: "Strained" };
  assert.equal((await mutate(saved.id, edit, "PATCH", "https://evil.example")).status, 403);
  assert.equal((await mutate(saved.id, { ...edit, novelId: "other" })).status, 409);
  assert.equal((await mutate(saved.id, { ...edit, toCharacterId: "foreign" })).status, 409);
  assert.equal((await mutate(saved.id, { ...edit, sinceKind: "scene", sinceTargetId: "sf" })).status, 409);
  assert.equal((await mutate(saved.id, { ...edit, relationshipType: "partner_of" })).status, 409, "editing cannot duplicate another canonical relation");
  assert.equal((await mutate(saved.id, { ...edit, category: "Conflict" })).status, 400);
  const updated = await mutate(saved.id, edit);
  assert.equal(updated.status, 200);
  const revised = await updated.json();
  assert.equal(revised.id, saved.id); assert.equal(revised.revision, 1); assert.equal(revised.notes, edit.notes);
  assert.equal((await mutate(saved.id, edit)).status, 409, "stale edit cannot overwrite current notes");
  const archive = { action: "archive", novelId: "n", revision: 1, confirmed: true };
  assert.equal((await mutate(saved.id, { ...archive, confirmed: false })).status, 400);
  assert.equal((await mutate(saved.id, { ...archive, action: "unknown" })).status, 400);
  const archivedResponse = await mutate(saved.id, archive);
  assert.equal(archivedResponse.status, 200);
  const archived = await archivedResponse.json();
  assert.ok(archived.archivedAt); assert.equal(archived.revision, 2); assert.equal(archived.notes, edit.notes);
  assert.equal((await mutate(saved.id, archive)).status, 409);
  const restore = await mutate(saved.id, { ...archive, action: "restore", revision: 2 });
  assert.equal(restore.status, 200); assert.equal((await restore.json()).archivedAt, null);
  assert.equal((await mutate(saved.id, { ...archive, action: "delete", revision: 2 }, "DELETE")).status, 409);
  assert.equal((await mutate(saved.id, { ...archive, action: "delete", revision: 3, novelId: "other" }, "DELETE")).status, 409);
  assert.equal((await mutate(saved.id, { ...archive, action: "delete", revision: 3 }, "DELETE")).status, 200);
  assert.equal(await prisma.relationship.findUnique({ where: { id: saved.id } }), null);
  assert.equal(await prisma.character.count(), 3); assert.equal(await prisma.scene.count(), 2);
  // Changing type keeps the stable ID and releases the old logical identity for new creates.
  assert.equal((await mutate(shared.id, { action: "edit", revision: 0, ...input("spouse_of") })).status, 200);
  assert.equal((await post(input("partner_of"))).status, 201);
  const archivedSinceEdit = { action: "edit", revision: 0, ...input("mother_of"), sinceKind: "chapter", sinceTargetId: "c", notes: "Preserve historical chapter" };
  assert.equal((await mutate(linkedChapter.id, archivedSinceEdit)).status, 200, "editing notes can retain a same-novel archived Since target");

  // Real 300-character / 1000-edge catalog: bounded SQL and no private bodies in catalog/snapshot.
  await prisma.novel.create({ data: { id: "large", title: "Large cast" } });
  await prisma.character.createMany({ data: Array.from({ length: 300 }, (_, i) => ({ id: `large-c${i}`, novelId: "large", name: `C${i}`, status: i === 299 ? "Spoiler" : "Active" })) });
  const bulk = Array.from({ length: 1000 }, (_, i) => ({ id: `large-r${i}`, novelId: "large", fromCharacterId: `large-c${Math.floor(i / 299)}`, toCharacterId: `large-c${i % 299 + 1}`, relationshipType: "mentor_of", category: "Social", direction: "Directional", isSpoiler: i % 10 === 0,
    description: "PRIVATE_LARGE_DESCRIPTION".repeat(100), notes: "PRIVATE_LARGE_NOTES".repeat(200), since: "PRIVATE_CUSTOM_SINCE", status: "PRIVATE_NARRATIVE_STATUS" }));
  await prisma.relationship.createMany({ data: bulk });
  const getCatalog = (query = "novelId=large") => route.GET(new Request(`http://localhost:3000/api/relationships?${query}`));
  queries.length = 0;
  const response = await getCatalog();
  assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /no-store/);
  const rows = await response.json();
  assert.ok(queries.length <= 3, `expected batched catalog queries, got ${queries.length}`);
  assert.ok(queries.every((sql) => !/"description"|"notes"|"since"/.test(sql)), "catalog does not select narrative bodies");
  const expected = bulk.filter((r) => !r.isSpoiler && r.toCharacterId !== "large-c299" && r.fromCharacterId !== r.toCharacterId);
  assert.equal(rows.length, expected.length);
  assert.doesNotMatch(JSON.stringify(rows), /PRIVATE_|description|notes|since|large-c299/);
  assert.ok(JSON.stringify(rows).length < 500_000);
  assert.equal((await getCatalog("novelId=..%2Fother")).status, 400);
  assert.equal((await getCatalog("spoilers=true")).status, 400);
  assert.equal((await getCatalog("novelId=large&spoilers=invalid").then((r) => r.json())).length, rows.length);
  const allRows = await getCatalog("novelId=large&spoilers=true").then((r) => r.json());
  assert.ok(allRows.length > rows.length); assert.doesNotMatch(JSON.stringify(allRows), /PRIVATE_/);
  const getDetail = (id, query = "novelId=large") => detailRoute.GET(new Request(`http://localhost:3000/api/relationships/${id}?${query}`), { params: Promise.resolve({ relationshipId: id }) });
  const publicId = rows[0].id;
  assert.equal((await getDetail(publicId, "novelId=other")).status, 404);
  assert.equal((await getDetail("large-r0")).status, 404);
  assert.deepEqual(await getDetail("large-r0").then((r) => r.json()), await getDetail("missing").then((r) => r.json()), "hidden and missing are indistinguishable");
  assert.equal((await getDetail("large-r298")).status, 404, "spoiler endpoint character is hidden too");
  const detailResponse = await getDetail(publicId);
  assert.match(detailResponse.headers.get("cache-control"), /no-store/);
  assert.match((await detailResponse.json()).notes, /PRIVATE_LARGE_NOTES/);
  assert.equal((await getDetail("large-r0", "novelId=large&spoilers=true")).status, 200);
  const beforeRead = await prisma.novel.findUnique({ where: { id: "large" } });
  const snapshot = await studio.getStudioSnapshot();
  assert.doesNotMatch(JSON.stringify(snapshot.relationships), /PRIVATE_|description|notes|since/);
  assert.equal(snapshot.relationships.filter((r) => r.novelId === "large").length, rows.length);
  const expectedCount = rows.filter((r) => r.fromCharacterId === "large-c0" || r.toCharacterId === "large-c0").length;
  assert.equal(snapshot.characters.find((c) => c.id === "large-c0").relationships, expectedCount);
  assert.deepEqual(await prisma.novel.findUnique({ where: { id: "large" } }), beforeRead, "GET and snapshot never mutate the novel");
});
