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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
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
const metadata = await loadTs("lib/place-metadata.ts", { "@/lib/place-classification": classification, "@/lib/studio-routes": routes });
const requestContext = await loadTs("lib/place-request.ts", { "@/lib/studio-routes": routes });
const security = await loadTs("lib/request-security.ts");

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
    assert.equal(migratePlaceMetadata(database).length, 4);
    assert.deepEqual(migratePlaceMetadata(database), []);
    assert.deepEqual(database.prepare("SELECT * FROM Location").get(), {
      id: "existing", notes: "keep", status: "active", atmosphere: "", revision: 0, parentPlaceId: null
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
  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databasePath }) });
  after(async () => { await prisma.$disconnect(); await rm(directory, { recursive: true, force: true }); });
  const db = await loadTs("lib/db/places.ts", { "@/lib/db/prisma": { prisma }, "@/lib/place-metadata": metadata, "@/lib/place-classification": classification });
  const errors = await loadTs("app/api/places/errors.ts", { "next/server": require("next/server"), "@/lib/db/places": db });
  const modules = {
    "next/server": require("next/server"), "@/lib/db/places": db,
    "@/lib/db/studio": { novelExistsForRoute: async (id) => Boolean(await prisma.novel.findUnique({ where: { id } })) },
    "@/lib/place-metadata": metadata, "@/lib/place-request": requestContext,
    "@/lib/studio-routes": routes, "@/lib/request-security": security,
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
    { id: "scene-later", chapterId: "ch-a", title: "Later", sortOrder: 8, locationId: place.id, content: "unchanged manuscript" },
    { id: "scene-first", chapterId: "ch-a", title: "Arrival", sortOrder: 3, locationId: place.id },
    { id: "scene-archived", chapterId: "ch-a", title: "Archived", sortOrder: 1, locationId: place.id, archived: true }
  ] });
  await prisma.character.create({ data: { id: "character-a", novelId: "novel-a", name: "Author's character" } });
  await prisma.characterPlace.create({ data: { characterId: "character-a", locationId: place.id } });
  const beforeScene = await prisma.scene.findUnique({ where: { id: "scene-later" } });
  const beforeJoins = await prisma.characterPlace.findMany();
  const changed = await detail.PATCH(request("PATCH", { revision: 0, atmosphere: "Quiet", notes: "Private notes" }), context);
  assert.equal(changed.status, 200);
  const updated = await changed.json();
  assert.equal(updated.atmosphere, "Quiet");
  assert.equal(updated.notes, "Private notes");
  assert.equal(updated.name, place.name);
  assert.equal(updated.revision, 1);
  assert.match(updated.firstAppearance, /03 — Arrival$/);
  assert.equal(updated.sceneCount, 3);
  assert.deepEqual(await prisma.scene.findUnique({ where: { id: "scene-later" } }), beforeScene);
  assert.deepEqual(await prisma.characterPlace.findMany(), beforeJoins);
  assert.equal((await detail.PATCH(request("PATCH", { revision: 0, notes: "stale overwrite" }), context)).status, 409);
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
});
