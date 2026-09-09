import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function loadApplyHarness({ revision = 3, content = "before", failWrite = false, failBaseline = false } = {}) {
  const calls = { checkpoints: 0, mappingUpdates: 0, sceneUpdates: [], baselineUpdates: 0 };
  const scene = { id: "scene-1", chapterId: "chapter-1", title: "Scene", summary: "", content, wordCount: 1, revision, archived: false, chapter: { volume: { novelId: "novel-1" } } };
  const tx = {
    scene: {
      findUniqueOrThrow: async () => scene,
      update: async ({ data }) => { calls.sceneUpdates.push(data); if (failWrite) throw new Error("write failed"); return scene; }
    },
    notionMapping: {
      findUnique: async () => ({ localId: "scene:scene-1", entityType: "scene", novelId: "novel-1", notionPageId: "page-1" }),
      update: async () => { calls.mappingUpdates += 1; }
    },
    chapter: { findMany: async () => [], update: async () => undefined },
    novel: { update: async () => undefined },
    notionSyncState: { upsert: async () => { calls.baselineUpdates += 1; if (failBaseline) throw new Error("baseline failed"); } }
  };
  const prisma = { $transaction: async (work) => work(tx) };
  const source = readFileSync(new URL("../lib/db/notion-pull.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("require", "exports", "module", output)((id) => {
    if (id === "server-only") return {};
    if (id === "@/lib/db/prisma") return { prisma };
    if (id === "@/lib/db/scene-recovery") return { createRecoveryCheckpoint: async () => { calls.checkpoints += 1; } };
    throw new Error(`Unexpected module ${id}`);
  }, exports, { exports });
  return { apply: exports.applyNotionSceneUpdates, calls };
}

const update = (overrides = {}) => ({ sceneId: "scene-1", notionPageId: "page-1", content: "after", expectedRevision: 3, localBaseline: "baseline-after", ...overrides });
const baselines = { "scene-1": { local: "baseline-after", remote: "remote-after" } };

test("Scene Pull creates recovery evidence, increments revision, then advances mapping baseline", async () => {
  const { apply, calls } = loadApplyHarness();
  await apply("novel-1", [update()], baselines);
  assert.equal(calls.checkpoints, 1);
  assert.equal(calls.sceneUpdates[0].revision, 4);
  assert.equal(calls.mappingUpdates, 1);
  assert.equal(calls.baselineUpdates, 1);
});

test("Scene Pull persistence failure and stale revision never advance the baseline", async () => {
  const failed = loadApplyHarness({ failWrite: true });
  await assert.rejects(() => failed.apply("novel-1", [update()]), /write failed/);
  assert.equal(failed.calls.mappingUpdates, 0);

  const stale = loadApplyHarness({ revision: 4 });
  await assert.rejects(() => stale.apply("novel-1", [update()]), /changed locally/);
  assert.equal(stale.calls.checkpoints, 0);
  assert.equal(stale.calls.mappingUpdates, 0);
});

test("empty Notion content cannot erase a non-empty Scene without explicit resolution", async () => {
  const protectedPull = loadApplyHarness();
  await assert.rejects(() => protectedPull.apply("novel-1", [update({ content: "" })]), /explicit conflict resolution/);
  assert.equal(protectedPull.calls.mappingUpdates, 0);

  const acceptedPull = loadApplyHarness();
  await acceptedPull.apply("novel-1", [update({ content: "", allowEmptyOverwrite: true })], baselines);
  assert.equal(acceptedPull.calls.checkpoints, 1);
  assert.equal(acceptedPull.calls.mappingUpdates, 1);
});

test("Scene Pull stores its comparison baseline in the same persistence transaction", async () => {
  const failed = loadApplyHarness({ failBaseline: true });
  await assert.rejects(() => failed.apply("novel-1", [update()], baselines), /baseline failed/);
  assert.equal(failed.calls.baselineUpdates, 1);
  assert.equal(failed.calls.mappingUpdates, 1);
});
