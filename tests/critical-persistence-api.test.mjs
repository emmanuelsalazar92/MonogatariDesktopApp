import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function loadTypeScript(path, dependencies = {}) {
  const output = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const exports = {};
  const moduleRecord = { exports };
  new Function("require", "exports", "module", output)(
    (id) => {
      if (id in dependencies) return dependencies[id];
      throw new Error(`Unexpected module: ${id}`);
    },
    exports,
    moduleRecord
  );
  return moduleRecord.exports;
}

const nextServer = { NextResponse: { json: (value, init) => Response.json(value, init) } };

function sceneApiHarness() {
  const persistence = loadTypeScript("lib/scene-persistence.ts");
  let stored = { id: "scene-a", chapterId: "chapter-a", title: "Opening", content: "A complete manuscript.", wordCount: 3, revision: 4, summary: "", status: "Draft", objective: "" };
  let failNextWrite = false;
  const studio = {
    SceneDocumentNotLoadedError: persistence.SceneDocumentNotLoadedError,
    SceneRevisionConflictError: persistence.SceneRevisionConflictError,
    async getScene() { return { ...stored, contentLoaded: true }; },
    async updateScene(sceneId, input) {
      assert.equal(sceneId, stored.id);
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error("disk unavailable");
      }
      const prepared = persistence.prepareSceneWrite(stored, input);
      stored = {
        ...stored,
        ...(typeof input.title === "string" ? { title: input.title.trim() } : {}),
        ...(typeof input.content === "string" ? { content: input.content } : {}),
        wordCount: prepared.nextWordCount,
        revision: stored.revision + 1
      };
      return { ...stored, contentLoaded: true };
    }
  };
  const route = loadTypeScript("app/api/scenes/[sceneId]/route.ts", {
    "next/server": nextServer,
    "@/lib/db/studio": studio,
    "@/lib/studio-domain": {},
    "@/lib/db/scene-places": { ScenePlaceError: class ScenePlaceError extends Error {} },
    "@/lib/request-security": { isTrustedMutationRequest: () => true }
  });
  const request = (body) => new Request("http://test.invalid/api/scenes/scene-a", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const context = { params: Promise.resolve({ sceneId: "scene-a" }) };
  return {
    route,
    request,
    context,
    get stored() { return { ...stored }; },
    failWrite() { failNextWrite = true; }
  };
}

test("persistence guard rejects an unloaded empty placeholder but permits an explicit loaded deletion", () => {
  const persistence = loadTypeScript("lib/scene-persistence.ts");
  const existing = { content: "Preserve these words", revision: 7, wordCount: 3 };

  assert.throws(
    () => persistence.prepareSceneWrite(existing, { content: "", expectedRevision: 7 }),
    persistence.SceneDocumentNotLoadedError
  );
  assert.deepEqual(
    persistence.prepareSceneWrite(existing, { content: "", expectedRevision: 7, documentLoaded: true }),
    { expectedRevision: 7, nextWordCount: 0, wordDelta: -3 }
  );
});

test("scene API keeps the persisted manuscript readable when a stale hydration tries to save empty content", async () => {
  const harness = sceneApiHarness();
  const response = await harness.route.PATCH(harness.request({ content: "", expectedRevision: 4 }), harness.context);

  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /load the scene document/i);
  assert.equal(harness.stored.content, "A complete manuscript.");
  assert.equal(harness.stored.revision, 4);

  const readerResponse = await harness.route.GET(new Request("http://test.invalid/api/scenes/scene-a"), harness.context);
  assert.equal((await readerResponse.json()).content, "A complete manuscript.");
});

test("scene API preserves the newest revision, propagates word counts, and allows only an explicit empty edit", async () => {
  const harness = sceneApiHarness();
  const first = await harness.route.PATCH(
    harness.request({ content: "A newly saved manuscript", expectedRevision: 4, documentLoaded: true }),
    harness.context
  );
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), {
    ...harness.stored,
    contentLoaded: true
  });
  assert.equal(harness.stored.wordCount, 4);
  assert.equal(harness.stored.revision, 5);

  const stale = await harness.route.PATCH(
    harness.request({ content: "stale replacement", expectedRevision: 4, documentLoaded: true }),
    harness.context
  );
  assert.equal(stale.status, 409);
  assert.equal(harness.stored.content, "A newly saved manuscript");

  const clear = await harness.route.PATCH(
    harness.request({ content: "", expectedRevision: 5, documentLoaded: true }),
    harness.context
  );
  assert.equal(clear.status, 200);
  assert.equal(harness.stored.content, "");
  assert.equal(harness.stored.wordCount, 0);
});

test("a failed scene write leaves prior persistence intact and cannot be reported as saved", async () => {
  const harness = sceneApiHarness();
  harness.failWrite();
  await assert.rejects(
    harness.route.PATCH(harness.request({ content: "new text", expectedRevision: 4, documentLoaded: true }), harness.context),
    /disk unavailable/
  );
  assert.equal(harness.stored.content, "A complete manuscript.");
  assert.equal(harness.stored.revision, 4);

  const autosave = loadTypeScript("lib/autosave-state.ts");
  assert.equal(autosave.statusAfterSaveConfirmation(4, 3), "Unsaved changes");
});

test("novel, structure, archive, and delete API contracts preserve validated persistence boundaries", async () => {
  let createdNovel;
  const novelRoute = loadTypeScript("app/api/novels/route.ts", {
    "next/server": nextServer,
    "@/lib/db/studio": { async createNovel(input) { createdNovel = input; return { id: "novel-a", ...input }; } },
    "@/lib/db/prisma": { prisma: { novel: { findMany: async () => [] } } },
    "@/lib/novel-metadata": { validateNovelMetadata: (input) => input.title === "Valid novel" ? { ok: true, data: { ...input, tags: [] } } : { ok: false, error: "invalid" } },
    "@/lib/request-security": { isTrustedMutationRequest: () => true },
    "@/lib/studio-domain": {}
  });
  const novelResponse = await novelRoute.POST(new Request("http://test.invalid/api/novels", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Valid novel" })
  }));
  assert.equal(novelResponse.status, 201);
  assert.equal(createdNovel.title, "Valid novel");

  const calls = [];
  const structureRoute = loadTypeScript("app/api/structure/route.ts", {
    "next/server": nextServer,
    "@/lib/db/structure": {
      async createStructureItem(input) { calls.push(["create", input]); return { selection: { type: input.type, id: "scene-a" } }; },
      async mutateStructureItem(type, id, action) { calls.push(["lifecycle", type, id, action]); return { selection: { type, id } }; },
      async deleteStructureItem() { throw new Error("cannot delete a non-empty chapter; archive it instead"); },
      async moveStructureItem() { throw new Error("not used"); },
      async updateStructureItem() { throw new Error("not used"); }
    },
    "@/lib/structure-move": { structureMovePositions: ["first"] },
    "@/lib/studio-domain": { isNarrativeStatus: (value) => value === "Draft" },
    "@/lib/db/scene-places": { ScenePlaceError: class ScenePlaceError extends Error {} }
  });
  const createdScene = await structureRoute.POST(new Request("http://test.invalid/api/structure", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "scene", novelId: "novel-a", parentId: "chapter-a", title: "New scene", content: "One two", status: "Draft" })
  }));
  assert.equal(createdScene.status, 201);
  assert.deepEqual(calls[0], ["create", { type: "scene", novelId: "novel-a", parentId: "chapter-a", title: "New scene", content: "One two", status: "Draft", summary: undefined, objective: undefined, locationId: undefined }]);

  const archived = await structureRoute.PATCH(new Request("http://test.invalid/api/structure", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "scene", id: "scene-a", action: "archive" })
  }));
  assert.equal(archived.status, 200);
  assert.deepEqual(calls[1], ["lifecycle", "scene", "scene-a", "archive"]);

  const rejectedDelete = await structureRoute.DELETE(new Request("http://test.invalid/api/structure", {
    method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "chapter", id: "chapter-a" })
  }));
  assert.equal(rejectedDelete.status, 409);
  assert.match((await rejectedDelete.json()).error, /non-empty chapter/);
});
