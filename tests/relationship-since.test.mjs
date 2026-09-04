import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import createJiti from "jiti";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Database from "better-sqlite3";
import { migrateRelationshipSince } from "../scripts/migrate-relationship-since.mjs";

const require = createRequire(import.meta.url);
const jiti = createJiti(import.meta.url);
const types = jiti("../lib/character-relationship.ts");
const since = jiti("../lib/relationship-since.ts");
const base = { novelId: "n", fromCharacterId: "a", toCharacterId: "b", relationshipType: "partner_of" };

test("Minimum create and explicit Since fallbacks enforce a single source", () => {
  const minimal = types.validateRelationshipInput(base);
  assert.equal(minimal.ok, true);
  assert.equal(minimal.data.status, "");
  assert.equal(minimal.data.sinceKind, "unknown");
  assert.equal(minimal.data.sinceTargetId, null);
  for (const sinceKind of ["volume", "chapter", "scene"]) {
    assert.equal(types.validateRelationshipInput({ ...base, sinceKind, sinceTargetId: "target-id" }).ok, true);
  }
  for (const extra of [{ sinceKind: "bad" }, { sinceKind: "custom" }, { sinceKind: "chapter" }, { sinceKind: "scene", sinceTargetId: "../s" },
    { sinceKind: "unknown", sinceTargetId: "c" }, { sinceKind: "chapter", sinceTargetId: "c", since: "Chapter 1" },
    { sinceKind: "before_story", since: "hidden text" }, { sinceKind: "custom", since: "x".repeat(121) }]) {
    assert.equal(types.validateRelationshipInput({ ...base, ...extra }).ok, false);
  }
  assert.equal(types.validateRelationshipInput({ ...base, since: "Chapter 1" }).data.sinceKind, "custom", "legacy text never guesses an ID");
  assert.deepEqual(types.readRelationshipSince({ sinceKind: "before_story" }), { sinceKind: "before_story", since: "", sinceTargetId: null });
});

test("Structure projection is metadata-only, ordered and novel-scoped with live labels", () => {
  const volumes = [{ id: "v", novelId: "n", title: "Volume 1", sortOrder: 1 }, { id: "foreign", novelId: "other", title: "Hidden", sortOrder: 0 }];
  const chapters = [{ id: "c", volumeId: "v", title: "Chapter 1", sortOrder: 1 }, { id: "cf", volumeId: "foreign", title: "Hidden", sortOrder: 1 }];
  const scenes = [{ id: "s2", chapterId: "c", title: "Later", sortOrder: 2, content: "SECRET" }, { id: "s1", chapterId: "c", title: "Earlier", sortOrder: 1, content: "SECRET" }];
  const options = since.relationshipSinceOptions("n", volumes, chapters, scenes);
  assert.deepEqual(options.map((option) => option.id), ["v", "c", "s1", "s2"]);
  assert.doesNotMatch(JSON.stringify(options), /SECRET|Hidden|content/);
  const link = { sinceKind: "scene", sinceTargetId: "s1", since: "" };
  assert.equal(since.relationshipSinceLabel(link, options), "Volume 1 · Chapter 1 · 01 — Earlier");
  chapters[0].title = "Arrival";
  scenes[1].sortOrder = 3;
  assert.equal(since.relationshipSinceLabel(link, since.relationshipSinceOptions("n", volumes, chapters, scenes)), "Volume 1 · Arrival · 03 — Earlier");
  assert.equal(since.relationshipSinceLabel(link, []), "Structure target unavailable");
  assert.equal(since.relationshipSinceLabel({ sinceKind: "custom", since: "Chapter 1" }, options), "Custom: Chapter 1");
  assert.equal(since.relationshipSinceLabel({ sinceKind: "unknown", since: "" }, options), "Unknown");
});

test("Since migration is additive, idempotent and never infers references from titles", () => {
  const db = new Database(":memory:");
  try {
    db.exec("CREATE TABLE Relationship (id TEXT PRIMARY KEY, since TEXT, notes TEXT); INSERT INTO Relationship VALUES ('c','Chapter 1','private'), ('b','Before story','private'), ('u','','private')");
    assert.equal(migrateRelationshipSince(db), 2);
    assert.equal(migrateRelationshipSince(db), 0);
    assert.deepEqual(db.prepare("SELECT since, sinceKind, sinceTargetId FROM Relationship WHERE id='c'").get(), { since: "Chapter 1", sinceKind: "custom", sinceTargetId: null });
    assert.deepEqual(db.prepare("SELECT since, sinceKind FROM Relationship WHERE id='b'").get(), { since: "", sinceKind: "before_story" });
    assert.equal(db.prepare("SELECT count(*) AS count FROM Relationship WHERE notes='private'").get().count, 3);
  } finally { db.close(); }
});

test("Progressive form orders essentials, keeps collapsed drafts and stores selector IDs", () => {
  const element = (tag) => function TestElement({ children, ...props }) { return React.createElement(tag, { id: props.id, htmlFor: props.htmlFor }, children); };
  const fieldExports = {};
  const select = { Select: element("div"), SelectTrigger: element("button"), SelectValue: () => null, SelectContent: element("div"), SelectItem: element("span") };
  const modules = { react: React, "react/jsx-runtime": require("react/jsx-runtime"), "@/lib/character-relationship": types,
    "@/components/ui/label": { Label: element("label") }, "@/components/ui/input": { Input: "input" }, "@/components/ui/textarea": { Textarea: "textarea" },
    "@/components/ui/switch": { Switch: element("button") }, "@/components/ui/select": select };
  const source = readFileSync(new URL("../components/studio/relationship-fields.tsx", import.meta.url), "utf8");
  new Function("require", "exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)((id) => modules[id], fieldExports);
  let form = { ...types.validateRelationshipInput(base).data, description: "Draft description", notes: "Draft notes" };
  const props = () => ({ form, onChange: (update) => { form = update(form); }, characters: [{ id: "a", name: "A" }, { id: "b", name: "B" }], sinceOptions: [{ kind: "chapter", id: "c", label: "Chapter" }], saving: false, firstFieldRef: null });
  const html = renderToStaticMarkup(React.createElement(fieldExports.RelationshipFields, props()));
  assert.ok(html.indexOf('id="relationship-from"') < html.indexOf('id="relationship-type"'));
  assert.ok(html.indexOf('id="relationship-type"') < html.indexOf('id="relationship-to"'));
  assert.equal((html.match(/<details /g) ?? []).length, 2);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
  assert.match(html, /Advanced details/);
  assert.match(html, /Continuity Notes/);
  const tree = fieldExports.RelationshipFields(props());
  const all = [];
  const visit = (node) => { if (Array.isArray(node)) return node.forEach(visit); if (node && typeof node === "object") { all.push(node); visit(node.props?.children); } };
  visit(tree);
  const sinceSelect = all.find((node) => node.type === select.Select && node.props.value === "unknown");
  sinceSelect.props.onValueChange("chapter:c");
  assert.equal(form.sinceTargetId, "c");
  assert.equal(form.sinceKind, "chapter");
  assert.equal(form.since, "");
  assert.equal(form.notes, "Draft notes");
  assert.equal(form.description, "Draft description");
  assert.doesNotMatch(source, /onToggle|open=|dangerouslySetInnerHTML/, "native collapse never clears/unmounts controlled fields");
});
