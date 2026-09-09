import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function engine() {
  const source = readFileSync(new URL("../lib/notion-scene-sync-engine.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; new Function("exports", "module", output)(exports, { exports }); return exports;
}

test("Scene evidence distinguishes unchanged, local-only, Notion-only, conflict, and missing baseline", () => {
  const { classifyNotionSceneEvidence: classify } = engine();
  const base = { baselineLocal: "local-1", baselineRemote: "remote-1", localContentNonEmpty: true, remoteContentEmpty: false };
  assert.equal(classify({ ...base, local: "local-1", remote: "remote-1" }), "UNCHANGED");
  assert.equal(classify({ ...base, local: "local-2", remote: "remote-1" }), "LOCAL_ONLY");
  assert.equal(classify({ ...base, local: "local-1", remote: "remote-2" }), "NOTION_ONLY");
  assert.equal(classify({ ...base, local: "local-2", remote: "remote-2" }), "CONFLICT");
  assert.equal(classify({ local: "local-1", remote: "remote-1", localContentNonEmpty: true, remoteContentEmpty: false }), "BASELINE_REQUIRED");
  assert.equal(classify({ ...base, local: "local-1", remote: "remote-empty", remoteContentEmpty: true }), "DESTRUCTIVE_NOTION_EMPTY");
});

test("Scene Pull, Push, Reconcile and conflict resolutions have deterministic plans", () => {
  const { planNotionSceneOperation: plan } = engine();
  assert.equal(plan("PULL", "NOTION_ONLY"), "APPLY_NOTION");
  assert.equal(plan("PULL", "LOCAL_ONLY"), "PRESERVE_LOCAL");
  assert.equal(plan("PUSH", "LOCAL_ONLY"), "PUSH_MONOGATARI");
  assert.equal(plan("PUSH", "NOTION_ONLY"), "REVIEW_CONFLICT");
  assert.equal(plan("RECONCILE", "LOCAL_ONLY"), "PUSH_MONOGATARI");
  assert.equal(plan("RECONCILE", "NOTION_ONLY"), "APPLY_NOTION");
  assert.equal(plan("RECONCILE", "CONFLICT"), "REVIEW_CONFLICT");
  assert.equal(plan("RECONCILE", "CONFLICT", "KEEP_MONOGATARI"), "PUSH_MONOGATARI");
  assert.equal(plan("RECONCILE", "CONFLICT", "KEEP_NOTION"), "APPLY_NOTION");
  assert.equal(plan("PULL", "BASELINE_REQUIRED"), "BLOCKED");
});

test("Scene persistence keeps revision, baseline, checkpoint, and stale-write guards together", () => {
  const apply = readFileSync(new URL("../lib/db/notion-pull.ts", import.meta.url), "utf8");
  const sync = readFileSync(new URL("../lib/db/notion-sync.ts", import.meta.url), "utf8");
  assert.match(apply, /scene\.revision !== update\.expectedRevision/);
  assert.match(apply, /scene\.content !== update\.content \? "notion-pull" : undefined/);
  assert.match(apply, /const revision = scene\.revision \+ 1/);
  assert.match(apply, /lastSyncedRevision: revision, lastSyncedContent: update\.localBaseline/);
  assert.match(sync, /completeNotionSceneOperation/);
  assert.match(sync, /hasPendingScenes/);
});
