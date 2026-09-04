import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import Database from "better-sqlite3";
import { migrateTimelineLifecycle } from "../scripts/migrate-timeline-lifecycle.mjs";
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const contract = {};
new Function("exports", ts.transpileModule(read("lib/timeline-lifecycle.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(contract);
test("Lifecycle requires explicit confirmation, revision and a bounded impact token", () => {
  const valid = { action: "delete", revision: 2, token: "a".repeat(64), confirmed: true };
  assert.equal(contract.readTimelineLifecycle(valid).action, "delete");
  for (const input of [null, {}, { ...valid, confirmed: false }, { ...valid, action: "remove-all" }, { ...valid, revision: -1 }, { ...valid, token: "x" }, { ...valid, notes: "private" }]) assert.equal(contract.readTimelineLifecycle(input), null);
});
test("Archive migration is additive and idempotent, preserving legacy metadata and joins", () => {
  const db = new Database(":memory:");
  try {
    db.exec("CREATE TABLE TimelineEvent(id TEXT PRIMARY KEY, description TEXT); INSERT INTO TimelineEvent VALUES ('e','private'); CREATE TABLE TimelineEventPlace(eventId TEXT, locationId TEXT); INSERT INTO TimelineEventPlace VALUES ('e','p');");
    migrateTimelineLifecycle(db);
    assert.equal(db.prepare("SELECT archivedAt FROM TimelineEvent").get().archivedAt, null);
    db.exec("UPDATE TimelineEvent SET archivedAt='2026-09-04'");
    migrateTimelineLifecycle(db);
    assert.deepEqual(db.prepare("SELECT * FROM TimelineEvent").get(), { id: "e", description: "private", archivedAt: "2026-09-04" });
    assert.equal(db.prepare("SELECT count(*) n FROM TimelineEventPlace").get().n, 1);
  } finally { db.close(); }
});
test("Lifecycle UI isolates confirmation and locks duplicate submits; setup migrates before schema push", () => {
  const ui = read("components/studio/timeline-lifecycle.tsx"), setup = read("scripts/setup-dev.mjs");
  for (const pattern of [/lock.acquire\(\)/, /confirmed: true/, /setImpact\(null\)/, /if \(!committed\)/, /Confirm permanent delete/, /onCloseAutoFocus/, /closeDisabled=\{pending\}/, /characters/, /places/, /structure/, /hasDescription/]) assert.match(ui, pattern);
  assert.ok(setup.indexOf("migrateTimelineLifecycle(migrationDatabase)") < setup.indexOf('runNpmScript("db:push")'));
});
