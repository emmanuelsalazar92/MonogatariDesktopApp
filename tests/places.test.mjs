import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import createJiti from "jiti";
import ts from "typescript";
import Database from "better-sqlite3";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { migratePlaceMetadata } from "../scripts/migrate-place-metadata.mjs";
import { migratePlaceClassification } from "../scripts/migrate-place-classification.mjs";

const require = createRequire(import.meta.url);
async function loadTs(path, modules = {}) {
  const source = await readFile(resolve(path), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  });
  const result = { exports: {} };
  new Function("require", "exports", "module", outputText)((id) => {
    if (Object.hasOwn(modules, id)) return modules[id];
    throw new Error(`Unexpected dependency ${id}`);
  }, result.exports, result);
  return result.exports;
}
const routes = await loadTs("lib/studio-routes.ts");
const classification = await loadTs("lib/place-classification.ts");
const domain = await loadTs("lib/studio-domain.ts", { "lucide-react": {}, "./place-classification": classification });
const characterPlace = await loadTs("lib/character-place.ts", { "@/lib/studio-domain": domain });
const hierarchy = await loadTs("lib/place-hierarchy.ts");
const metadata = await loadTs("lib/place-metadata.ts", { "@/lib/place-classification": classification, "@/lib/studio-routes": routes, "@/lib/place-hierarchy": hierarchy });
const requestContext = await loadTs("lib/place-request.ts", { "@/lib/studio-routes": routes });
const security = await loadTs("lib/request-security.ts");
const lifecycle = await loadTs("lib/place-lifecycle.ts");

test("Places derive MD-97 relationships by ID with current names and shared metadata", () => {
  const place = { id: "finca", novelId: "a" };
  const characters = [
    { id: "juana", novelId: "a", name: "Juana", secret: "private", notes: "private" },
    { id: "other", novelId: "a", name: "Juana", archivedAt: "2026-01-01" },
    { id: "foreign", novelId: "b", name: "Hidden" }
  ];
  const links = [
    { characterId: "juana", locationId: "finca", relationshipType: "Lives at" },
    { characterId: "other", locationId: "finca", relationshipType: "Works at" },
    { characterId: "foreign", locationId: "finca", relationshipType: "Associated with" },
    { characterId: "missing", locationId: "finca", relationshipType: "Associated with" }
  ];
  const result = characterPlace.derivePlaceCharacters(place, characters, links);
  assert.equal(result.length, 2, "same-name characters remain separate entities");
  assert.equal(result.find((item) => item.characterId === "juana").relationshipType, "Lives at");
  assert.equal(result.find((item) => item.characterId === "other").archived, true);
  assert.equal(result.some((item) => Object.hasOwn(item, "secret") || Object.hasOwn(item, "notes")), false);
  characters[0].name = "Renamed Juana";
  assert.equal(characterPlace.derivePlaceCharacters(place, characters, links).find((item) => item.characterId === "juana").name, "Renamed Juana");
  assert.deepEqual(characterPlace.derivePlaceCharacters(place, characters, []), []);
});

test("Place classification uses stable codes, safe legacy reads and combined filters", () => {
  assert.deepEqual(classification.placeTypes, ["country", "region", "city_town", "district_area", "building", "room_interior", "natural_location", "other"]);
  assert.deepEqual(classification.placeStatuses, ["active", "archived"]);
  assert.equal(classification.placeTypeLabels.city_town, "City/Town");
  for (const type of classification.placeTypes) {
    for (const status of classification.placeStatuses) assert.equal(metadata.validatePlaceMetadata({ name: "Place", type, status }).ok, true);
  }
  for (const value of ["School", "Building", "Active", "Abandoned", "Destroyed", "__proto__", "constructor", "arbitrary", null, 42]) {
    assert.equal(metadata.validatePlaceMetadata({ name: "Place", type: value }).ok, false);
    assert.equal(metadata.validatePlaceMetadata({ name: "Place", status: value }).ok, false);
  }
  assert.equal(classification.normalizePlaceType("School"), "building");
  assert.equal(classification.normalizePlaceType("unknown"), "other");
  for (const status of ["Inactive", "Abandoned", "Destroyed", "__proto__", undefined]) assert.equal(classification.normalizePlaceStatus(status), "active");
  assert.equal(classification.normalizePlaceStatus("Archived"), "archived");
  const place = { type: "building", status: "archived" };
  assert.equal(classification.matchesPlaceClassification(place, "building", "archived"), true);
  assert.equal(classification.matchesPlaceClassification(place, "region", "archived"), false);
  assert.equal(classification.matchesPlaceClassification(place, "building", "active"), false);
  assert.equal(classification.matchesPlaceClassification(place, "all", "all"), true);
  assert.equal(classification.matchesPlaceClassification(place, "bad", "bad"), false);
  assert.equal(metadata.validatePlaceMetadata({ name: "Ruins", notes: "Abandoned" }).data.status, "active");
});

test("Place classification migration is idempotent and preserves unknown narrative values and joins", () => {
  const database = new Database(":memory:");
  try {
    database.exec(`CREATE TABLE Location (id TEXT PRIMARY KEY, type TEXT, status TEXT, notes TEXT);
      CREATE TABLE Scene (id TEXT PRIMARY KEY, locationId TEXT REFERENCES Location(id));
      INSERT INTO Location VALUES ('known', 'School', 'Inactive', 'Abandoned'), ('unknown', 'Floating Island', 'Destroyed', 'keep'), ('archived', 'Room', 'Archived', 'history');
      INSERT INTO Scene VALUES ('scene', 'known');`);
    assert.equal(migratePlaceClassification(database), 2);
    assert.equal(migratePlaceClassification(database), 0);
    assert.deepEqual(database.prepare('SELECT type, status, notes, revision FROM Location WHERE id = ?').get('known'), { type: "building", status: "active", notes: "Abandoned", revision: 1 });
    assert.deepEqual(database.prepare('SELECT type, status, revision FROM Location WHERE id = ?').get('unknown'), { type: "Floating Island", status: "Destroyed", revision: 0 });
    assert.equal(database.prepare('SELECT status FROM Location WHERE id = ?').get('archived').status, "archived");
    assert.equal(database.prepare('SELECT locationId FROM Scene').get().locationId, "known");
  } finally { database.close(); }
});

test("place metadata allows minimum capture and validates every writable field", () => {
  const minimal = metadata.validatePlaceMetadata({ name: "  Santuario Seiryu  " });
  assert.equal(minimal.ok, true);
  assert.deepEqual(minimal.data, {
    name: "Santuario Seiryu", type: "other", status: "active", description: "", visualNotes: "",
    atmosphere: "", rules: "", notes: "", parentPlaceId: null
  });
  for (const name of ["", "  \n ", null, 42, "x".repeat(121)]) {
    assert.equal(metadata.validatePlaceMetadata({ name }).ok, false);
  }
  for (const input of [[], null, { name: "Place", type: "Invalid" }, { name: "Place", status: "Invalid" },
    { name: "Place", atmosphere: 1 }, { name: "Place", notes: "x".repeat(10001) },
    { name: "Place", parentPlaceId: "../bad" }, { name: "Place", firstAppearance: "manual" },
    { name: "Place", sceneCount: 9 }, { name: "Place", id: "client-id" }]) {
    assert.equal(metadata.validatePlaceMetadata(input).ok, false);
  }
  assert.deepEqual(metadata.validatePlaceMetadata({ atmosphere: " Mist ", notes: " new " }, true), {
    ok: true, data: { atmosphere: "Mist", notes: "new" }
  });
  assert.equal(metadata.validatePlaceMetadata({}, true).ok, false);
});

test("place parent validation rejects missing parents, self-links and cycles", () => {
  const places = [{ id: "root", parentPlaceId: null }, { id: "child", parentPlaceId: "root" }];
  assert.equal(metadata.placeParentError("new", "child", places), null);
  assert.equal(metadata.placeParentError("root", null, places), null);
  assert.match(metadata.placeParentError("root", "child", places), /cycle/);
  assert.match(metadata.placeParentError("root", "root", places), /cycle/);
  assert.match(metadata.placeParentError("new", "other-novel", places), /same novel/);
});

test("place request context rejects stale novel IDs but supports name + active novel capture", () => {
  const request = new Request("http://localhost:3000/api/places?novelId=novel-a", {
    headers: { referer: "http://localhost:3000/novels/novel-a/editor/scene-a" }
  });
  assert.deepEqual(requestContext.resolvePlaceNovelId(request, "novel-a"), { ok: true, novelId: "novel-a" });
  assert.equal(requestContext.resolvePlaceNovelId(request, "novel-b").ok, false);
  assert.equal(requestContext.resolvePlaceNovelId(new Request("http://localhost:3000/api/places", {
    headers: { referer: "http://localhost:3000/novels/novel-a/places" }
  }), "novel-b").ok, false);
});

test("additive place upgrade preserves existing metadata and is idempotent", () => {
  const database = new Database(":memory:");
  try {
    database.exec('CREATE TABLE Location (id TEXT PRIMARY KEY, notes TEXT); INSERT INTO Location VALUES (\'existing\', \'keep\')');
    assert.equal(migratePlaceMetadata(database).length, 5);
    assert.deepEqual(migratePlaceMetadata(database), []);
    assert.deepEqual(database.prepare("SELECT * FROM Location").get(), {
      id: "existing", notes: "keep", status: "active", atmosphere: "", revision: 0, parentPlaceId: null, updatedAt: null
    });
  } finally { database.close(); }
});

test("Places API and SQLite preserve canonical entities, ownership, revisions and joins", async () => {
  const directory = await mkdtemp(join(tmpdir(), "monogatari-place-tests-"));
  const databasePath = join(directory, "test.db");
  const sql = execFileSync(process.execPath, [
    require.resolve("prisma/build/index.js"), "migrate", "diff", "--from-empty", "--to-schema", resolve("prisma/schema.prisma"), "--script"
  ], { encoding: "utf8", maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  const database = new Database(databasePath);
  database.exec(sql);
  database.close();
  const jiti = createJiti(import.meta.url);
  const { PrismaClient } = jiti(resolve("lib/generated/prisma/client.ts"));
  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databasePath }), log: [{ emit: "event", level: "query" }] });
  const readQueries = [];
  // Inspect query shape/count only; never retain bound private values or log them.
  prisma.$on("query", (event) => { if (event.query.startsWith("SELECT")) readQueries.push(event.query); });
  after(async () => { await prisma.$disconnect(); await rm(directory, { recursive: true, force: true }); });
  const scenePlaces = await loadTs("lib/db/scene-places.ts", { "@/lib/db/prisma": { prisma } });
  const db = await loadTs("lib/db/places.ts", { "@/lib/db/prisma": { prisma }, "@/lib/place-metadata": metadata, "@/lib/place-classification": classification, "@/lib/db/scene-places": scenePlaces, "@/lib/place-lifecycle": lifecycle });
  const errors = await loadTs("app/api/places/errors.ts", { "next/server": require("next/server"), "@/lib/db/places": db });
  const modules = {
    "next/server": require("next/server"), "@/lib/db/places": db,
    "@/lib/db/studio": { novelExistsForRoute: async (id) => Boolean(await prisma.novel.findUnique({ where: { id } })) },
    "@/lib/place-metadata": metadata, "@/lib/place-request": requestContext,
    "@/lib/studio-routes": routes, "@/lib/request-security": security,
    "@/lib/place-lifecycle": lifecycle,
    "./errors": errors, "../errors": errors
  };
  const collection = await loadTs("app/api/places/route.ts", modules);
  const detail = await loadTs("app/api/places/[placeId]/route.ts", modules);
  const request = (method, body, novelId = "novel-a", headers = {}) => new Request(
    `http://localhost:3000/api/places?novelId=${novelId}`, {
      method, headers: { "Content-Type": "application/json", origin: "http://localhost:3000", ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    }
  );
  await prisma.novel.createMany({ data: [{ id: "novel-a", title: "A" }, { id: "novel-b", title: "B" }] });
  const response = await collection.POST(request("POST", { name: "  Santuario Seiryu  ", novelId: "novel-a" }));
  assert.equal(response.status, 201);
  const place = await response.json();
  assert.match(place.id, /^place-/);
  assert.equal(place.name, "Santuario Seiryu");
  assert.equal(place.novelId, "novel-a");
  assert.equal(place.firstAppearance, "");
  assert.equal(place.revision, 0);
  assert.ok(Number.isFinite(Date.parse(place.updatedAt)), "minimal create records its edit time");
  const context = { params: Promise.resolve({ placeId: place.id }) };

  assert.equal((await collection.POST(request("POST", { name: " " }))).status, 400);
  assert.equal((await collection.POST(request("POST", { name: "Place", firstAppearance: "manual" }))).status, 400);
  assert.equal((await collection.POST(request("POST", { name: "Place", novelId: "novel-b" }))).status, 409);
  assert.equal((await collection.POST(request("POST", { name: "Place" }, "missing-novel"))).status, 404);
  assert.equal((await collection.POST(request("POST", { name: "Place" }, "novel-a", { origin: "https://evil.example" }))).status, 403);
  assert.equal((await detail.GET(request("GET", undefined, "novel-b"), context)).status, 404);
  assert.equal((await detail.PATCH(request("PATCH", { revision: 0, notes: "attack" }, "novel-b"), context)).status, 404);
  assert.equal((await detail.PATCH(request("PATCH", { notes: "missing revision" }), context)).status, 400);

  await prisma.volume.create({ data: { id: "vol-a", novelId: "novel-a", title: "Volume 1", sortOrder: 1 } });
  await prisma.chapter.create({ data: { id: "ch-a", volumeId: "vol-a", title: "Chapter 1", sortOrder: 1 } });
  await prisma.scene.createMany({ data: [
    { id: "scene-later", chapterId: "ch-a", title: "Later", sortOrder: 8, content: "unchanged manuscript" },
    { id: "scene-first", chapterId: "ch-a", title: "Arrival", sortOrder: 3 },
    { id: "scene-archived", chapterId: "ch-a", title: "Archived", sortOrder: 1, archived: true }
  ] });
  await prisma.scenePlace.createMany({ data: ["scene-later", "scene-first", "scene-archived"].map((sceneId) => ({ sceneId, locationId: place.id })) });
  await prisma.character.create({ data: { id: "character-a", novelId: "novel-a", name: "Author's character" } });
  await prisma.characterPlace.create({ data: { characterId: "character-a", locationId: place.id } });
  const beforeScene = await prisma.scene.findUnique({ where: { id: "scene-later" } });
  const beforeJoins = await prisma.characterPlace.findMany();
  await prisma.location.update({ where: { id: place.id }, data: { updatedAt: new Date("2000-01-01T00:00:00.000Z") } });
  const changed = await detail.PATCH(request("PATCH", { revision: 0, atmosphere: "Quiet", notes: "Private notes" }), context);
  assert.equal(changed.status, 200);
  const updated = await changed.json();
  assert.equal(updated.atmosphere, "Quiet");
  assert.equal(updated.notes, "Private notes");
  assert.equal(updated.name, place.name);
  assert.equal(updated.revision, 1);
  assert.ok(Date.parse(updated.updatedAt) > Date.parse("2000-01-01T00:00:00.000Z"), "metadata edits advance Last edited");
  assert.match(updated.firstAppearance, /03 — Arrival$/);
  assert.equal(updated.sceneCount, 2);
  assert.deepEqual(await prisma.scene.findUnique({ where: { id: "scene-later" } }), beforeScene);
  assert.deepEqual(await prisma.characterPlace.findMany(), beforeJoins);
  assert.equal((await detail.PATCH(request("PATCH", { revision: 0, notes: "stale overwrite" }), context)).status, 409);
  assert.equal((await db.getPlace("novel-a", place.id)).updatedAt, updated.updatedAt, "failed saves must not advance Last edited");
  assert.equal((await detail.PATCH(request("PATCH", { revision: 1, updatedAt: "2099-01-01" }), context)).status, 400);
  assert.equal((await db.listPlaces("novel-a")).find((item) => item.id === place.id).updatedAt, updated.updatedAt);
  assert.equal((await db.getPlace("novel-a", place.id)).notes, "Private notes");

  const foreign = await db.createPlace("novel-b", metadata.validatePlaceMetadata({ name: "Foreign" }).data);
  const beforeCount = await prisma.location.count();
  assert.equal((await collection.POST(request("POST", { name: "Invalid child", parentPlaceId: foreign.id }))).status, 409);
  assert.equal(await prisma.location.count(), beforeCount);
  const child = await db.createPlace("novel-a", metadata.validatePlaceMetadata({ name: "Child", parentPlaceId: place.id }).data);
  assert.equal((await detail.PATCH(request("PATCH", { revision: 1, parentPlaceId: child.id }), context)).status, 409);
  assert.equal((await db.getPlace("novel-a", place.id)).revision, 1);
  const peers = await Promise.all([
    detail.PATCH(request("PATCH", { revision: 1, notes: "save-one" }), context),
    detail.PATCH(request("PATCH", { revision: 1, notes: "save-two" }), context)
  ]);
  assert.deepEqual(peers.map((result) => result.status).sort(), [200, 409]);
  assert.equal((await db.getPlace("novel-a", place.id)).revision, 2);
  assert.deepEqual(await prisma.characterPlace.findMany(), beforeJoins);
  assert.equal((await collection.GET(request("GET"))).status, 200);
  assert.equal((await db.listPlaces("novel-a")).some((item) => item.id === foreign.id), false);
  const classifiedResponse = await collection.POST(request("POST", { name: "Building", type: "building", status: "active", notes: "Abandoned" }));
  assert.equal(classifiedResponse.status, 201);
  const classified = await classifiedResponse.json();
  assert.equal((await prisma.location.findUnique({ where: { id: classified.id } })).type, "building");
  assert.equal(classified.status, "active");
  const classifiedContext = { params: Promise.resolve({ placeId: classified.id }) };
  assert.equal((await detail.PATCH(request("PATCH", { revision: 0, status: "Destroyed" }), classifiedContext)).status, 400);
  assert.equal((await collection.POST(request("POST", { name: "Bad", type: "Building" }))).status, 400);
  assert.equal((await detail.PATCH(request("PATCH", { revision: 0, status: "archived" }), classifiedContext)).status, 200);
  assert.equal((await db.getPlace("novel-a", classified.id)).status, "archived");
  await prisma.location.update({ where: { id: classified.id }, data: { type: "Unrecognized legacy", status: "Abandoned" } });
  const fallback = await db.getPlace("novel-a", classified.id);
  assert.equal(fallback.type, "other");
  assert.equal(fallback.status, "active");

  // Real SQLite transactions protect hierarchy edits, not just selector options.
  const createNode = async (name, parentPlaceId = null) => db.createPlace("novel-a", metadata.validatePlaceMetadata({ name, parentPlaceId }).data);
  const root = await createNode("Grecia");
  const finca = await createNode("Finca", root.id);
  const casa = await createNode("Casa", finca.id);
  const rootContext = { params: Promise.resolve({ placeId: root.id }) };
  assert.equal((await detail.PATCH(request("PATCH", { revision: 0, parentPlaceId: root.id }), rootContext)).status, 409);
  assert.equal((await detail.PATCH(request("PATCH", { revision: 0, parentPlaceId: casa.id }), rootContext)).status, 409);
  assert.equal((await detail.PATCH(request("PATCH", { revision: 0, parentPlaceId: foreign.id }), rootContext)).status, 409);
  assert.equal((await db.getPlace("novel-a", root.id)).revision, 0);
  await db.updatePlace("novel-a", root.id, 0, { name: "Grecia renamed", status: "archived" });
  const snapshot = await db.listPlaces("novel-a");
  assert.deepEqual(hierarchy.getPlaceHierarchy("novel-a", finca.id, snapshot).breadcrumb.map((item) => item.name), ["Grecia renamed", "Finca"]);
  assert.equal((await db.getPlace("novel-a", finca.id)).status, "active");
  assert.equal((await db.getPlace("novel-a", finca.id)).revision, 0);
  assert.equal((await db.getPlace("novel-a", finca.id)).parentPlaceId, root.id);
  assert.equal(hierarchy.getPlaceHierarchy("novel-a", root.id, snapshot).children[0].id, finca.id);
  // Parent deletion is now explicitly blocked; children are never silently reparented.
  const parentImpact = await db.getPlaceDeleteImpact("novel-a", root.id);
  await assert.rejects(db.deletePlace("novel-a", root.id, { revision: parentImpact.revision, impact: parentImpact }), /Archive it instead/);
  assert.equal((await db.getPlace("novel-a", finca.id)).parentPlaceId, root.id);
  assert.equal((await db.getPlace("novel-a", casa.id)).parentPlaceId, finca.id);

  const left = await createNode("Left");
  const right = await createNode("Right");
  const reciprocal = await Promise.all([
    detail.PATCH(request("PATCH", { revision: 0, parentPlaceId: right.id }), { params: Promise.resolve({ placeId: left.id }) }),
    detail.PATCH(request("PATCH", { revision: 0, parentPlaceId: left.id }), { params: Promise.resolve({ placeId: right.id }) })
  ]);
  assert.deepEqual(reciprocal.map((result) => result.status).sort(), [200, 409]);
  assert.equal(hierarchy.getPlaceHierarchy("novel-a", left.id, await db.listPlaces("novel-a")).issue, null);

  await prisma.location.createMany({ data: Array.from({ length: hierarchy.MAX_PLACE_DEPTH }, (_, index) => ({
    id: `deep-${index}`, novelId: "novel-a", name: `Deep ${index}`, parentPlaceId: index ? `deep-${index - 1}` : null
  })) });
  assert.equal((await collection.POST(request("POST", { name: "Too deep", parentPlaceId: "deep-63" }))).status, 409);
  assert.equal((await detail.PATCH(request("PATCH", { revision: 0, parentPlaceId: "deep-62" }), { params: Promise.resolve({ placeId: finca.id }) })).status, 409, "subtree depth is revalidated under the write lock");
  assert.equal((await db.getPlace("novel-a", finca.id)).parentPlaceId, root.id);
  assert.equal((await db.getPlace("novel-a", finca.id)).revision, 0);
  const linkInput = await loadTs("lib/scene-place.ts", { "@/lib/studio-routes": routes });
  const linkRoutes = await loadTs("app/api/places/[placeId]/scenes/route.ts", {
    "next/server": require("next/server"), "@/lib/db/scene-places": scenePlaces,
    "@/lib/scene-place": linkInput, "@/lib/place-request": requestContext,
    "@/lib/studio-routes": routes, "@/lib/request-security": security, "../../errors": errors
  });
  const links = (adds, removes = [], novel = "novel-a", headers = {}) => linkRoutes.PATCH(request("PATCH", { addSceneIds: adds, removeSceneIds: removes }, novel, headers), context);
  assert.equal((await links(["scene-later", "scene-later"])).status, 200);
  assert.equal(await prisma.scenePlace.count({ where: { sceneId: "scene-later", locationId: place.id } }), 1);
  await assert.rejects(prisma.scenePlace.create({ data: { sceneId: "scene-later", locationId: place.id } }), /Unique constraint/);
  await assert.rejects(prisma.scenePlace.create({ data: { sceneId: "missing", locationId: place.id } }), /Foreign key/);
  assert.equal((await links(["scene-archived"])).status, 409);
  assert.equal((await links(["scene-first"], [], "novel-b")).status, 404);
  assert.equal((await links(["scene-first"], [], "novel-a", { origin: "https://evil.example" })).status, 403);
  await prisma.volume.create({ data: { id: "vol-b", novelId: "novel-b", title: "B" } });
  await prisma.chapter.create({ data: { id: "ch-b", volumeId: "vol-b", title: "B" } });
  await prisma.scene.create({ data: { id: "scene-foreign", chapterId: "ch-b", title: "Secret foreign title" } });
  assert.equal((await links(["scene-foreign"], ["scene-first"])).status, 409);
  assert.equal(await prisma.scenePlace.count({ where: { sceneId: "scene-first", locationId: place.id } }), 1, "invalid changes roll back all unlinks");
  const options = await (await linkRoutes.GET(request("GET"), context)).json();
  assert.equal(options.some((option) => option.id === "scene-foreign" || option.id === "scene-archived"), false);
  assert.equal(options.some((option) => Object.hasOwn(option, "content") || Object.hasOwn(option, "summary")), false);
  assert.equal((await db.getPlace("novel-a", place.id)).linkedScenes[0].id, "scene-first");
  await prisma.scene.update({ where: { id: "scene-later" }, data: { sortOrder: 0, title: "Earlier renamed" } });
  assert.match((await db.getPlace("novel-a", place.id)).firstAppearance, /Earlier renamed$/);
  const reorderedSummary = (await db.listPlaces("novel-a")).find((item) => item.id === place.id);
  assert.equal(reorderedSummary.firstAppearanceScene.id, "scene-later");
  assert.equal(reorderedSummary.sceneCount, 2);
  assert.equal(Object.hasOwn(reorderedSummary, "linkedScenes"), false);
  assert.equal((await links([], ["scene-later"])).status, 200);
  assert.equal((await db.getPlace("novel-a", place.id)).linkedScenes[0].id, "scene-first");
  assert.equal((await db.getPlace("novel-a", place.id)).sceneCount, 1);
  assert.equal(await prisma.scenePlace.count({ where: { sceneId: "scene-archived", locationId: place.id } }), 1, "archived links remain stored");
  await prisma.chapter.update({ where: { id: "ch-a" }, data: { archived: true } });
  assert.equal((await db.getPlace("novel-a", place.id)).sceneCount, 0);
  assert.equal((await db.getPlace("novel-a", place.id)).firstAppearance, "");
  await prisma.chapter.update({ where: { id: "ch-a" }, data: { archived: false } });
  await prisma.volume.update({ where: { id: "vol-a" }, data: { archived: true } });
  assert.equal((await db.getPlace("novel-a", place.id)).sceneCount, 0);
  await prisma.volume.update({ where: { id: "vol-a" }, data: { archived: false } });
  const anotherPlace = await createNode("Another setting");
  await prisma.$transaction((tx) => scenePlaces.setScenePlaces(tx, "novel-a", "scene-first", [place.id, anotherPlace.id], [place.id]));
  assert.equal((await db.getPlace("novel-a", anotherPlace.id)).sceneCount, 1);
  await assert.rejects(prisma.$transaction((tx) => scenePlaces.setScenePlaces(tx, "novel-a", "scene-first", [], [place.id])), /changed elsewhere/);
  await assert.rejects(prisma.$transaction((tx) => scenePlaces.setScenePlaces(tx, "novel-a", "scene-first", [foreign.id])), /same novel/);
  assert.equal((await links([], ["scene-first", "scene-archived"])).status, 200);
  assert.equal((await db.getPlace("novel-a", place.id)).firstAppearance, "");
  assert.equal((await db.getPlace("novel-a", anotherPlace.id)).sceneCount, 1, "unlink is scoped to one Place");
  assert.equal(await prisma.scene.count({ where: { id: "scene-first" } }), 1);
  assert.equal((await prisma.scene.findUnique({ where: { id: "scene-later" } })).content, "unchanged manuscript");
  const studio = await loadTs("lib/db/studio.ts", {
    "@/lib/db/notes": {},
    "@/lib/db/timeline-position": {},
    "@/lib/timeline-event": {},
    "@/lib/db/timeline-places": await loadTs("lib/db/timeline-places.ts", { "@/lib/db/prisma": { prisma } }),
    "@/lib/db/prisma": { prisma }, "node:crypto": require("node:crypto"), "@/lib/chapter-preview": {},
    "@/lib/character-first-appearance": {}, "@/lib/db/places": db, "@/lib/db/scene-places": scenePlaces,
    "@/lib/reader-progress": {}, "@/lib/studio-settings": {}, "@/lib/character-metadata": {}, "@/lib/character-relationship": {}, "@/lib/character-place": characterPlace
  });
  assert.deepEqual((await studio.getSceneInspector("scene-first")).locationIds, [anotherPlace.id]);
  const inspectorInput = { summary: "summary", objective: "objective", notes: "notes", characterIds: [], locationIds: [place.id, anotherPlace.id], expectedLocationIds: [anotherPlace.id], timelineEventId: null };
  await studio.updateSceneInspector("scene-first", inspectorInput);
  assert.equal((await db.getPlace("novel-a", place.id)).sceneCount, 1);
  assert.equal((await studio.getScene("scene-first")).locationIds.length, 2);
  await assert.rejects(studio.updateSceneInspector("scene-first", inspectorInput), /changed elsewhere/);
  await assert.rejects(studio.updateSceneInspector("scene-first", { ...inspectorInput, locationIds: [foreign.id], expectedLocationIds: [place.id, anotherPlace.id] }), /same novel/);
  await assert.rejects(studio.updateScene("scene-first", { locationId: "" }), /multiple linked places/);
  assert.equal((await studio.getScene("scene-first")).locationIds.length, 2);
  const structure = await loadTs("lib/db/structure.ts", {
    "@/lib/generated/prisma/client": jiti(resolve("lib/generated/prisma/client.ts")),
    "@/lib/db/prisma": { prisma }, "@/lib/db/scene-places": scenePlaces,
    "@/lib/structure-move": await loadTs("lib/structure-move.ts")
  });
  const duplicate = await structure.mutateStructureItem("scene", "scene-first", "duplicate");
  assert.equal((await studio.getScene(duplicate.selection.id)).locationIds.length, 2);
  await structure.mutateStructureItem("scene", duplicate.selection.id, "move", "before");
  assert.equal((await db.getPlace("novel-a", place.id)).linkedScenes[0].id, duplicate.selection.id);

  const sharedRoute = await loadTs("app/api/characters/[characterId]/places/route.ts", {
    "next/server": require("next/server"), "@/lib/db/studio": studio, "@/lib/character-place": characterPlace,
    "@/lib/request-security": security, "@/lib/studio-routes": routes, "@/lib/place-request": requestContext
  });
  const fincaShared = await createNode("Finca shared");
  await prisma.character.createMany({ data: [
    { id: "cp-juana", novelId: "novel-a", name: "Juana", secret: "private secret", notes: "private notes" },
    { id: "cp-foreign", novelId: "novel-b", name: "Foreign" }
  ] });
  const cpContext = { params: Promise.resolve({ characterId: "cp-juana" }) };
  const cpRequest = (method, body, from = "characters/cp-juana", novelId = "novel-a") => new Request(`http://localhost:3000/api/characters/cp-juana/places?novelId=${novelId}`, {
    method, headers: { "Content-Type": "application/json", origin: "http://localhost:3000", referer: `http://localhost:3000/novels/${novelId}/${from}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const cpBody = { locationId: fincaShared.id, relationshipType: "Lives at" };
  assert.equal((await sharedRoute.POST(cpRequest("POST", cpBody), cpContext)).status, 201);
  const joined = await prisma.characterPlace.findMany({ where: { locationId: fincaShared.id } });
  const characterMetadata = await prisma.character.findMany({ select: { id: true, novelId: true, name: true } });
  assert.equal(characterPlace.derivePlaceCharacters(fincaShared, characterMetadata, joined)[0].relationshipType, "Lives at");
  assert.equal((await sharedRoute.POST(cpRequest("POST", { ...cpBody, relationshipType: "Works at" }, `places/${fincaShared.id}`), cpContext)).status, 200);
  assert.equal(await prisma.characterPlace.count({ where: { characterId: "cp-juana", locationId: fincaShared.id } }), 1);
  assert.equal((await studio.listCharacterPlaces("cp-juana", "novel-a"))[0].relationshipType, "Lives at", "duplicate linking never overwrites metadata");
  await prisma.character.update({ where: { id: "cp-juana" }, data: { name: "Juana renamed" } });
  await db.updatePlace("novel-a", fincaShared.id, 0, { name: "Finca renamed" });
  const renamedCharacters = await prisma.character.findMany({ select: { id: true, novelId: true, name: true } });
  assert.equal(characterPlace.derivePlaceCharacters(fincaShared, renamedCharacters, joined)[0].name, "Juana renamed");
  const charView = await (await sharedRoute.GET(cpRequest("GET"), cpContext)).json();
  assert.equal(charView[0].name, "Finca renamed");
  assert.equal((await sharedRoute.DELETE(cpRequest("DELETE", { locationId: fincaShared.id }, `places/${fincaShared.id}`), cpContext)).status, 200);
  assert.deepEqual(await studio.listCharacterPlaces("cp-juana", "novel-a"), []);
  assert.equal(await prisma.characterPlace.count({ where: { locationId: fincaShared.id } }), 0);
  assert.equal(await prisma.character.count({ where: { id: "cp-juana" } }), 1);
  assert.equal(await prisma.location.count({ where: { id: fincaShared.id } }), 1);
  assert.equal((await sharedRoute.POST(cpRequest("POST", { ...cpBody, relationshipType: "Works at" }, `places/${fincaShared.id}`), cpContext)).status, 201);
  assert.equal((await studio.listCharacterPlaces("cp-juana"))[0].relationshipType, "Works at");
  assert.equal((await sharedRoute.DELETE(cpRequest("DELETE", { locationId: fincaShared.id }), cpContext)).status, 200);
  assert.equal((await sharedRoute.POST(cpRequest("POST", { locationId: foreign.id }), cpContext)).status, 409);
  assert.equal((await sharedRoute.POST(cpRequest("POST", cpBody), { params: Promise.resolve({ characterId: "cp-foreign" }) })).status, 409);
  assert.equal((await sharedRoute.POST(cpRequest("POST", { ...cpBody, relationshipType: "arbitrary" }), cpContext)).status, 400);
  assert.equal((await sharedRoute.POST(cpRequest("POST", null), cpContext)).status, 400);
  assert.equal((await sharedRoute.POST(cpRequest("POST", { ...cpBody, novelId: "novel-b" }), cpContext)).status, 409);
  assert.equal((await sharedRoute.GET(cpRequest("GET", undefined, "characters/cp-juana", "novel-b"), cpContext)).status, 409);
  const concurrentLinks = await Promise.all([
    sharedRoute.POST(cpRequest("POST", cpBody), cpContext),
    sharedRoute.POST(cpRequest("POST", cpBody, `places/${fincaShared.id}`), cpContext)
  ]);
  assert.deepEqual(concurrentLinks.map((response) => response.status).sort(), [200, 201]);
  assert.equal(await prisma.characterPlace.count({ where: { characterId: "cp-juana", locationId: fincaShared.id } }), 1);
  await assert.rejects(studio.linkCharacterPlace("cp-juana", fincaShared.id, "invalid"), /relationshipType/);

  // Lifecycle uses the actual API handlers and the same SQLite referential graph.
  const lifecycleHandler = await loadTs("app/api/places/lifecycle.ts", { ...modules, "./errors": errors });
  const archiveRoute = await loadTs("app/api/places/[placeId]/archive/route.ts", { "../../lifecycle": lifecycleHandler });
  const restoreRoute = await loadTs("app/api/places/[placeId]/restore/route.ts", { "../../lifecycle": lifecycleHandler });
  const impactRoute = await loadTs("app/api/places/[placeId]/impact/route.ts", { ...modules, "../../errors": errors });
  const lifePlace = await createNode("Lifecycle place");
  const lifeChild = await createNode("Lifecycle child", lifePlace.id);
  await prisma.scenePlace.create({ data: { sceneId: "scene-archived", locationId: lifePlace.id } });
  await prisma.characterPlace.create({ data: { characterId: "cp-juana", locationId: lifePlace.id, relationshipType: "Lives at" } });
  await prisma.timelineEvent.create({ data: { id: "life-event", novelId: "novel-a", title: "Story event", placeLinks: { create: { locationId: lifePlace.id } } } });
  const lifeContext = { params: Promise.resolve({ placeId: lifePlace.id }) };
  const reviewed = (impact) => ({ confirmed: true, revision: impact.revision, impact: Object.fromEntries(lifecycle.placeImpactKeys.map((key) => [key, impact[key]])) });
  const graph = async () => ({
    scenes: await prisma.scene.findMany({ orderBy: { id: "asc" } }),
    characters: await prisma.character.findMany({ orderBy: { id: "asc" } }),
    events: await prisma.timelineEvent.findMany({ orderBy: { id: "asc" } }),
    sceneLinks: await prisma.scenePlace.findMany({ orderBy: [{ sceneId: "asc" }, { locationId: "asc" }] }),
    characterLinks: await prisma.characterPlace.findMany({ orderBy: [{ characterId: "asc" }, { locationId: "asc" }] }),
    child: await prisma.location.findUnique({ where: { id: lifeChild.id } })
  });
  const intact = await graph();
  const beforePreview = await prisma.location.findUnique({ where: { id: lifePlace.id } });
  const preview = await impactRoute.GET(request("GET"), lifeContext);
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("cache-control"), "no-store");
  const impact = await preview.json();
  assert.deepEqual(lifecycle.placeImpactKeys.map((key) => impact[key]), [1, 1, 1, 1]);
  assert.equal(impact.canDelete, false);
  assert.equal(Object.hasOwn(impact, "notes"), false);
  assert.deepEqual(await prisma.location.findUnique({ where: { id: lifePlace.id } }), beforePreview, "impact GET never mutates");
  const blocked = await detail.DELETE(request("DELETE", reviewed(impact)), lifeContext);
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).code, "PLACE_REFERENCED");
  assert.deepEqual(await graph(), intact);
  assert.equal((await impactRoute.GET(request("GET", undefined, "novel-b"), lifeContext)).status, 404);
  assert.equal((await archiveRoute.POST(request("POST", { confirmed: true, revision: 0 }, "novel-b"), lifeContext)).status, 404);
  assert.equal((await detail.DELETE(request("DELETE", reviewed(impact), "novel-b"), lifeContext)).status, 404);
  assert.equal((await archiveRoute.POST(request("POST", { confirmed: true, revision: 0 }, "novel-a", { origin: "https://evil.example" }), lifeContext)).status, 403);
  assert.equal((await restoreRoute.POST(request("POST", { confirmed: true, revision: 0 }, "novel-b"), lifeContext)).status, 404);
  for (const body of [null, {}, { revision: 0 }, { confirmed: true, revision: -1 }, { confirmed: true, revision: 0, notes: "overwrite" }]) {
    assert.equal((await archiveRoute.POST(request("POST", body), lifeContext)).status, 400);
  }
  assert.equal((await archiveRoute.POST(request("POST", { confirmed: true, revision: 0, novelId: "novel-b" }), lifeContext)).status, 409);
  const archivedResponse = await archiveRoute.POST(request("POST", { confirmed: true, revision: 0 }), lifeContext);
  assert.equal(archivedResponse.status, 200);
  const archived = await archivedResponse.json();
  assert.equal(archived.status, "archived");
  assert.equal(archived.revision, 1);
  assert.deepEqual(await graph(), intact, "archive preserves manuscript, joins, events and children");
  const placeCatalog = await loadTs("lib/place-catalog.ts", { "@/lib/place-classification": classification, "@/lib/studio-routes": routes });
  assert.equal(placeCatalog.filterAndSortPlaces([archived], placeCatalog.defaultPlaceCatalogState).length, 0);
  assert.equal(placeCatalog.filterAndSortPlaces([archived], { ...placeCatalog.defaultPlaceCatalogState, status: "archived" }).length, 1);
  assert.equal((await restoreRoute.POST(request("POST", { confirmed: true, revision: 0 }), lifeContext)).status, 409);
  const restoredResponse = await restoreRoute.POST(request("POST", { confirmed: true, revision: 1 }), lifeContext);
  assert.equal(restoredResponse.status, 200);
  const restored = await restoredResponse.json();
  assert.equal(restored.status, "active");
  assert.equal(placeCatalog.filterAndSortPlaces([restored], placeCatalog.defaultPlaceCatalogState).length, 1);
  assert.deepEqual(await graph(), intact, "restore preserves every relation and child parent ID");
  const { status: oldStatus, revision: oldRevision, updatedAt: oldUpdated, ...oldMetadata } = lifePlace;
  const { status: newStatus, revision: newRevision, updatedAt: newUpdated, ...newMetadata } = restored;
  assert.equal(oldStatus, newStatus); assert.ok(newRevision > oldRevision); assert.ok(newUpdated >= oldUpdated);
  // Linked Scenes are derived; the archived scene added above does not affect active summaries.
  assert.deepEqual(newMetadata, oldMetadata);

  // Each reference category independently prevents deletion, including stale zero-impact confirmations.
  for (const kind of lifecycle.placeImpactKeys) {
    const target = await createNode(`Protected by ${kind}`);
    const targetContext = { params: Promise.resolve({ placeId: target.id }) };
    const emptyImpact = await db.getPlaceDeleteImpact("novel-a", target.id);
    if (kind === "children") await createNode("Protected child", target.id);
    if (kind === "scenes") await prisma.scenePlace.create({ data: { sceneId: "scene-archived", locationId: target.id } });
    if (kind === "characters") await prisma.characterPlace.create({ data: { characterId: "cp-juana", locationId: target.id } });
    if (kind === "events") await prisma.timelineEvent.create({ data: { id: `protect-${kind}`, novelId: "novel-a", title: kind, placeLinks: { create: { locationId: target.id } } } });
    const stale = await detail.DELETE(request("DELETE", reviewed(emptyImpact)), targetContext);
    assert.equal(stale.status, 409);
    const conflict = await stale.json();
    assert.equal(conflict.code, "STALE_IMPACT");
    assert.equal(conflict.impact[kind], 1);
    assert.equal((await detail.DELETE(request("DELETE", reviewed(conflict.impact)), targetContext)).status, 409);
    assert.equal(await prisma.location.count({ where: { id: target.id } }), 1);
  }
  const legacyPlace = await createNode("Legacy scene FK");
  await prisma.$executeRaw`UPDATE Scene SET locationId = ${legacyPlace.id} WHERE id = ${"scene-first"}`;
  const legacyImpact = await db.getPlaceDeleteImpact("novel-a", legacyPlace.id);
  assert.equal(legacyImpact.scenes, 1);
  await assert.rejects(db.deletePlace("novel-a", legacyPlace.id, { revision: legacyImpact.revision, impact: legacyImpact }), /Archive it instead/);
  await prisma.scenePlace.create({ data: { sceneId: "scene-first", locationId: legacyPlace.id } });
  assert.equal((await db.getPlaceDeleteImpact("novel-a", legacyPlace.id)).scenes, 1, "legacy FK and canonical join count as one Scene");

  const disposable = await createNode("Unreferenced place");
  const disposableContext = { params: Promise.resolve({ placeId: disposable.id }) };
  const deleteImpact = await db.getPlaceDeleteImpact("novel-a", disposable.id);
  assert.equal(deleteImpact.canDelete, true);
  for (const body of [null, {}, { ...reviewed(deleteImpact), confirmed: false }, { confirmed: true, revision: 0 }, { ...reviewed(deleteImpact), impact: { scenes: 0 } }]) {
    assert.equal((await detail.DELETE(request("DELETE", body), disposableContext)).status, 400);
  }
  assert.equal((await detail.DELETE(request("DELETE", reviewed(deleteImpact), "novel-a", { origin: "https://evil.example" }), disposableContext)).status, 403);
  await db.updatePlace("novel-a", disposable.id, 0, { name: "Edited after preview" });
  assert.equal((await detail.DELETE(request("DELETE", reviewed(deleteImpact)), disposableContext)).status, 409);
  const freshImpact = await db.getPlaceDeleteImpact("novel-a", disposable.id);
  const beforeDelete = await graph();
  assert.equal((await detail.DELETE(request("DELETE", reviewed(freshImpact)), disposableContext)).status, 200);
  assert.equal(await prisma.location.count({ where: { id: disposable.id } }), 0);
  assert.deepEqual(await graph(), beforeDelete, "deleting an unreferenced Place changes no related entity");

  const racingPlace = await createNode("Concurrent link and delete");
  const racingImpact = await db.getPlaceDeleteImpact("novel-a", racingPlace.id);
  const results = await Promise.allSettled([
    db.deletePlace("novel-a", racingPlace.id, { revision: racingImpact.revision, impact: racingImpact }),
    scenePlaces.changePlaceScenes("novel-a", racingPlace.id, { addSceneIds: ["scene-first"], removeSceneIds: [] })
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const survivingPlace = await prisma.location.findUnique({ where: { id: racingPlace.id } });
  assert.equal(await prisma.scenePlace.count({ where: { locationId: racingPlace.id } }), survivingPlace ? 1 : 0);
  assert.equal(await prisma.scene.count({ where: { id: "scene-first" } }), 1);

  // Exercise the existing server deep-link guards against real SQLite ownership.
  const navigationModules = {
    "react/jsx-runtime": require("react/jsx-runtime"), "@/app/page": { default: () => null },
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
    "@/lib/db/studio": studio, "@/lib/studio-routes": routes
  };
  const placePage = await loadTs("app/novels/[novelId]/places/[placeId]/page.tsx", navigationModules);
  const scenePage = await loadTs("app/novels/[novelId]/editor/[sceneId]/page.tsx", navigationModules);
  const characterPage = await loadTs("app/novels/[novelId]/characters/[characterId]/page.tsx", navigationModules);
  const timelineDb = await loadTs("lib/db/timeline-places.ts", { "@/lib/db/prisma": { prisma } });
  const eventPage = await loadTs("app/novels/[novelId]/timeline/[eventId]/page.tsx", { ...navigationModules, "@/lib/db/timeline-places": timelineDb });
  const beforeNavigation = await graph();
  const beforePlaceNavigation = await prisma.location.findMany({ orderBy: { id: "asc" } });
  const beforeNovelNavigation = await prisma.novel.findMany({ orderBy: { id: "asc" } });
  for (const [page, key, id] of [[placePage, "placeId", lifePlace.id], [scenePage, "sceneId", "scene-first"], [characterPage, "characterId", "cp-juana"], [eventPage, "eventId", "life-event"]]) {
    for (let refresh = 0; refresh < 2; refresh++) assert.ok(await page.default({ params: Promise.resolve({ novelId: "novel-a", [key]: id }) }));
    await assert.rejects(page.default({ params: Promise.resolve({ novelId: "novel-b", [key]: id }) }), /NOT_FOUND/);
    await assert.rejects(page.default({ params: Promise.resolve({ novelId: "novel-a", [key]: "missing-id" }) }), /NOT_FOUND/);
    await assert.rejects(page.default({ params: Promise.resolve({ novelId: "novel-a", [key]: "../invalid" }) }), /NOT_FOUND/);
  }
  assert.deepEqual(await graph(), beforeNavigation, "route GET and refresh preserve all narrative entities and links");
  assert.deepEqual(await prisma.location.findMany({ orderBy: { id: "asc" } }), beforePlaceNavigation);
  assert.deepEqual(await prisma.novel.findMany({ orderBy: { id: "asc" } }), beforeNovelNavigation);

  // A large catalog has the same query budget as a single Place and never reads
  // or transmits the 500 full narrative profiles, even with linked entities.
  await prisma.novel.create({ data: { id: "large-cast", title: "Large cast" } });
  await prisma.volume.create({ data: { id: "large-volume", novelId: "large-cast", title: "Volume" } });
  await prisma.chapter.create({ data: { id: "large-chapter", volumeId: "large-volume", title: "Chapter" } });
  await prisma.scene.create({ data: { id: "large-scene", chapterId: "large-chapter", title: "Arrival", content: "PRIVATE-BODY" } });
  await prisma.character.create({ data: { id: "large-character", novelId: "large-cast", name: "Character", notes: "PRIVATE-NOTES" } });
  const largePlaces = Array.from({ length: 500 }, (_, index) => ({ id: `large-place-${index}`, novelId: "large-cast", name: `Place ${index}`, notes: "PRIVATE-NOTES", description: "PRIVATE-DESCRIPTION" }));
  await prisma.location.create({ data: largePlaces[0] });
  await prisma.scenePlace.create({ data: { sceneId: "large-scene", locationId: largePlaces[0].id } });
  await prisma.characterPlace.create({ data: { characterId: "large-character", locationId: largePlaces[0].id } });
  readQueries.length = 0;
  await db.listPlaces("large-cast");
  const smallQueryCount = readQueries.length;
  await prisma.location.createMany({ data: largePlaces.slice(1).map((item) => ({ ...item, parentPlaceId: largePlaces[0].id })) });
  await prisma.scenePlace.createMany({ data: largePlaces.slice(1).map((item) => ({ sceneId: "large-scene", locationId: item.id })) });
  await prisma.characterPlace.createMany({ data: largePlaces.slice(1).map((item) => ({ characterId: "large-character", locationId: item.id })) });
  await prisma.timelineEvent.create({ data: { id: "large-event", novelId: "large-cast", title: "Event", description: "PRIVATE-EVENT", placeLinks: { create: { locationId: largePlaces[0].id } } } });
  readQueries.length = 0;
  const largeCatalog = await db.listPlaces("large-cast");
  assert.equal(largeCatalog.length, 500);
  assert.equal(readQueries.length, smallQueryCount, "no query per Place");
  assert.ok(readQueries.length <= 10, "bounded metadata query budget");
  assert.doesNotMatch(readQueries.join("\n"), /[".]\b(notes|description|content|visualNotes|rules|atmosphere|secret)\b/i);
  for (const item of largeCatalog) {
    assert.equal(item.sceneCount, 1);
    assert.equal(item.characterCount, 1);
    assert.equal(item.firstAppearanceScene.id, "large-scene");
    for (const key of ["notes", "description", "visualNotes", "atmosphere", "rules", "linkedScenes"]) assert.equal(Object.hasOwn(item, key), false);
  }
  assert.equal(largeCatalog.find((item) => item.id === largePlaces[0].id).childCount, 499);
  assert.equal(largeCatalog.find((item) => item.id === largePlaces[0].id).eventCount, 1);
  assert.deepEqual(largeCatalog.find((item) => item.id === largePlaces[1].id).parent, { id: largePlaces[0].id, name: "Place 0" });
  const largeResponse = await collection.GET(request("GET", undefined, "large-cast"));
  assert.equal(largeResponse.status, 200);
  assert.doesNotMatch(await largeResponse.text(), /PRIVATE-/);
  assert.equal((await db.getPlace("large-cast", largePlaces[0].id)).notes, "PRIVATE-NOTES", "only selected detail returns full metadata");
  // Corrupt legacy links must not expose or count a different novel's entities.
  await prisma.scenePlace.create({ data: { sceneId: "scene-foreign", locationId: largePlaces[0].id } });
  await prisma.characterPlace.create({ data: { characterId: "character-a", locationId: largePlaces[0].id } });
  await prisma.timelineEvent.create({ data: { id: "foreign-large-event", novelId: "novel-a", title: "Hidden", placeLinks: { create: { locationId: largePlaces[0].id } } } });
  await prisma.location.update({ where: { id: largePlaces[0].id }, data: { parentPlaceId: foreign.id } });
  const safe = (await db.listPlaces()).find((item) => item.id === largePlaces[0].id);
  assert.equal(safe.sceneCount, 1);
  assert.equal(safe.characterCount, 1);
  assert.equal(safe.eventCount, 1);
  assert.equal(safe.parent, null);
  assert.equal(safe.firstAppearanceScene.id, "large-scene");
});
