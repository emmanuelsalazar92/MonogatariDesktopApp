import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function safetyModule() {
  const source = read("lib/scene-document-safety.ts");
  const exports = {};
  new Function("exports", ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  }).outputText)(exports);
  return exports;
}

test("an omitted scene body is never saveable, even when its placeholder is empty", () => {
  const { unloadedSceneDocument, canSaveSceneDocument } = safetyModule();
  assert.equal(canSaveSceneDocument(unloadedSceneDocument("scene-b", 4), "scene-b", false), false);
  assert.equal(canSaveSceneDocument(unloadedSceneDocument("scene-b", 4), "scene-b", true), false);
});

test("a loaded document remains saveable when the author intentionally makes it empty", () => {
  const { loadedSceneDocument, canSaveSceneDocument } = safetyModule();
  assert.equal(canSaveSceneDocument(loadedSceneDocument("scene-b", 4), "scene-b", true), true);
  assert.equal(canSaveSceneDocument(loadedSceneDocument("scene-b", 4), "scene-c", true), false);
});

test("editor snapshots, hydration, and navigation keep document identity explicit", () => {
  const snapshot = read("lib/db/studio.ts");
  const page = read("app/page.tsx");

  assert.match(snapshot, /contentLoaded: scene\.id === activeScene\?\.id/);
  assert.match(page, /if \(!activeScene\.contentLoaded\)/);
  assert.match(page, /canSaveSceneDocument\(document, scene\.id, scene\.contentLoaded\)/);
  assert.match(page, /documentLoaded: true/);
  assert.match(page, /const requestId = \+\+editorSceneRequestRef\.current/);
  assert.match(page, /editorSceneRequestRef\.current !== requestId/);
  assert.match(snapshot, /input\.content === "" && existing\.content !== "" && input\.documentLoaded !== true/);
});
