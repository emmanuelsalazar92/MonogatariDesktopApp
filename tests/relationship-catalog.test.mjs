import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import createJiti from "jiti";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Database from "better-sqlite3";
import { migrateRelationshipLifecycle } from "../scripts/migrate-relationship-lifecycle.mjs";
const require = createRequire(import.meta.url);
const jiti = createJiti(import.meta.url);
const catalog = jiti("../lib/relationship-catalog.ts");
const since = jiti("../lib/relationship-since.ts");
const types = jiti("../lib/character-relationship.ts");
const graph = jiti("../lib/relationship-graph.ts");
const routes = jiti("../lib/studio-routes.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Relationship filters use allowlisted URL codes and clear to the canonical route", () => {
  const invalid = catalog.parseRelationshipCatalog(new URLSearchParams("category=__proto__&type=arbitrary&direction=wrong&lifecycle=wrong&character=../foreign&spoilers=1&q=PRIVATE&notes=PRIVATE"));
  assert.deepEqual(invalid, catalog.defaultRelationshipCatalog);
  assert.equal(catalog.relationshipCatalogRoute("n", invalid), "/novels/n/relationships");
  const state = catalog.parseRelationshipCatalog(new URLSearchParams("category=social&type=mentor_of&character=a&direction=directional&lifecycle=archived&spoilers=true&q=PRIVATE"));
  const url = catalog.relationshipCatalogRoute("n", state);
  assert.doesNotMatch(url, /PRIVATE|q=|notes=/);
  assert.deepEqual(catalog.parseRelationshipCatalog(new URL(url, "http://localhost").searchParams), state);
  assert.deepEqual(catalog.parseRelationshipCatalog(new URLSearchParams()), catalog.defaultRelationshipCatalog);
});

const relationship = (id, overrides = {}) => ({ id, novelId: "n", fromCharacterId: "a", toCharacterId: "b", relationshipType: "mentor_of", direction: "Directional", category: "Social", archivedAt: null, isSpoiler: false,
  status: "Strained", sinceKind: "chapter", sinceTargetId: "c", since: "", description: "PRIVATE DESCRIPTION", notes: "PRIVATE NOTES", ...overrides });
test("Category, type, character, direction, visibility and spoiler filters combine without searching private fields", () => {
  const rows = [relationship("mentor"), relationship("partner", { relationshipType: "partner_of" }), relationship("spoiler", { isSpoiler: true }), relationship("archived", { archivedAt: "2026-01-01" })];
  const base = catalog.defaultRelationshipCatalog;
  assert.deepEqual(catalog.filterRelationships(rows, { ...base, category: "social", type: "mentor_of", character: "a", direction: "directional" }).map((r) => r.id), ["mentor"]);
  assert.deepEqual(catalog.filterRelationships(rows, { ...base, direction: "symmetric" }).map((r) => r.id), ["partner"]);
  assert.deepEqual(catalog.filterRelationships(rows, { ...base, lifecycle: "archived" }).map((r) => r.id), ["archived"]);
  assert.equal(catalog.filterRelationships(rows, { ...base, character: "foreign" }).length, 0);
  assert.equal(catalog.filterRelationships(rows, { ...base, lifecycle: "all", spoilers: true }).length, 4);
});

test("Type library searches labels/categories locally and human sentences preserve semantics", () => {
  assert.deepEqual(catalog.searchRelationshipTypes("mEnToR Of").map((t) => t.key), ["mentor_of"]);
  assert.ok(catalog.searchRelationshipTypes("Family").every((t) => t.category === "Family"));
  assert.equal(catalog.searchRelationshipTypes("PRIVATE NOTES").length, 0);
  assert.equal(catalog.relationshipSentence("Juana", "spouse_of", "Juancho"), "Juana is married to Juancho");
  assert.equal(catalog.relationshipSentence("Juana", "distrusts", "Juancho"), "Juana distrusts Juancho");
  assert.equal(catalog.relationshipSentence("Juana", "in_love_with", "Juancho"), "Juana is in love with Juancho");
  for (const type of types.relationshipDefinitions) assert.doesNotMatch(catalog.relationshipSentence("A", type.key, "B"), /undefined|<->|→/);
});

test("Since links resolve only current, active Structure IDs from the same novel", () => {
  const options = since.relationshipSinceOptions("n", [{ id: "v", novelId: "n", title: "V", sortOrder: 1 }, { id: "vf", novelId: "foreign", title: "Foreign" }], [{ id: "c", volumeId: "v", title: "Chapter", sortOrder: 1 }, { id: "cf", volumeId: "vf", title: "Secret" }], []);
  assert.equal(since.relationshipSinceHref("n", relationship("r"), options), "/novels/n/structure?kind=chapter&target=c");
  assert.equal(since.relationshipSinceHref("n", relationship("r", { sinceTargetId: "cf" }), options), null);
  assert.equal(since.relationshipSinceHref("n", relationship("r", { sinceKind: "custom", sinceTargetId: null, since: "PRIVATE" }), options), null);
  assert.deepEqual(since.relationshipStructureSelection(new URLSearchParams("kind=chapter&target=c"), options), { type: "chapter", id: "c" });
  assert.equal(since.relationshipStructureSelection(new URLSearchParams("kind=chapter&target=cf"), options), null);
  assert.equal(since.relationshipStructureSelection(new URLSearchParams("kind=chapter&target=c"), options.map((o) => ({ ...o, archived: true }))), null);
  const structure = read("components/studio/structure-screen.tsx");
  assert.match(structure, /if \(linkedSelection\) return; \/\/ Following a Since link is read-only/);
});

test("Lifecycle migration is additive/idempotent and preserves records, Since and private metadata", () => {
  const db = new Database(":memory:");
  try {
    db.exec("CREATE TABLE Relationship(id TEXT PRIMARY KEY, notes TEXT, sinceTargetId TEXT); INSERT INTO Relationship VALUES('r','private','c')");
    migrateRelationshipLifecycle(db); migrateRelationshipLifecycle(db);
    assert.deepEqual(db.prepare("SELECT * FROM Relationship").get(), { id: "r", notes: "private", sinceTargetId: "c", archivedAt: null, revision: 0 });
  } finally { db.close(); }
});

function loadComponent(path, modules = {}) {
  const exports = {};
  const deps = { react: React, "react/jsx-runtime": require("react/jsx-runtime"), "@/components/ui/button": { Button: ({ children, ...props }) => React.createElement("button", props, children) },
    "@/components/ui/input": { Input: "input" }, "@/components/ui/label": { Label: "label" }, "@/lib/relationship-catalog": catalog, "@/lib/character-relationship": types,
    "@/lib/relationship-since": since, "@/lib/relationship-graph": graph, "@/lib/studio-routes": routes,
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) }, ...modules };
  new Function("require", "exports", ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)((id) => deps[id], exports);
  return exports;
}
test("Library is initially collapsed, searchable and selecting a type calls Add with its stable code", () => {
  const Library = loadComponent("components/studio/relationship-library.tsx").RelationshipLibrary;
  const html = renderToStaticMarkup(React.createElement(Library, { onChoose() {} }));
  assert.match(html, /<details /); assert.doesNotMatch(html, /<details[^>]*\bopen/);
  assert.match(html, /Search types by label or category/); assert.match(html, /Add relationship: Mentor of/);
  const source = read("components/studio/relationship-library.tsx");
  assert.match(source, /onChoose\(type.key\)/); assert.doesNotMatch(source, /fetch\(|localStorage|URLSearchParams/);
  const page = read("app/page.tsx");
  assert.match(page, /setInitialRelationshipType\(type\); setDialog\("relationship"\)/);
  assert.match(page, /relationshipType: relationshipDefinitions.some\(\(type\) => type.key === initialRelationshipType\) \? initialRelationshipType/);
});

test("Readable selected detail includes Type, Category, linked Since and actions; hidden spoilers expose no preview", () => {
  const Detail = loadComponent("components/studio/relationship-detail.tsx", {
    "./relationship-actions": { RelationshipActions: () => React.createElement("div", null, "Edit Archive Delete") }
  }).RelationshipDetail;
  const props = { novelId: "n", characters: [{ id: "a", novelId: "n", name: "Juana" }, { id: "b", novelId: "n", name: "Juancho" }],
    relationship: relationship("r", { relationshipType: "spouse_of" }), showSpoilers: false, focusId: "All characters", sinceOptions: [{ kind: "chapter", id: "c", label: "Chapter", archived: false }], onFocusCharacter() {}, onChanged() {}, onClearFilters() {} };
  const html = renderToStaticMarkup(React.createElement(Detail, props));
  assert.match(html, /Juana is married to Juancho/); assert.doesNotMatch(html, /&lt;-&gt;|→/);
  assert.match(html, /<dt[^>]*>Type/); assert.match(html, /<dt[^>]*>Category/); assert.match(html, /Edit Archive Delete/);
  assert.match(html, /href="\/novels\/n\/structure\?kind=chapter&amp;target=c"/);
  const hidden = renderToStaticMarkup(React.createElement(Detail, { ...props, relationship: relationship("r", { isSpoiler: true }) }));
  assert.doesNotMatch(hidden, /PRIVATE|Strained|Chapter|Edit Archive Delete/); assert.match(hidden, /Relationship unavailable/);
});
