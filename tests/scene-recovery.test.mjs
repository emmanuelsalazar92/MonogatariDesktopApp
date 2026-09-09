import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function recoveryModule() {
  const source = read("lib/scene-recovery.ts");
  const exports = {};
  new Function("exports", ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText)(exports);
  return exports;
}

test("recovery checkpoints protect empty replacements and major one-write reductions", () => {
  const { recoveryReasonForContentChange } = recoveryModule();
  assert.equal(recoveryReasonForContentChange("meaningful manuscript", ""), "content-emptied");
  assert.equal(recoveryReasonForContentChange("a".repeat(1_000), "b".repeat(400)), "major-content-reduction");
});

test("normal autosaves do not create recovery checkpoints", () => {
  const { recoveryReasonForContentChange } = recoveryModule();
  assert.equal(recoveryReasonForContentChange("a".repeat(1_000), "a".repeat(990)), null);
  assert.equal(recoveryReasonForContentChange("short draft", "short edit"), null);
  assert.equal(recoveryReasonForContentChange("", "new manuscript"), null);
});

test("Notion Pull checkpoints have an explicit recoverable label", () => {
  const { recoveryCheckpointLabel } = recoveryModule();
  assert.equal(recoveryCheckpointLabel("notion-pull", 7), "Automatic recovery — before Notion pull (before revision 7)");
});

test("automatic checkpoints carry a visible label and are deduplicated inside destructive transactions", () => {
  const recovery = read("lib/db/scene-recovery.ts");
  const recoveryRules = read("lib/scene-recovery.ts");
  const studio = read("lib/db/studio.ts");
  const notionPull = read("lib/db/notion-pull.ts");

  assert.match(recovery, /origin: `recovery:\$\{operation\}:\$\{reason\}:base-revision-\$\{scene\.revision\}`/);
  assert.match(recoveryRules, /Automatic recovery/);
  assert.match(recovery, /RECOVERY_DEDUPLICATION_WINDOW_MS/);
  assert.match(recovery, /origin: \{ startsWith: "recovery:" \}/);
  assert.match(studio, /await createRecoveryCheckpoint\(tx, existing, input\.content, "scene-update"\)/);
  assert.match(studio, /createRecoveryCheckpoint\(tx, current, version\.content, "version-restore", "version-restore"\)/);
  assert.match(notionPull, /scene\.content !== remote\.content \? "notion-pull" : undefined/);
});
