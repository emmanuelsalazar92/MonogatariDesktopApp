import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function transpiledExports(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const exports = {};
  new Function("exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(exports);
  return exports;
}

const { getDailyWritingMetrics } = transpiledExports("../lib/writing-metrics.ts");

test("daily goal percentage is deterministic only with an explicit positive denominator", () => {
  const now = new Date(2026, 8, 6, 15, 0, 0);
  const today = new Date(2026, 8, 6, 9, 0, 0).toISOString();
  const yesterday = new Date(2026, 8, 5, 20, 0, 0).toISOString();
  const activities = [
    { id: "1", novelId: "n", sceneId: "s1", wordDelta: 500, createdAt: today },
    { id: "2", novelId: "n", sceneId: "s2", wordDelta: 100, createdAt: today },
    { id: "3", novelId: "n", sceneId: "s1", wordDelta: 900, createdAt: yesterday }
  ];

  assert.deepEqual(getDailyWritingMetrics(activities, 1500, now), {
    wordsToday: 600,
    dailyGoal: 1500,
    progressPercent: 40,
    scenesTouched: 2,
    estimatedWritingMinutes: 30
  });
});

test("missing, zero, or invalid daily goals omit percentage and never divide by zero", () => {
  const now = new Date(2026, 8, 6, 15, 0, 0);
  const activities = [{ id: "1", novelId: "n", sceneId: "s", wordDelta: 0, createdAt: now.toISOString() }];
  for (const goal of [undefined, 0, -50, Number.NaN]) {
    const metrics = getDailyWritingMetrics(activities, goal, now);
    assert.equal(metrics.dailyGoal, null);
    assert.equal(metrics.progressPercent, null);
    assert.equal(metrics.wordsToday, 0);
  }
});
