import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("health readiness probes the required migrated schema, not only SQLite connectivity", () => {
  const source = readFileSync(new URL("../app/api/health/route.ts", import.meta.url), "utf8");

  assert.match(source, /"lastSyncedRevision", "lastSyncedContent", "lastSyncedAt"/);
  assert.match(source, /FROM "NotionMapping" LIMIT 1/);
  assert.match(source, /FROM "SchemaMigration"/);
  assert.match(source, /required database migration has not completed/);
  assert.match(source, /monogatari_readiness_failed/);
  assert.match(source, /status: 503/);
});

test("monitor deep storage diagnostics use rollback-only writes, quick_check, and free-space thresholds", () => {
  const source = readFileSync(new URL("../lib/runtime-monitor.ts", import.meta.url), "utf8");
  assert.match(source, /PRAGMA user_version = user_version/);
  assert.match(source, /monitor rollback/);
  assert.match(source, /PRAGMA quick_check/);
  assert.match(source, /statfs\(runtimeDataDirectory\)/);
  assert.match(source, /percentFree < 5/);
  assert.match(source, /percentFree < 10/);
});

test("monitor runtime diagnostics use bounded self-checks and never expose configuration values", () => {
  const source = readFileSync(new URL("../lib/runtime-monitor.ts", import.meta.url), "utf8");
  assert.match(source, /process\.memoryUsage\(\)/);
  assert.match(source, /setImmediate/);
  assert.match(source, /http:\/\/127\.0\.0\.1:\$\{port\}\/api\/health/);
  assert.match(source, /3_000/);
  assert.match(source, /Missing configuration: \$\{missing\.join/);
  assert.match(source, /values are intentionally not displayed/);
});

test("monitor mapping diagnostics expose backlog categories and rate-limit state without syncing", () => {
  const source = readFileSync(new URL("../lib/runtime-monitor.ts", import.meta.url), "utf8");
  assert.match(source, /Pending Push: \$\{pendingPush\.length\}; Pending Pull: 0; Conflicts:/);
  assert.match(source, /orphaned and \$\{invalid\.length\} invalid mapping/);
  assert.match(source, /getRecentNotionRateLimit/);
  assert.match(source, /Run Sync when ready to create their Notion pages/);
});
