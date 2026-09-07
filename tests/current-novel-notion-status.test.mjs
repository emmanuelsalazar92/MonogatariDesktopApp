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

const { currentNovelNotionStatus } = transpiledExports("../lib/current-novel-notion-status.ts");
const syncedState = {
  novelId: "novel-a",
  configured: true,
  mapped: true,
  isDirty: false,
  revision: 4,
  lastSyncedRevision: 4,
  syncStatus: "idle",
  syncStartedAt: null,
  lastSyncError: null,
  lastNotionSync: "2026-09-06T12:00:00.000Z"
};

test("Current Novel observes only canonical Notion state with safe precedence", () => {
  assert.equal(currentNovelNotionStatus(syncedState, true).kind, "synced");
  assert.equal(currentNovelNotionStatus({ ...syncedState, isDirty: true, revision: 5 }, true).kind, "pending");
  assert.equal(currentNovelNotionStatus({ ...syncedState, syncStatus: "syncing" }, true).kind, "syncing");
  assert.equal(currentNovelNotionStatus({ ...syncedState, syncStatus: "remote-changes" }, true).kind, "remote-changes");
  assert.equal(currentNovelNotionStatus({ ...syncedState, syncStatus: "error" }, true).kind, "error");
  assert.equal(currentNovelNotionStatus(syncedState, true, true).kind, "conflict");
  assert.equal(currentNovelNotionStatus(syncedState, false).kind, "not-configured");
  assert.equal(currentNovelNotionStatus(undefined, true).kind, "local-only");
  assert.equal(currentNovelNotionStatus({ ...syncedState, mapped: false }, true).kind, "local-only");
});

test("Current Novel has one non-technical sync CTA per canonical state and starts nothing on render", () => {
  const overview = readFileSync(new URL("../components/studio/novel-overview-screen.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(overview, /currentNovelNotionStatus\(notionSyncState, notionRootConfigured, hasNotionConflict\)/);
  assert.match(overview, /Syncing with Notion… You can keep writing\./);
  assert.match(overview, /Review changes/);
  assert.match(overview, /Review conflict/);
  assert.match(overview, /Last successful sync/);
  assert.doesNotMatch(overview, /Sync with Notion|Update from Notion|onPublishToNotion|onPullFromNotion|notionPublishState|notionAutosyncStatus|fetch\(|useEffect|setInterval|setTimeout/);
  assert.match(page, /onSyncNow=\{\(\) => void publishCurrentNovelToNotion\(\)\}/);
  assert.match(page, /onReviewNotionChanges=\{\(\) => void pullCurrentNovelFromNotion\(\)\}/);
});
