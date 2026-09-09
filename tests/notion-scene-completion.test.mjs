import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function completionHarness({ pending = true, sceneRevision = pending ? 2 : 1 } = {}) {
  let state = { novelId: "novel-1", revision: 5, syncStatus: "syncing", syncOperationId: "op-1", syncSnapshotRevision: 5 };
  let mapping = { localId: "scene:scene-1", entityType: "scene", novelId: "novel-1", notionPageId: "page-1", lastSyncedRevision: 1, lastSyncedContent: "old" };
  const tx = {
    notionSyncState: { findUnique: async () => state, update: async ({ data }) => (state = { ...state, ...data }) },
    scene: { findFirst: async () => ({ revision: sceneRevision }), findMany: async () => [{ id: "scene-1", revision: sceneRevision }] },
    notionMapping: {
      findUnique: async () => mapping,
      findMany: async () => [mapping],
      update: async ({ data }) => (mapping = { ...mapping, ...data })
    }
  };
  const prisma = { $transaction: async (work) => work(tx) };
  const source = readFileSync(new URL("../lib/db/notion-sync.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("require", "exports", "module", output)((id) => {
    if (id === "server-only") return {};
    if (id === "node:crypto") return { randomUUID: () => "unused" };
    if (id === "@/lib/db/prisma") return { prisma };
    throw new Error(`Unexpected module ${id}`);
  }, exports, { exports });
  return { complete: exports.completeNotionSceneOperation, get state() { return state; }, get mapping() { return mapping; } };
}

test("Scene-scoped completion does not clear unrelated pending work", async () => {
  const harness = completionHarness({ pending: true });
  const result = await harness.complete("novel-1", { "scene-1": { local: "l", remote: "r" } }, "op-1", 5);
  assert.equal(result.applied, true);
  assert.equal(harness.state.isDirty, true);
  assert.equal(harness.state.syncStatus, "idle");
});

test("Scene-scoped completion rejects a stale operation", async () => {
  const harness = completionHarness({ pending: false });
  const result = await harness.complete("novel-1", {}, "old-op", 5);
  assert.equal(result.applied, false);
  assert.equal(harness.state.syncStatus, "syncing");
});

test("Scene Push advances its mapping only while the operation and Scene revision are current", async () => {
  const pushed = { sceneId: "scene-1", notionPageId: "page-1", revision: 2, content: "pushed" };
  const current = completionHarness({ pending: true, sceneRevision: 2 });
  const completed = await current.complete("novel-1", { "scene-1": { local: "pushed", remote: "pushed" } }, "op-1", 5, pushed);
  assert.equal(completed.applied, true);
  assert.equal(current.mapping.lastSyncedRevision, 2);
  assert.equal(current.mapping.lastSyncedContent, "pushed");

  const stale = completionHarness({ pending: true, sceneRevision: 3 });
  const rejected = await stale.complete("novel-1", { "scene-1": { local: "pushed", remote: "pushed" } }, "op-1", 5, pushed);
  assert.equal(rejected.applied, false);
  assert.equal(stale.mapping.lastSyncedRevision, 1);
  assert.equal(stale.mapping.lastSyncedContent, "old");
});
