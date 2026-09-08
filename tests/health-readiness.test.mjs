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
