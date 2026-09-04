import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import createJiti from "jiti";
const jiti = createJiti(import.meta.url), { createNoteCapture } = jiti("../lib/note-capture.ts");
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const target = { novelId: "a", type: "Scene", id: "scene-a", title: "Scene" };

test("Context capture validates Novel/type/ID and bounds selection without persisting positions", () => {
  const text = "  Reina desconfía de la torre\n<script>untrusted</script>  ";
  const draft = createNoteCapture("a", target, text);
  assert.equal(draft.content, ""); assert.equal(draft.quotedText, text); assert.equal(draft.target.id, "scene-a"); assert.ok(draft.title.length <= 120);
  assert.deepEqual(Object.keys(draft).sort(), ["content", "novelId", "quotedText", "target", "title"]);
  assert.equal(createNoteCapture("a", { ...target, novelId: "b" }), null);
  assert.equal(createNoteCapture("a", { ...target, id: "../foreign" }), null);
  assert.equal(createNoteCapture("a", { ...target, type: "Unknown" }), null);
  for (const selected of ["", "   ", "x".repeat(100001), 12]) assert.equal(createNoteCapture("a", target, selected), null);
  assert.equal(createNoteCapture("a", target).title, ""); assert.equal(createNoteCapture("a", target).quotedText, "");
  for (const type of ["Scene", "Character", "Place", "Volume", "Chapter", "TimelineEvent"]) assert.equal(createNoteCapture("a", { ...target, type }).target.type, type);
});

test("MD-170 action snapshots selected textarea content read-only and ignores stale Scene refs", () => {
  const calls = [];
  const exports = {};
  const modules = { react: { ...React, useContext: () => (...args) => calls.push(args) }, "react/jsx-runtime": jsxRuntime, "@/components/ui/button": { Button: "button" } };
  new Function("require", "exports", ts.transpileModule(read("components/studio/note-capture.tsx"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(id => modules[id], exports);
  const manuscript = Object.freeze({ value: "start Reina desconfía de la torre end", selectionStart: 6, selectionEnd: 32, dataset: { sceneId: "scene-a" } });
  exports.SelectionNoteButton({ target, manuscriptRef: { current: manuscript }, hasSelection: true }).props.onClick();
  assert.deepEqual(calls, [[target, manuscript.value.slice(6, 32)]]);
  exports.SelectionNoteButton({ target: { ...target, id: "scene-b" }, manuscriptRef: { current: manuscript }, hasSelection: true }).props.onClick();
  assert.equal(calls.length, 1);
  assert.equal(exports.SelectionNoteButton({ target, manuscriptRef: { current: manuscript }, hasSelection: false }).props.disabled, true);
  exports.AddStoryNoteButton({ target }).props.onClick(); assert.deepEqual(calls[1], [target]);
});

test("All narrative entry points use the shared modal without navigation, unmounting Editor or manuscript mutations", () => {
  const page = read("app/page.tsx"), capture = page.slice(page.indexOf("const captureNote ="), page.indexOf("const captureNote =") + 420);
  assert.match(capture, /createNoteCapture\(currentNovel.id/); assert.doesNotMatch(capture, /router|saveScene|flushPending|notion|fetch/);
  assert.match(page, /<NoteCaptureContext.Provider value={captureNote}>/);
  assert.match(page, /<SelectionCaptureMenu/); assert.match(page, /data-scene-id={activeScene.id}/);
  assert.match(page, /type: "Place", id: place.id/); assert.match(page, /type: "TimelineEvent", id: event.id/);
  assert.match(read("components/studio/characters-screen.tsx"), /type: "Character", id: character.id/);
  assert.match(read("components/studio/structure-screen.tsx"), /volume: "Volume", chapter: "Chapter", scene: "Scene"/);
  assert.match(page, /note={editingNote} capture={noteCapture}/);
  assert.match(page, /role="status" className="fixed bottom-4/);
});
