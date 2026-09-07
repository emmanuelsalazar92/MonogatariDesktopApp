import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function studioDataModule() {
  const source = read("lib/studio-data.ts");
  const exports = {};
  new Function("require", "exports", ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  }).outputText)(
    (id) => id === "@/lib/character-relationship" ? { relationshipSummary: (value) => value } : {},
    exports
  );
  return exports;
}

test("partial legacy overview data degrades metadata and Activity safely", () => {
  const { normalizeStudioData } = studioDataModule();
  const data = normalizeStudioData({
    novels: [{
      id: "novel-a", title: null, synopsis: null, status: "legacy", coverImage: null,
      genre: null, tags: null, wordCount: Number.NaN, createdAt: null, updatedAt: null
    }],
    recentActivities: [
      { id: "bad", novelId: "novel-a", label: "Broken date", createdAt: "not-a-date" },
      { id: "good", novelId: "novel-a", label: "Edited opening", createdAt: "2026-09-06T12:00:00.000Z" }
    ],
    settings: { activeNovelId: "novel-a", unsafe: 42 },
    notionSyncStates: [null, { novelId: "novel-a", syncStatus: "unknown", isDirty: "yes" }]
  });

  assert.deepEqual(data.novels[0], {
    id: "novel-a", title: "Untitled novel", synopsis: "", status: "Idea", coverImage: "",
    genre: "", tags: [], wordCount: 0, createdAt: "", updatedAt: ""
  });
  assert.deepEqual(data.recentActivities.map((activity) => activity.id), ["good"]);
  assert.deepEqual(data.settings, { activeNovelId: "novel-a" });
  assert.equal(data.notionSyncStates[0].syncStatus, "idle");
  assert.equal(data.notionSyncStates[0].isDirty, false);
});

test("overview keeps local rendering independent from Activity and remote sync", () => {
  const db = read("lib/db/studio.ts");
  const overview = read("components/studio/novel-overview-screen.tsx");
  const activity = read("components/studio/recent-activity.tsx");
  const api = read("app/api/studio/route.ts");

  assert.match(db, /recentActivity\.findMany\([^\n]+\.catch\(\(\) => \[\]\)/);
  assert.match(db, /take: recentActivityLimit/);
  assert.match(activity, /filter\(isRenderableActivity\)\.slice\(0, 10\)/);
  assert.match(activity, /Number\.isFinite\(new Date\(activity\.createdAt\)\.getTime\(\)\)/);
  assert.doesNotMatch(`${overview}\n${activity}`, /fetch\(|notion.*token|token.*notion/i);
  assert.match(api, /includeActiveSceneContent: !librarySurface && !overviewSurface/);
});

test("stale or archived overview routes return to Library and preserve keyboard/responsive safeguards", () => {
  const page = read("app/page.tsx");
  const route = read("app/novels/[novelId]/page.tsx");
  const overview = read("components/studio/novel-overview-screen.tsx");
  const shared = read("components/studio/shared.tsx");
  const css = read("app/globals.css");

  assert.match(page, /novel\.id === routeNovelId && novel\.status !== "Archived"/);
  assert.match(page, /router\.replace\("\/library"\)/);
  assert.match(route, /redirect\("\/library"\)/);
  assert.match(overview, /focus-visible:ring-2 focus-visible:ring-ring/);
  assert.match(overview, /flex-wrap/);
  assert.match(shared, /safeCoverImage\.startsWith\("\/"\)/);
  assert.match(css, /overflow-x: clip/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(css, /prefers-color-scheme|darkMode|\.dark\s*\{/);
});
