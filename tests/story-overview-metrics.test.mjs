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

test("Story Overview derives structural metrics from scene metadata, including zero values", () => {
  const { storyOverviewMetrics } = transpiledExports("../lib/story-overview-metrics.ts");
  const metrics = storyOverviewMetrics({
    volumes: [{ id: "v1" }, { id: "v2" }],
    chapters: [{ id: "c1" }, { id: "c2" }, { id: "c3" }],
    scenes: [{ id: "s1", wordCount: 120 }, { id: "s2", wordCount: 80 }, { id: "s3", wordCount: 0 }]
  });

  assert.deepEqual(metrics, { wordCount: 200, volumeCount: 2, chapterCount: 3, sceneCount: 3 });
  assert.deepEqual(storyOverviewMetrics({ volumes: [], chapters: [], scenes: [] }), {
    wordCount: 0,
    volumeCount: 0,
    chapterCount: 0,
    sceneCount: 0
  });
});

test("Story Overview is compact, route-driven, and uses a scoped metadata-only snapshot", () => {
  const overview = readFileSync(new URL("../components/studio/novel-overview-screen.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/studio/route.ts", import.meta.url), "utf8");
  const db = readFileSync(new URL("../lib/db/studio.ts", import.meta.url), "utf8");

  assert.match(overview, /storyOverviewMetrics\(data\)/);
  assert.match(overview, /getDailyWritingMetrics\([\s\S]*data\.writingActivities/);
  assert.match(overview, /dailyWriting\.dailyGoal !== null && dailyWriting\.progressPercent !== null/);
  assert.match(overview, /data\.overviewNotesCount/);
  assert.match(overview, /routeForPage\(item\.page, currentNovel\.id\)/);
  for (const pageId of ["characters", "places", "relationships", "timeline", "notes"]) {
    assert.match(overview, new RegExp(`page: "${pageId}" as const`));
  }
  assert.match(overview, /routeForPage\("structure", currentNovel\.id\)/);
  assert.doesNotMatch(overview, /Drafted chapters|Revision pass|Character bible|MetricCard/);
  assert.doesNotMatch(overview, /onSelectPage|fetch\(|router\./);
  assert.match(page, /\?surface=overview&novelId=\$\{encodeURIComponent\(activeRoute\.novelId\)\}/);
  assert.match(api, /includeActiveSceneContent: !librarySurface && !overviewSurface/);
  assert.match(api, /novelId: overviewSurface \? requestedNovelId : undefined/);
  assert.match(db, /const scopedNovelId = options\.novelId/);
  assert.match(db, /prisma\.note\.count\(\{ where: \{ novelId: scopedNovelId \} \}\)/);
  assert.match(db, /where: scopedNovelId \? \{ chapter: \{ volume: \{ novelId: scopedNovelId \} \} \} : undefined/);
});
