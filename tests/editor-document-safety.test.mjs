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
  const persistence = read("lib/scene-persistence.ts");
  const page = read("app/page.tsx");

  assert.match(snapshot, /contentLoaded: scene\.id === activeScene\?\.id/);
  assert.match(page, /if \(!activeScene\.contentLoaded\)/);
  assert.match(page, /canSaveSceneDocument\(document, scene\.id, scene\.contentLoaded\)/);
  assert.match(page, /documentLoaded: true/);
  assert.match(page, /const requestId = \+\+editorSceneRequestRef\.current/);
  assert.match(page, /editorSceneRequestRef\.current !== requestId/);
  assert.match(snapshot, /prepareSceneWrite\(existing, input\)/);
  assert.match(persistence, /input\.content === "" && existing\.content !== "" && input\.documentLoaded !== true/);
});

test("editor foreground revalidation is deduplicated and never hydrates a dirty draft", () => {
  const page = read("app/page.tsx");

  assert.match(page, /document\.addEventListener\("visibilitychange", revalidateForeground\)/);
  assert.match(page, /window\.addEventListener\("focus", revalidateForeground\)/);
  assert.match(page, /state\.inFlight \|\| now - state\.lastAt < 1_000/);
  assert.match(page, /refreshStudioData\(false\)/);
  assert.match(page, /loadedSceneIdRef\.current === activeScene\.id && dirtyRef\.current\) return/);
  assert.match(page, /draftDocumentRef\.current\.baseRevision === activeScene\.revision/);
  assert.match(page, /contentRef\.current === activeScene\.content/);
});

test("manual Save and Ctrl+S use the serialized flush instead of a stale scene callback", () => {
  const page = read("app/page.tsx");

  assert.match(page, /if \(saveInFlightRef\.current\) \{/);
  assert.match(page, /await saveInFlightRef\.current/);
  assert.match(page, /return flushPendingChanges\(\)/);
  assert.match(page, /\(event\.ctrlKey \|\| event\.metaKey\) && event\.key\.toLowerCase\(\) === "s"/);
  assert.match(page, /aria-label=\{saveStatus === "Save failed — Retry" \? "Retry save" : "Save scene"\}/);
  assert.match(page, /disabled=\{!isDocumentReady\}/);
  assert.match(page, /onClick=\{onRequestSave\}/);
});

test("narrow editor layouts retain a touch-sized Save now action and overflow fallback", () => {
  const page = read("app/page.tsx");
  const button = read("components/ui/button.tsx");

  assert.match(page, /<span className="sm:hidden">Save now<\/span>/);
  assert.match(page, /<span className="hidden sm:inline">Save<\/span>/);
  assert.match(page, /More editor actions[\s\S]*Save now/);
  assert.match(page, /disabled=\{!isDocumentReady\} onClick=\{onRequestSave\}/);
  assert.match(button, /min-h-10/);
  assert.match(page, /ml-auto flex flex-wrap items-center gap-2/);
});
