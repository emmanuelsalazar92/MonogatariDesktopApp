import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function activityModule() {
  const source = readFileSync(new URL("../lib/db/recent-activity.ts", import.meta.url), "utf8");
  const exports = {};
  new Function("require", "exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(
    (id) => id === "node:crypto" ? { randomUUID: () => "test-id" } : {}, exports
  );
  return exports;
}

test("Scene edits coalesce into one local metadata-only activity item", async () => {
  const { recordRecentActivity } = activityModule();
  const calls = { create: [], update: [], deleted: [] };
  const tx = {
    recentActivity: {
      findFirst: async () => ({ id: "existing" }),
      update: async (value) => calls.update.push(value),
      create: async (value) => calls.create.push(value),
      findMany: async () => [],
      deleteMany: async (value) => calls.deleted.push(value)
    }
  };
  await recordRecentActivity(tx, {
    novelId: "novel-a", eventType: "scene-edited", entityType: "scene", entityId: "scene-a",
    label: "  Edited\nscene   Opening  "
  });
  assert.equal(calls.create.length, 0);
  assert.equal(calls.update.length, 1);
  assert.equal(calls.update[0].data.label, "Edited scene Opening");
  assert.equal(calls.update[0].data.content, undefined);
  assert.deepEqual(calls.deleted, []);
});

test("Recent Activity is novel-scoped, bounded, and navigates only live canonical targets", () => {
  const db = readFileSync(new URL("../lib/db/studio.ts", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  const view = readFileSync(new URL("../components/studio/recent-activity.tsx", import.meta.url), "utf8");

  assert.match(schema, /model RecentActivity/);
  assert.match(schema, /@@index\(\[novelId, createdAt\]\)/);
  assert.match(db, /prisma\.recentActivity\.findMany\(\{ where: \{ novelId: scopedNovelId \}.*take: recentActivityLimit/);
  assert.match(view, /data\.recentActivities\.filter\(isRenderableActivity\)\.slice\(0, 10\)/);
  assert.match(view, /scene\.archived \? routeForPage\("structure"/);
  assert.match(view, /: null;$/m);
  assert.doesNotMatch(view, /fetch\(|notion|token|payload/i);
});

test("Activity writers only use bounded labels and canonical local transactions", () => {
  const studio = readFileSync(new URL("../lib/db/studio.ts", import.meta.url), "utf8");
  const structure = readFileSync(new URL("../lib/db/structure.ts", import.meta.url), "utf8");
  const places = readFileSync(new URL("../lib/db/places.ts", import.meta.url), "utf8");
  const activity = readFileSync(new URL("../lib/db/recent-activity.ts", import.meta.url), "utf8");

  for (const event of ["scene-edited", "character-added", "character-updated", "structure-created", "structure-moved", "place-added", "place-updated"]) {
    assert.match(`${studio}\n${structure}\n${places}`, new RegExp(`eventType: "${event}"`));
  }
  assert.match(activity, /sceneEditCoalesceMs/);
  assert.match(activity, /retentionLimit = 80/);
  assert.doesNotMatch(activity, /fetch\(|from [^\n]*notion/i);
});
