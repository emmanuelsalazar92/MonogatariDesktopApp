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
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
const position = await loadTs("lib/timeline-position.ts");
const eventContract = await loadTs("lib/timeline-event.ts", { "./timeline-position": position });
const contract = await loadTs("lib/timeline-place.ts", { "@/lib/studio-routes": routes, "./timeline-position": position });
const security = await loadTs("lib/request-security.ts");
const requestContext = await loadTs("lib/place-request.ts", { "@/lib/studio-routes": routes });

test("Timeline Place contract allowlists IDs and requires the previous association", () => {
  assert.deepEqual(contract.readTimelinePlaceChange({ locationId: "p", linked: true, expectedLinked: false }), { locationId: "p", linked: true, expectedLinked: false });
  assert.deepEqual(contract.readTimelinePlaceChange({ locationId: "p", linked: false, expectedLinked: true }), { locationId: "p", linked: false, expectedLinked: true });
  for (const body of [null, [], {}, { locationId: "p" }, { locationId: "../p", expectedLocationId: null }, { locationId: null, expectedLocationId: "" }, { locationId: 4, expectedLocationId: null }, { locationId: "p", expectedLocationId: null, description: "body" }]) {
    assert.equal(contract.readTimelinePlaceChange(body), null);
  }
});

test("Story Events derive scoped, minimal, deterministic chronology from Timeline", () => {
  const place = { id: "p", novelId: "a" };
  const event = { novelId: "a", locationIds: ["p"], title: "Same title", description: "private body", isSpoiler: false };
  const events = [
    { ...event, id: "late", internalDate: "Day 10", sortIndex: 2048 },
    { ...event, id: "early-b", internalDate: "Day 2", sortIndex: 1024 },
    { ...event, id: "early-a", internalDate: "Day 2", sortIndex: 1024, isSpoiler: true },
    { ...event, id: "undated", internalDate: "", sortIndex: 3072 },
    { ...event, id: "foreign", internalDate: "Day 1", novelId: "b" },
    { ...event, id: "unlinked", internalDate: "Day 1", locationIds: [] },
    { ...event, id: "../invalid", internalDate: "Day 1" }
  ];
  const result = contract.derivePlaceStoryEvents(place, events);
  assert.deepEqual(result.map((item) => item.id), ["early-a", "early-b", "late", "undated"]);
  assert.equal(result[0].isSpoiler, true);
  assert.equal(result.some((item) => Object.hasOwn(item, "description")), false);
  assert.equal(events[0].id, "late", "derivation must not reorder the canonical input");
  events[0].title = "Renamed event";
  assert.equal(contract.derivePlaceStoryEvents(place, events)[2].title, "Renamed event");
  assert.deepEqual(contract.derivePlaceStoryEvents({ ...place, id: "empty" }, events), []);
  const places = [{ ...place, name: "Old name" }, { id: "foreign", novelId: "b", name: "Hidden" }];
  places[0].name = "New name";
  assert.equal(contract.resolveTimelinePlaces(event, places)[0].name, "New name");
  assert.deepEqual(contract.resolveTimelinePlaces({ ...event, locationIds: ["foreign"] }, places), []);
  assert.deepEqual(contract.resolveTimelinePlaces({ ...event, locationIds: ["missing"] }, places), []);
});

test("Timeline event deep links round-trip IDs and reject malicious route IDs", () => {
  const url = routes.routeForTimelineEvent("novel-a", "event-1");
  assert.equal(url, "/novels/novel-a/timeline/event-1");
  assert.deepEqual(routes.parseStudioRoute(url), { page: "timeline", novelId: "novel-a", eventId: "event-1" });
  for (const url of ["/novels/a/timeline/%2Fevent", "/novels/a/timeline/%ZZ", "/novels/a/timeline/../p"]) assert.equal(routes.parseStudioRoute(url), null);
});

test("Story Events render semantic navigation, escaped text and a real empty state", async () => {
  const element = (tag) => function TestElement({ children, ...props }) { return React.createElement(tag, props, children); };
  const { PlaceStoryEvents } = await loadTs("components/studio/place-story-events.tsx", {
    react: React, "react/jsx-runtime": require("react/jsx-runtime"),
    "next/link": { default: element("a") },
    "@/components/ui/button": { Button: ({ variant, size, ...props }) => React.createElement("button", { ...props, "data-variant": variant, "data-size": size }) },
    "@/components/ui/label": { Label: element("label") },
    "@/components/ui/select": {
      Select: ({ children }) => React.createElement("div", null, children),
      SelectTrigger: element("button"), SelectValue: () => null,
      SelectContent: element("div"), SelectItem: ({ children }) => React.createElement("div", null, children)
    },
    "@/lib/timeline-place": contract, "@/lib/studio-routes": routes
  });
  const props = { place: { id: "p", novelId: "a" }, onChanged: async () => {} };
  const empty = renderToStaticMarkup(React.createElement(PlaceStoryEvents, { ...props, events: [] }));
  assert.match(empty, /No story events linked yet/);
  const rendered = renderToStaticMarkup(React.createElement(PlaceStoryEvents, { ...props, events: [
    { id: "e", novelId: "a", locationIds: ["p"], title: "<script>bad</script>", description: "private body", internalDate: "Day 1", isSpoiler: true }
  ] }));
  assert.match(rendered, /href="\/novels\/a\/timeline\/e"/);
  assert.match(rendered, /&lt;script&gt;/);
  assert.match(rendered, /Unlink/);
  assert.doesNotMatch(rendered, /<script>|private body/);
});

test("Timeline Place API uses the canonical FK with ownership, stale checks and entity-preserving unlink", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "monogatari-timeline-place-tests-"));
  let prisma;
  t.after(async () => { await prisma?.$disconnect(); await rm(directory, { recursive: true, force: true }); });
  const databasePath = join(directory, "test.db");
  const sql = execFileSync(process.execPath, [
    require.resolve("prisma/build/index.js"), "migrate", "diff", "--from-empty", "--to-schema", resolve("prisma/schema.prisma"), "--script"
  ], { encoding: "utf8", maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  const database = new Database(databasePath);
  database.exec(sql); database.close();
  const jiti = createJiti(import.meta.url);
  const { PrismaClient } = jiti(resolve("lib/generated/prisma/client.ts"));
  prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databasePath }) });
  const db = await loadTs("lib/db/timeline-places.ts", { "@/lib/db/prisma": { prisma } });
  const positionDb = await loadTs("lib/db/timeline-position.ts", { "@/lib/db/prisma": { prisma }, "@/lib/timeline-position": position, "./timeline-places": db });
  const studio = await loadTs("lib/db/studio.ts", {
    "@/lib/db/notes": {},
    "@/lib/db/timeline-position": positionDb,
    "@/lib/timeline-event": eventContract,
    "@/lib/db/prisma": { prisma }, "@/lib/db/timeline-places": db, "node:crypto": require("node:crypto"),
    "@/lib/chapter-preview": {}, "@/lib/character-first-appearance": {}, "@/lib/db/places": {},
    "@/lib/character-place": {}, "@/lib/db/scene-places": {}, "@/lib/reader-progress": {},
    "@/lib/studio-settings": {}, "@/lib/character-metadata": {}, "@/lib/character-relationship": {}
  });
  const errors = await loadTs("app/api/timeline-events/errors.ts", { "next/server": require("next/server"), "@/lib/db/timeline-places": db });
  const modules = {
    "next/server": require("next/server"), "@/lib/db/studio": studio, "@/lib/db/timeline-places": db,
    "@/lib/timeline-place": contract, "@/lib/place-request": requestContext, "@/lib/request-security": security,
    "@/lib/studio-routes": routes, "./errors": errors, "../errors": errors, "../../errors": errors, "@/lib/timeline-event": eventContract,
    "@/lib/timeline-position": position, "@/lib/db/timeline-position": positionDb
  };
  const collection = await loadTs("app/api/timeline-events/route.ts", modules);
  const association = await loadTs("app/api/timeline-events/[eventId]/place/route.ts", modules);
  const request = (method, body, novelId = "a", headers = {}) => new Request(`http://localhost:3000/api/timeline-events?novelId=${novelId}`, {
    method, headers: { "Content-Type": "application/json", origin: "http://localhost:3000", ...headers }, body: JSON.stringify(body)
  });
  await prisma.novel.createMany({ data: [{ id: "a", title: "A" }, { id: "b", title: "B" }] });
  await prisma.location.createMany({ data: [{ id: "p", novelId: "a", name: "Place" }, { id: "q", novelId: "a", name: "Other" }, { id: "foreign", novelId: "b", name: "Hidden" }] });
  const create = (overrides = {}, novelId = "a", headers) => collection.POST(request("POST", { novelId, title: "Arrival", internalDate: "Day 1", description: "Do not duplicate this body", locationId: "p", ...overrides }, novelId, headers));
  const created = await create();
  assert.equal(created.status, 201);
  const event = await created.json();
  const context = { params: Promise.resolve({ eventId: event.id }) };
  const change = (body, novelId = "a", headers, target = context) => association.PATCH(request("PATCH", body, novelId, headers), target);
  const place = await prisma.location.findUnique({ where: { id: "p" } });
  const events = async () => (await prisma.timelineEvent.findMany({ include: db.timelineLinksInclude })).map(row => ({ ...row, locationIds: row.placeLinks.map(link => link.locationId), characterIds: row.characterLinks.map(link => link.characterId) }));
  assert.equal(contract.derivePlaceStoryEvents(place, await events())[0].id, event.id);
  assert.equal(await db.timelineEventBelongsToNovelForRoute("a", event.id), true);
  assert.equal(await db.timelineEventBelongsToNovelForRoute("b", event.id), false);
  assert.equal(await db.timelineEventBelongsToNovelForRoute("a", "missing"), false);

  const beforeRename = await prisma.timelineEvent.findUnique({ where: { id: event.id } });
  await prisma.location.update({ where: { id: "p" }, data: { name: "Renamed Place" } });
  assert.equal(contract.resolveTimelinePlaces(event, await prisma.location.findMany())[0].name, "Renamed Place");
  assert.deepEqual(await prisma.timelineEvent.findUnique({ where: { id: event.id } }), beforeRename);
  assert.equal((await create({ locationId: "foreign" })).status, 409);
  assert.equal((await create({ locationId: "missing" })).status, 409);
  assert.equal((await create({ locationId: "../p" })).status, 400);
  assert.equal((await create({ locationId: 42 })).status, 400);
  assert.equal((await create({ locationId: "" }, "missing")).status, 404);
  assert.equal((await create({}, "a", { origin: "https://evil.example" })).status, 403);
  assert.equal((await create({}, "a", { referer: "http://localhost:3000/novels/b/timeline" })).status, 409);
  assert.equal((await collection.POST(request("POST", null))).status, 400);
  assert.equal(await prisma.timelineEvent.count(), 1, "rejected creates leave no event rows");

  const unlink = { locationId: "p", linked: false, expectedLinked: true };
  assert.equal((await change(unlink, "b")).status, 404);
  assert.equal((await change({ locationId: "foreign", linked: true, expectedLinked: false })).status, 409);
  assert.equal((await change({ locationId: "missing", linked: true, expectedLinked: false })).status, 409);
  assert.equal((await change({ ...unlink, novelId: "b" })).status, 409);
  assert.equal((await change(unlink, "a", { origin: "https://evil.example" })).status, 403);
  assert.equal((await change(unlink, "a", { referer: "http://localhost:3000/novels/b/places/p" })).status, 409);
  for (const body of [null, {}, { ...unlink, locationId: "../p" }, { ...unlink, title: "overwrite" }]) assert.equal((await change(body)).status, 400);
  const unlinked = await change(unlink);
  assert.equal(unlinked.status, 200);
  assert.deepEqual(await unlinked.json(), { id: event.id, novelId: "a", locationId: "p", linked: false, positionRevision: 1 });
  assert.deepEqual(contract.derivePlaceStoryEvents(place, await events()), []);
  assert.equal(await prisma.timelineEvent.count(), 1);
  assert.equal(await prisma.location.count(), 3);
  assert.equal((await events())[0].description, event.description);
  assert.equal((await change({ locationId: "p", linked: true, expectedLinked: false })).status, 200);
  assert.equal((await change({ locationId: "q", linked: true, expectedLinked: false })).status, 200);
  assert.deepEqual((await events())[0].locationIds, ["p", "q"]);
  assert.equal((await change(unlink)).status, 200);
  assert.equal((await change(unlink)).status, 409, "stale unlink cannot touch another Place");
  assert.deepEqual((await events())[0].locationIds, ["q"]);
  const concurrent = await Promise.all([change({ locationId: "p", linked: true, expectedLinked: false }), change({ locationId: "p", linked: true, expectedLinked: false })]);
  assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409]);
  assert.equal(await prisma.timelineEvent.count(), 1);

  const before = await events();
  const page = await loadTs("app/novels/[novelId]/timeline/[eventId]/page.tsx", {
    "react/jsx-runtime": require("react/jsx-runtime"), "@/app/page": { default: () => null },
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
    "@/lib/db/timeline-places": db, "@/lib/studio-routes": routes
  });
  assert.ok(await page.default({ params: Promise.resolve({ novelId: "a", eventId: event.id }) }));
  await assert.rejects(page.default({ params: Promise.resolve({ novelId: "b", eventId: event.id }) }), /NOT_FOUND/);
  await assert.rejects(page.default({ params: Promise.resolve({ novelId: "a", eventId: "../bad" }) }), /NOT_FOUND/);
  assert.deepEqual(await events(), before, "route GET is read-only");

  // Independent chronology, Structure ownership, manual insertion, and optimistic concurrency.
  const positionRoute = await loadTs("app/api/timeline-events/[eventId]/position/route.ts", modules);
  await prisma.volume.createMany({ data: [{ id: "va", novelId: "a", title: "Volume A", sortOrder: 1 }, { id: "vb", novelId: "b", title: "Volume B", sortOrder: 1 }] });
  await prisma.chapter.createMany({ data: [{ id: "c10", volumeId: "va", title: "Chapter 10", sortOrder: 10 }, { id: "c2", volumeId: "va", title: "Chapter 2", sortOrder: 2 }, { id: "cb", volumeId: "vb", title: "Foreign", sortOrder: 1 }] });
  await prisma.scene.createMany({ data: [{ id: "sa", chapterId: "c10", title: "Arrival", sortOrder: 1 }, { id: "sb", chapterId: "cb", title: "Foreign", sortOrder: 1 }] });
  const e1 = await (await create({ title: "Earlier, told later", sortIndex: 100, chapterId: "c10" })).json();
  const e2 = await (await create({ title: "Later, told earlier", sortIndex: 300, chapterId: "c2" })).json();
  const eMiddle = await (await create({ title: "Between", sortIndex: 200, internalDate: "" })).json();
  assert.deepEqual([e2, eMiddle, e1].sort(position.compareChronology).map(e => e.title), [e1.title, "Between", e2.title]);
  assert.equal(e1.chapterId, "c10"); assert.equal(e2.chapterId, "c2"); assert.equal(eMiddle.chapterId, ""); assert.equal(eMiddle.internalDate, "");
  const patch = (id, body, novelId = "a", headers) => positionRoute.PATCH(request("PATCH", body, novelId, headers), { params: Promise.resolve({ eventId: id }) });
  const positionBody = { sortIndex: 100, internalDate: "Third day", chapterId: "c10", positionRevision: 0 };
  assert.equal((await patch(e1.id, positionBody)).status, 200);
  const renamed = await prisma.timelineEvent.findUnique({ where: { id: e1.id } });
  assert.equal(renamed.sortIndex, 100); assert.equal(renamed.internalDate, "Third day"); assert.equal(renamed.description, e1.description); assert.equal(await prisma.timelineEventPlace.count({ where: { eventId: e1.id, locationId: "p" } }), 1);
  assert.equal((await patch(e1.id, positionBody)).status, 409, "stale confirmation cannot overwrite the new position");
  for (const bad of [{ sortIndex: "200" }, { sortIndex: 1.5 }, { sortIndex: 1000000001 }, { chronologyKind: "exact" }, { volumeId: "vb" }, { chapterId: "cb" }, { sceneId: "sb" }, { sceneId: "sa", chapterId: "c2" }, { chapterId: "c10", volumeId: "vb" }, { sceneId: "missing" }, { sceneId: 42 }]) {
    const response = await patch(e1.id, { ...positionBody, positionRevision: 1, ...bad });
    assert.ok([400, 409].includes(response.status), JSON.stringify(bad));
  }
  assert.equal((await patch(e1.id, { ...positionBody, positionRevision: 1 }, "b")).status, 409);
  assert.equal((await patch(e1.id, { ...positionBody, positionRevision: 1 }, "a", { origin: "https://evil.example" })).status, 403);
  assert.deepEqual(await prisma.timelineEvent.findUnique({ where: { id: e1.id } }), renamed, "failed updates roll back every position field");
  const concurrentPositions = await Promise.all([patch(e1.id, { ...positionBody, positionRevision: 1, sortIndex: 150 }), patch(e1.id, { ...positionBody, positionRevision: 1, sortIndex: 250 })]);
  assert.deepEqual(concurrentPositions.map(r => r.status).sort(), [200, 409]);
  const sceneEvent = await (await create({ sceneId: "sa", internalDate: "", chronologyKind: "relative", relativeDay: -20, relativeMinute: 42 })).json();
  assert.equal(sceneEvent.chapterId, "c10"); assert.equal(sceneEvent.volumeId, "va"); assert.equal(sceneEvent.relativeDay, -20);
  for (const bad of [{ volumeId: "vb" }, { chapterId: "cb" }, { sceneId: "sb" }, { sceneId: "sa", chapterId: "c2" }, { sortIndex: "123" }, { relativeDay: 0 }, { chronologyKind: "relative" }]) assert.ok([400, 409].includes((await create(bad)).status));
  const noDate = await (await create({ internalDate: undefined, locationId: "" })).json();
  assert.equal(noDate.internalDate, ""); assert.equal(noDate.chronologyKind, "manual"); assert.equal(noDate.chapterId, "");
  assert.equal(noDate.sortIndex, sceneEvent.sortIndex + 1024, "append uses numeric order only");
  const eventRoute = await loadTs("app/api/timeline-events/[eventId]/route.ts", modules);
  const getDetail = (novelId, id, spoilers = false) => eventRoute.GET(new Request(`http://localhost:3000/api/timeline-events/${id}?novelId=${novelId}&spoilers=${spoilers}`), { params: Promise.resolve({ eventId: id }) });
  assert.equal((await getDetail("b", noDate.id)).status, 404);
  const beforeRead = await prisma.timelineEvent.findUnique({ where: { id: noDate.id } });
  assert.equal((await getDetail("a", noDate.id)).status, 200);
  assert.deepEqual(await prisma.timelineEvent.findUnique({ where: { id: noDate.id } }), beforeRead);
  await prisma.timelineEvent.update({ where: { id: noDate.id }, data: { isSpoiler: true } });
  const getCatalog = (novelId, visibility = "false") => collection.GET(new Request(`http://localhost:3000/api/timeline-events?novelId=${novelId}&spoilers=${visibility}`));
  const visibleCatalog = await getCatalog("a");
  assert.equal(visibleCatalog.headers.get("Cache-Control"), "private, no-store");
  const visibleRows = await visibleCatalog.json();
  assert.equal(visibleRows.some(row => row.id === noDate.id || row.isSpoiler || row.novelId !== "a" || Object.hasOwn(row, "description")), false);
  assert.equal((await (await getCatalog("a", "true")).json()).some(row => row.id === noDate.id), true);
  assert.deepEqual(await (await getCatalog("a", "invalid")).json(), visibleRows);
  assert.equal((await (await getCatalog("b", "true")).json()).some(row => row.id === noDate.id), false);
  assert.equal((await getCatalog("../bad")).status, 400);
  assert.equal((await studio.listTimelineEventSummaries()).some(row => row.isSpoiler || Object.hasOwn(row, "description")), false);
  const hidden = await getDetail("a", noDate.id), missing = await getDetail("a", "missing");
  assert.equal(hidden.status, 404); assert.deepEqual(await hidden.json(), await missing.json());
  assert.equal((await studio.listTimelineEventSummaries("a", false, "all", noDate.id)).some(row => row.id === noDate.id), false);
  assert.equal((await getDetail("a", noDate.id, true)).status, 200);
  await prisma.timelineEvent.update({ where: { id: noDate.id }, data: { isSpoiler: false } });
  await prisma.character.createMany({ data: [{ id: "person-a", novelId: "a", name: "Juana" }, { id: "person-b", novelId: "b", name: "Foreign" }] });
  const editBody = { ...eventContract.readTimelineEvent(noDate).data, positionRevision: 0, title: "Edited title", description: "Edited description", isSpoiler: true, characterIds: ["person-a"], locationIds: ["p"] };
  const edit = (body, novelId = "a", headers) => eventRoute.PATCH(request("PATCH", body, novelId, headers), { params: Promise.resolve({ eventId: noDate.id }) });
  for (const invalid of [{ title: " " }, { title: "a".repeat(201) }, { description: "a".repeat(5001) }, { isSpoiler: "yes" }, { characterIds: ["person-b"] }, { characterIds: ["missing"] }, { locationId: "foreign" }, { chapterId: "cb" }, { unknownField: "x" }]) assert.ok([400, 409].includes((await edit({ ...editBody, ...invalid })).status));
  assert.equal((await edit(editBody, "b")).status, 409);
  assert.equal((await edit(editBody, "a", { origin: "https://evil.example" })).status, 403);
  const edited = await edit(editBody); assert.equal(edited.status, 200);
  const editedEvent = await edited.json(); assert.equal(editedEvent.title, "Edited title"); assert.deepEqual(editedEvent.characterIds, ["person-a"]); assert.equal(editedEvent.isSpoiler, true);
  assert.equal((await edit(editBody)).status, 409);
  await db.changeTimelinePlace("a", noDate.id, { locationId: "q", linked: true, expectedLinked: false });
  assert.equal((await edit({ ...editBody, positionRevision: editedEvent.positionRevision })).status, 409, "an open editor cannot overwrite a Place association changed elsewhere");
  assert.equal(await prisma.character.count(), 2); assert.equal(await prisma.location.count(), 3);
  assert.equal((await create({ characterIds: ["person-b"] })).status, 409);
  assert.equal((await create({ characterIds: [42] })).status, 400);
  await prisma.character.create({ data: { id: "person-c", novelId: "a", name: "Juancho", secret: "PRIVATE_SECRET", notes: "PRIVATE_NOTES" } });
  const multipleResponse = await create({ locationId: undefined, locationIds: ["p", "q", "p"], characterIds: ["person-a", "person-c", "person-a"] });
  assert.equal(multipleResponse.status, 201);
  const multiple = await multipleResponse.json();
  assert.deepEqual(multiple.locationIds, ["p", "q"]); assert.deepEqual(multiple.characterIds, ["person-a", "person-c"]);
  assert.doesNotMatch(JSON.stringify(multiple), /PRIVATE_SECRET|PRIVATE_NOTES|characterLinks|placeLinks/);
  await assert.rejects(prisma.timelineEventCharacter.create({ data: { eventId: multiple.id, characterId: "person-a" } }), { code: "P2002" });
  await assert.rejects(prisma.timelineEventPlace.create({ data: { eventId: multiple.id, locationId: "p" } }), { code: "P2002" });
  await assert.rejects(prisma.timelineEventPlace.create({ data: { eventId: multiple.id, locationId: "missing" } }), { code: "P2003" });
  await assert.rejects(prisma.character.delete({ where: { id: "person-c" } }), { code: "P2003" });
  await assert.rejects(prisma.location.delete({ where: { id: "q" } }), { code: "P2003" });
  assert.equal((await studio.getCharacterDeleteImpact("person-c")).canDelete, false);
  const multipleContext = { params: Promise.resolve({ eventId: multiple.id }) };
  const saveMultiple = body => eventRoute.PATCH(request("PATCH", body), multipleContext);
  const batch = { ...eventContract.readTimelineEvent(multiple).data, positionRevision: multiple.positionRevision };
  const beforeBatch = await prisma.timelineEvent.findUnique({ where: { id: multiple.id }, include: db.timelineLinksInclude });
  assert.equal((await saveMultiple({ ...batch, title: "Must roll back", locationIds: ["q", "foreign"] })).status, 409);
  assert.equal((await saveMultiple({ ...batch, characterIds: ["person-c", "person-b"] })).status, 409);
  assert.deepEqual(await prisma.timelineEvent.findUnique({ where: { id: multiple.id }, include: db.timelineLinksInclude }), beforeBatch);
  const removed = await change({ locationId: "p", linked: false, expectedLinked: true }, "a", {}, multipleContext);
  assert.equal(removed.status, 200);
  const afterPlaceUnlink = (await events()).find(e => e.id === multiple.id);
  assert.deepEqual(afterPlaceUnlink.locationIds, ["q"]); assert.deepEqual(afterPlaceUnlink.characterIds, multiple.characterIds);
  assert.equal(contract.derivePlaceStoryEvents(place, [afterPlaceUnlink]).length, 0);
  assert.equal((await saveMultiple({ ...batch, positionRevision: afterPlaceUnlink.positionRevision, locationIds: ["q"], characterIds: ["person-c"] })).status, 200);
  assert.equal(await prisma.character.count({ where: { id: "person-a" } }), 1, "unlink preserves Character");
  await prisma.character.update({ where: { id: "person-c" }, data: { name: "Juancho renamed" } });
  await prisma.location.update({ where: { id: "q" }, data: { name: "Camino renamed" } });
  const linkedEvent = (await events()).find(e => e.id === multiple.id);
  assert.equal(contract.resolveTimelinePlaces(linkedEvent, await prisma.location.findMany())[0].name, "Camino renamed");
  assert.equal((await prisma.character.findMany({ where: { id: { in: linkedEvent.characterIds } }, select: { name: true } }))[0].name, "Juancho renamed");
  assert.equal((await saveMultiple({ ...batch, positionRevision: linkedEvent.positionRevision, locationIds: [], characterIds: [] })).status, 200);
  assert.equal(await prisma.timelineEventPlace.count({ where: { eventId: multiple.id } }), 0); assert.equal(await prisma.timelineEventCharacter.count({ where: { eventId: multiple.id } }), 0);
  assert.equal(await prisma.timelineEvent.count({ where: { id: multiple.id } }), 1);
  assert.equal(await prisma.character.count({ where: { id: "person-c" } }), 1); assert.equal(await prisma.location.count({ where: { id: "q" } }), 1);
  const lifecycleDb = await loadTs("lib/db/timeline-lifecycle.ts", { "node:crypto": require("node:crypto"), "@/lib/db/prisma": { prisma }, "./timeline-places": db });
  const lifecycleContract = await loadTs("lib/timeline-lifecycle.ts");
  const lifecycleRoute = await loadTs("app/api/timeline-events/[eventId]/lifecycle/route.ts", { ...modules, "@/lib/db/timeline-lifecycle": lifecycleDb, "@/lib/timeline-lifecycle": lifecycleContract });
  const life = await (await create({ title: "Lifecycle", description: "Private description", sceneId: "sa", characterIds: ["person-a"], locationId: "p" })).json();
  const lifeContext = { params: Promise.resolve({ eventId: life.id }) };
  const readImpact = () => lifecycleDb.getTimelineImpact("a", life.id);
  const mutateLife = (action, impact, novelId = "a", headers) => lifecycleRoute.POST(request("POST", { action, confirmed: true, revision: impact.revision, token: impact.token }, novelId, headers), lifeContext);
  const metadataEdit = { ...eventContract.readTimelineEvent(life).data, positionRevision: life.positionRevision, characterIds: undefined, locationIds: undefined, description: "Changed description" };
  assert.equal((await eventRoute.PATCH(request("PATCH", metadataEdit), lifeContext)).status, 200);
  assert.equal(await prisma.timelineEventCharacter.count({ where: { eventId: life.id } }), 1);
  assert.equal(await prisma.timelineEventPlace.count({ where: { eventId: life.id } }), 1);
  const initialImpact = await readImpact();
  assert.equal(initialImpact.hasDescription, true); assert.equal(initialImpact.characters, 1); assert.equal(initialImpact.places, 1);
  assert.equal(initialImpact.structure, 3);
  assert.doesNotMatch(JSON.stringify(initialImpact), /Private description|Changed description|person-a/);
  assert.equal((await mutateLife("archive", initialImpact, "b")).status, 404);
  assert.equal((await mutateLife("archive", initialImpact, "a", { origin: "https://evil.example" })).status, 403);
  assert.equal((await lifecycleRoute.POST(request("POST", { action: "delete" }), lifeContext)).status, 400);
  const unchangedEntities = { characters: await prisma.character.findMany(), places: await prisma.location.findMany(), scenes: await prisma.scene.findMany(), chapters: await prisma.chapter.findMany(), volumes: await prisma.volume.findMany() };
  assert.equal((await mutateLife("archive", initialImpact)).status, 200);
  assert.equal((await studio.listTimelineEventSummaries("a", true)).some(e => e.id === life.id), false);
  assert.equal((await studio.listTimelineEventSummaries("a", true, "active", life.id)).some(e => e.id === life.id), true);
  assert.equal((await studio.listTimelineEventSummaries("b", true, "active", life.id)).some(e => e.id === life.id), false);
  assert.equal((await studio.listTimelineEventSummaries("a", true, "all")).some(e => e.id === life.id && e.archivedAt), true);
  assert.equal(await prisma.timelineEventCharacter.count({ where: { eventId: life.id } }), 1);
  assert.equal(await prisma.timelineEventPlace.count({ where: { eventId: life.id } }), 1);
  assert.equal((await mutateLife("restore", await readImpact())).status, 200);
  assert.equal((await studio.getTimelineEventDetail("a", life.id)).description, "Changed description");
  assert.equal((await studio.listTimelineEventSummaries("a", true)).some(e => e.id === life.id), true);
  const stale = await readImpact();
  await prisma.timelineEventCharacter.create({ data: { eventId: life.id, characterId: "person-c" } });
  assert.equal((await mutateLife("delete", stale)).status, 409, "revalidate actual joins even without revision bump");
  const currentImpact = await readImpact();
  const failureDb = new Database(databasePath);
  try {
    failureDb.exec("CREATE TRIGGER fail_event_delete BEFORE DELETE ON TimelineEvent BEGIN SELECT RAISE(ABORT, 'test rollback'); END;");
    assert.equal((await mutateLife("delete", currentImpact)).status, 500);
    assert.equal(await prisma.timelineEventCharacter.count({ where: { eventId: life.id } }), 2, "failed delete restores joins");
    assert.equal(await prisma.timelineEventPlace.count({ where: { eventId: life.id } }), 1);
    failureDb.exec("DROP TRIGGER fail_event_delete");
  } finally { failureDb.close(); }
  const attempts = await Promise.all([mutateLife("delete", currentImpact), mutateLife("delete", currentImpact)]);
  assert.equal(attempts.filter(response => response.status === 200).length, 1);
  assert.equal(await prisma.timelineEvent.count({ where: { id: life.id } }), 0);
  assert.equal(await prisma.timelineEventCharacter.count({ where: { eventId: life.id } }), 0);
  assert.equal(await prisma.timelineEventPlace.count({ where: { eventId: life.id } }), 0);
  assert.deepEqual({ characters: await prisma.character.findMany(), places: await prisma.location.findMany(), scenes: await prisma.scene.findMany(), chapters: await prisma.chapter.findMany(), volumes: await prisma.volume.findMany() }, unchangedEntities);
  await create({ sortIndex: 1000000000 });
  assert.equal((await create()).status, 409, "overflow does not wrap or invent an order");
});
