import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import createJiti from "jiti";
import Database from "better-sqlite3";
import { migrateTimelinePosition } from "../scripts/migrate-timeline-position.mjs";
const jiti = createJiti(import.meta.url);
const { compareChronology, readTimelinePosition } = jiti("../lib/timeline-position.ts");

test("Chronology ignores label renames, chapter order and relative coordinates; ties and corrupt legacy keys are stable", () => {
  const events = [{ id: "b", sortIndex: 300, internalDate: "Day 01", chapterId: "chapter2" }, { id: "a", sortIndex: 100, internalDate: "Day 99", chapterId: "chapter10" }, { id: "mid", sortIndex: 200 }];
  assert.deepEqual([...events].sort(compareChronology).map(e => e.id), ["a", "mid", "b"]);
  events[1].internalDate = "Third day";
  assert.deepEqual([...events].sort(compareChronology).map(e => e.id), ["a", "mid", "b"]);
  assert.deepEqual([{ id: "z", sortIndex: 0, relativeDay: -2 }, { id: "a", sortIndex: 0, relativeDay: 100 }].sort(compareChronology).map(e => e.id), ["a", "z"]);
  assert.deepEqual([{ id: "z", sortIndex: NaN }, { id: "a", sortIndex: Infinity }, { id: "b" }].sort(compareChronology).map(e => e.id), ["a", "b", "z"]);
});

test("Position input allows no date/story target, negative relative days and bounded integers, rejects coercion and invalid precision", () => {
  assert.equal(readTimelinePosition({}).ok, true);
  assert.equal(readTimelinePosition({ sortIndex: -1000000000, internalDate: "  Earlier  " }).data.internalDate, "Earlier");
  assert.equal(readTimelinePosition({ chronologyKind: "relative", relativeDay: -20, relativeMinute: 1439 }).ok, true);
  for (const bad of [null, [], { sortIndex: "12" }, { sortIndex: NaN }, { sortIndex: Infinity }, { sortIndex: 1.5 }, { sortIndex: 1000000001 }, { chronologyKind: "exact" }, { chronologyKind: "relative" }, { relativeDay: 0 }, { chronologyKind: "relative", relativeDay: 0, relativeMinute: 1440 }, { chronologyKind: "relative", relativeDay: "1" }, { internalDate: "x".repeat(201) }, { chapterId: "../chapter" }, { sceneId: 1 }]) assert.equal(readTimelinePosition(bad).ok, false);
});

test("Legacy migration preserves labels, Structure, bodies, ordering and manually changed indices on rerun", () => {
  const db = new Database(":memory:");
  try {
    db.exec("CREATE TABLE TimelineEvent(id TEXT PRIMARY KEY, novelId TEXT, internalDate TEXT, chapterId TEXT, description TEXT)");
    const insert = db.prepare("INSERT INTO TimelineEvent VALUES (?, ?, ?, ?, ?)");
    insert.run("late", "a", "Day 10", "chapter2", "private"); insert.run("early", "a", "Day 2", "chapter10", "history"); insert.run("unknown", "a", "", null, "unknown"); insert.run("foreign", "b", "20 years earlier", null, "other");
    const before = db.prepare("SELECT id, novelId, internalDate, chapterId, description FROM TimelineEvent ORDER BY id").all();
    assert.equal(migrateTimelinePosition(db), 4);
    assert.deepEqual(db.prepare("SELECT id FROM TimelineEvent WHERE novelId = 'a' ORDER BY sortIndex, id").all().map(r => r.id), ["early", "late", "unknown"]);
    assert.deepEqual(db.prepare("SELECT id, novelId, internalDate, chapterId, description FROM TimelineEvent ORDER BY id").all(), before);
    assert.equal(db.prepare("SELECT chronologyKind FROM TimelineEvent LIMIT 1").get().chronologyKind, "manual");
    assert.equal(db.prepare("SELECT relativeDay FROM TimelineEvent LIMIT 1").get().relativeDay, null);
    db.prepare("UPDATE TimelineEvent SET sortIndex = -10 WHERE id = 'late'").run();
    assert.equal(migrateTimelinePosition(db), 0);
    assert.equal(db.prepare("SELECT sortIndex FROM TimelineEvent WHERE id = 'late'").get().sortIndex, -10);
  } finally { db.close(); }
});

test("Migration failure rolls back column additions and updates atomically", () => {
  const db = new Database(":memory:");
  try {
    db.exec("CREATE TABLE TimelineEvent(id TEXT PRIMARY KEY, novelId TEXT, internalDate TEXT); INSERT INTO TimelineEvent VALUES ('a','n','Day 1'),('b','n','Day 2'); CREATE TRIGGER deny_update BEFORE UPDATE ON TimelineEvent WHEN OLD.id='b' BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    assert.throws(() => migrateTimelinePosition(db), /test failure/);
    assert.equal(db.prepare("PRAGMA table_info(TimelineEvent)").all().some(c => c.name === "sortIndex"), false);
    assert.equal(db.prepare("SELECT count(*) AS n FROM TimelineEvent").get().n, 2);
  } finally { db.close(); }
});

test("Timeline UI never groups chronology by label and exposes optional independent positions", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const fields = readFileSync(new URL("../components/studio/timeline-position-fields.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /acc\.get\(event\.internalDate\)|internal date are required/);
  assert.match(fields, /Story Position \(optional\)/); assert.match(fields, /Not told in Structure/); assert.match(fields, /Display label \(optional\)/);
  assert.match(page, /TimelinePositionEditor event=/);
  const setup = readFileSync(new URL("../scripts/setup-dev.mjs", import.meta.url), "utf8");
  assert.ok(setup.indexOf("migrateTimelinePosition(migrationDatabase)") < setup.indexOf('runNpmScript("db:push")'));
});

test("Position fields render labelled, escaped controls without requiring a fabricated date or chapter", () => {
  const element = tag => function TestElement(props) { return React.createElement(tag, props); };
  const modules = { react: React, "react/jsx-runtime": jsxRuntime,
    "@/components/ui/input": { Input: element("input") }, "@/components/ui/label": { Label: element("label") },
    "@/components/ui/select": { Select: ({ children }) => React.createElement("div", null, children), SelectContent: element("div"), SelectTrigger: element("button"), SelectValue: () => null, SelectItem: ({ children }) => React.createElement("span", null, children) }
  };
  const ui = {};
  const source = readFileSync(new URL("../components/studio/timeline-position-fields.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "exports", compiled)(id => modules[id], ui);
  const value = { internalDate: '<script>private</script>', chronologyKind: "manual", relativeDay: null, relativeMinute: null, volumeId: "", chapterId: "", sceneId: "" };
  const html = renderToStaticMarkup(React.createElement(ui.TimelinePositionFields, { value, onChange: () => {}, options: [] }));
  assert.match(html, /Manual order/); assert.match(html, /Story Position \(optional\)/); assert.match(html, /Not told in Structure/);
  assert.match(html, /&lt;script&gt;private&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>|required=""/);
  const relative = renderToStaticMarkup(React.createElement(ui.TimelinePositionFields, { value: { ...value, chronologyKind: "relative", relativeDay: -3 }, onChange: () => {}, options: [], requireOrder: true }));
  assert.match(relative, /Relative day/); assert.match(relative, /required=""/); assert.match(relative, /value="-3"/);
});
