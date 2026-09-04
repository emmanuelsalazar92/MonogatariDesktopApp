import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import createJiti from "jiti";
import { readFileSync } from "node:fs";
import { migrateTimelineLinks } from "../scripts/migrate-timeline-links.mjs";
const { readTimelineEvent } = createJiti(import.meta.url)("../lib/timeline-event.ts");

test("Batch link contract validates bounded arrays, deduplicates IDs and translates unambiguous legacy Place input", () => {
  const result = readTimelineEvent({ title: "Event", locationIds: ["p", "q", "p"], characterIds: ["a", "b", "a"] });
  assert.equal(result.ok, true); assert.deepEqual(result.data.locationIds, ["p", "q"]); assert.deepEqual(result.data.characterIds, ["a", "b"]);
  assert.deepEqual(readTimelineEvent({ title: "Event", locationId: "p" }).data.locationIds, ["p"]);
  for (const bad of [{ locationIds: "p" }, { locationIds: ["../p"] }, { locationIds: [null] }, { locationIds: Array(501).fill("p") }, { locationId: "p", locationIds: ["q", "p"] }, { characterIds: ["x; DELETE"] }]) assert.equal(readTimelineEvent({ title: "Event", ...bad }).ok, false);
});

function legacyDatabase() {
  const db = new Database(":memory:"); db.pragma("foreign_keys=ON");
  db.exec(`CREATE TABLE Character(id TEXT PRIMARY KEY, novelId TEXT, name TEXT);
    CREATE TABLE Location(id TEXT PRIMARY KEY, novelId TEXT, name TEXT);
    CREATE TABLE TimelineEvent(id TEXT PRIMARY KEY, novelId TEXT, title TEXT, description TEXT, characterIds TEXT, locationId TEXT);
    INSERT INTO Character VALUES ('a','n','Juana'),('b','n','Juancho'),('foreign','other','Hidden');
    INSERT INTO Location VALUES ('p','n','Finca'),('q','n','Camino'),('foreign','other','Hidden');`);
  const insert = db.prepare("INSERT INTO TimelineEvent VALUES (?, 'n', 'Event', 'private body', ?, ?)");
  insert.run("e", '["a","b","a","missing","foreign",42]', "p"); insert.run("bad", "{not-json", "foreign");
  return db;
}

test("Legacy JSON and single Place migrate once, preserve metadata and never resurrect removed joins", () => {
  const db = legacyDatabase();
  try {
    const before = db.prepare("SELECT * FROM TimelineEvent ORDER BY id").all();
    assert.deepEqual(migrateTimelineLinks(db), { characters: 2, places: 1, skipped: 5 });
    assert.deepEqual(db.prepare("SELECT characterId FROM TimelineEventCharacter ORDER BY characterId").all().map(r => r.characterId), ["a", "b"]);
    assert.deepEqual(db.prepare("SELECT * FROM TimelineEvent ORDER BY id").all(), before);
    db.prepare("DELETE FROM TimelineEventCharacter WHERE characterId='a'").run();
    db.prepare("DELETE FROM TimelineEventPlace WHERE locationId='p'").run();
    assert.deepEqual(migrateTimelineLinks(db), { characters: 0, places: 0, skipped: 0 });
    assert.equal(db.prepare("SELECT count(*) n FROM TimelineEventCharacter").get().n, 1); assert.equal(db.prepare("SELECT count(*) n FROM TimelineEventPlace").get().n, 0);
    assert.throws(() => db.prepare("INSERT INTO TimelineEventCharacter VALUES ('e','b')").run(), /UNIQUE/);
    assert.throws(() => db.prepare("DELETE FROM Character WHERE id='b'").run(), /FOREIGN KEY/);
    db.prepare("INSERT INTO TimelineEventPlace VALUES ('e','q')").run();
    assert.throws(() => db.prepare("DELETE FROM Location WHERE id='q'").run(), /FOREIGN KEY/);
    db.prepare("DELETE FROM TimelineEvent WHERE id='e'").run();
    assert.equal(db.prepare("SELECT count(*) n FROM Character").get().n, 3); assert.equal(db.prepare("SELECT count(*) n FROM Location").get().n, 3);
    assert.equal(db.prepare("SELECT count(*) n FROM TimelineEventCharacter").get().n, 0); assert.equal(db.prepare("SELECT count(*) n FROM TimelineEventPlace").get().n, 0);
  } finally { db.close(); }
});

test("Migration failure rolls back copied associations and completion marker", () => {
  const db = legacyDatabase();
  try {
    db.exec("CREATE TABLE TimelineEventPlace(eventId TEXT, locationId TEXT, PRIMARY KEY(eventId,locationId)); CREATE TRIGGER fail_link BEFORE INSERT ON TimelineEventPlace BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    assert.throws(() => migrateTimelineLinks(db), /test failure/);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='TimelineEventCharacter'").get(), undefined);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='LocalDataMigration'").get(), undefined);
  } finally { db.close(); }
});

test("Timeline/Places use canonical arrays, ID filters, semantic links and metadata-only join projections", () => {
  const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const page = read("app/page.tsx"), places = read("components/studio/place-story-events.tsx"), db = read("lib/db/timeline-places.ts");
  const catalog = read("lib/timeline-catalog.ts");
  assert.match(catalog, /event.characterIds.includes\(state.character\)/); assert.match(catalog, /event.locationIds.includes\(state.place\)/);
  assert.match(page, /routeForCharacter\(person.novelId, person.id\)/); assert.match(page, /routeForPlace\(place.novelId, place.id\)/);
  assert.match(places, /!event.locationIds.includes\(place.id\)/); assert.match(places, /linked: link, expectedLinked: !link/);
  const projection = db.slice(db.indexOf("export const timelineLinksInclude"), db.indexOf("export async function setTimelineLinks"));
  assert.doesNotMatch(projection, /secret|notes|description|include: true/);
  assert.match(projection, /select: \{ novelId: true \}/);
});
